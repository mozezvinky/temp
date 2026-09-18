import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireServerUser } from "@/lib/server-auth";
import { assertActiveLink, validId, MarketplaceError } from "@/lib/marketplace-server";
import { recordFunnel } from "@/functions/src/marketplace-projections";
import { serviceKey, timestampMillis } from "@/functions/src/marketplace-policy";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import type { WorkerSkillProfile } from "@/types";

function source(request: NextRequest) {
  const id = validId(request.nextUrl.searchParams.get("id"));
  const type = request.nextUrl.searchParams.get("type") === "agent_referral" ? "agent_referral" : "admin_campaign";
  return { id, type, collection: type === "admin_campaign" ? "recruitmentCampaigns" : "agentLinks" };
}
export async function GET(request: NextRequest) {
  try {
    const { id, type, collection } = source(request), doc = await adminDb().doc(`${collection}/${id}`).get();
    const link = doc.data(); assertActiveLink(link);
    return NextResponse.json({ link: { id, sourceType: type, name: link!.name, service: link!.service ?? null, category: link!.category ?? null, rate: type === "admin_campaign" ? link!.rate : null, unit: type === "admin_campaign" ? link!.unit : null, targetLocation: link!.targetLocation ?? null } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const { id, type, collection } = source(request), db = adminDb(), body = await request.json();
    const action = String(body.action ?? "");
    if (["link_clicked", "signup_started"].includes(action)) {
      const link = (await db.doc(`${collection}/${id}`).get()).data(); assertActiveLink(link);
      const oldVisit = request.cookies.get("copic_acquisition_visit")?.value;
      const visitId = oldVisit && /^[a-f0-9-]{36}$/.test(oldVisit) ? oldVisit : randomUUID();
      const visitRef = db.doc(`acquisitionVisits/${visitId}`);
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
      const rateKey = createHash("sha256").update(`${ip}:${new Date().toISOString().slice(0,10)}`).digest("hex");
      await db.runTransaction(async tx => {
        const limitRef = db.doc(`acquisitionRateLimits/${rateKey}`);
        const [visit, limit] = await Promise.all([tx.get(visitRef), tx.get(limitRef)]);
        if (visit.exists && visit.data()?.[`${type}_${id}_${action}`]) return;
        if (Number(limit.data()?.count ?? 0) >= 100) throw new MarketplaceError("Too many link visits. Try again later.", 429);
        tx.set(limitRef, { count: FieldValue.increment(1), expiresAt: new Date(Date.now()+86400000) }, { merge: true });
        tx.set(visitRef, { [`${type}_${id}_${action}`]: true, sourceId: id, sourceType: type, startedAt: visit.data()?.startedAt ?? FieldValue.serverTimestamp(), expiresAt: new Date(Date.now()+7*86400000) }, { merge: true });
        tx.set(db.doc(`acquisitionFunnels/${type}_${id}`), { [action]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (type === "agent_referral") tx.set(db.doc(`agentMetrics/${link!.agentId}`), { [action]: FieldValue.increment(1) }, { merge: true });
      });
      const response = NextResponse.json({ success: true });
      response.cookies.set("copic_acquisition_visit", visitId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7*86400 });
      return response;
    }
    // Read the current Auth record: profile flags and cached token claims can be stale.
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(token);
    const authUser = await adminAuth().getUser(decoded.uid);
    if (!authUser.emailVerified) return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    const user = await requireServerUser(request);
    assertActiveLink((await db.doc(`${collection}/${id}`).get()).data());
    if (action === "attach") {
      const visitId = request.cookies.get("copic_acquisition_visit")?.value;
      const newAccount = await db.runTransaction(async tx => {
        const userRef = db.doc(`users/${user.uid}`), attrRef = db.doc(`acquisitionAttributions/${user.uid}`);
        const [profile, attr, linkSnap, visit] = await Promise.all([tx.get(userRef), tx.get(attrRef), tx.get(db.doc(`${collection}/${id}`)), visitId && /^[a-f0-9-]{36}$/.test(visitId) ? tx.get(db.doc(`acquisitionVisits/${visitId}`)) : Promise.resolve(null)]);
        const link = linkSnap.data(); assertActiveLink(link);
        if (attr.exists) return attr.data()?.newAccount === true; // first legitimate attribution wins
        const isNewAccount = !!visit?.exists && visit.data()?.sourceId === id && visit.data()?.sourceType === type && timestampMillis(visit.data()?.expiresAt) > Date.now() && Date.parse(authUser.metadata.creationTime) >= timestampMillis(visit.data()?.startedAt)-60000;
        if (type === "agent_referral") {
          if (link!.agentId === user.uid || profile.data()?.agentEnabled === true) throw new MarketplaceError("Agents cannot refer themselves or another agent.", 403);
          const agent = await tx.get(db.doc(`users/${validId(link!.agentId)}`));
          if (!agent.data()?.agentEnabled || agent.data()?.isLocked) throw new MarketplaceError("This agent link is unavailable.", 403);
          if (!visit?.exists || visit.data()?.sourceId !== id || visit.data()?.sourceType !== type || timestampMillis(visit.data()?.expiresAt) <= Date.now() || Date.parse(authUser.metadata.creationTime) < timestampMillis(visit.data()?.startedAt)-60000) throw new MarketplaceError("This referral is for newly created accounts. Existing members can still use COPIC.", 409);
          tx.create(db.doc(`agentReferrals/${user.uid}`), { referredWorkerId: user.uid, agentId: link!.agentId, referralLinkId: id, referredAt: FieldValue.serverTimestamp(), source: "agent_referral", serviceId: link!.serviceId ?? null });
        }
        tx.create(attrRef, { sourceType: type, sourceId: id, newAccount: isNewAccount, campaignId: type === "admin_campaign" ? id : null, agentId: type === "agent_referral" ? link!.agentId : null, referredAt: FieldValue.serverTimestamp() });
        return isNewAccount;
      });
      if (newAccount) await recordFunnel(db, user.uid, "account_created");
      return NextResponse.json({ success: true });
    }
    if (action === "add_skill" && type === "admin_campaign") {
      let skillName = "";
      await db.runTransaction(async tx => {
        const userRef = db.doc(`users/${user.uid}`);
        const [campaignSnap, userSnap] = await Promise.all([tx.get(db.doc(`recruitmentCampaigns/${id}`)), tx.get(userRef)]);
        const campaign = campaignSnap.data(); assertActiveLink(campaign);
        const profile = userSnap.data()!;
        if (profile.role === "admin") throw new MarketplaceError("Use a worker account for recruitment.", 403);
        const skillProfiles = (profile.skillProfiles ?? []) as WorkerSkillProfile[];
        skillName = String(campaign!.service);
        const key = serviceKey(skillName), originRef = db.doc(`workerServiceOrigins/${user.uid}_${key}`);
        const origin = await tx.get(originRef);
        const existing = skillProfiles.find(skill => serviceKey(skill.name) === key);
        if (existing || (profile.skills as string[] ?? []).some(name => serviceKey(name) === key)) return;
        if (skillProfiles.length >= 50) throw new MarketplaceError("A profile can have up to 50 services.");
        const rate = Number(origin.data()?.initialRate ?? campaign!.rate), unit = String(origin.data()?.initialUnit ?? campaign!.unit);
        const skill: WorkerSkillProfile = { id: randomUUID(), name: skillName, category: "services_trades", level: "beginner", proofType: "work_photo", verificationStatus: "pending", chargeAmount: rate, chargeUnit: unit, chargePayType: "unit", completedJobs: 0, ratingAverage: 0, ratingCount: 0, sourceType: "recruitment", campaignId: String(origin.data()?.campaignId ?? id), initialRate: rate, initialUnit: unit, priceRestrictionLevel: 1, submittedAt: new Date().toISOString() };
        if (!origin.exists) tx.create(originRef, { workerId: user.uid, serviceId: key, sourceType: "recruitment", campaignId: id, initialRate: rate, initialUnit: unit, createdAt: FieldValue.serverTimestamp() });
        tx.update(userRef, { roles: [...new Set([profile.role, ...(profile.roles ?? []), "worker"])], skillProfiles: [...skillProfiles, skill], skills: [...new Set([...(profile.skills ?? []), skillName])], updatedAt: FieldValue.serverTimestamp() });
      });
      await recordFunnel(db, user.uid, "skill_added");
      return NextResponse.json({ success: true, skill: skillName });
    }
    if (action === "enable_worker") {
      await db.runTransaction(async tx => { const ref = db.doc(`users/${user.uid}`), snapshot = await tx.get(ref); const profile = snapshot.data()!; if (profile.role === "admin") throw new MarketplaceError("Use a worker account.", 403); tx.update(ref, { roles: [...new Set([profile.role, ...(profile.roles ?? []), "worker"])] }); });
      return NextResponse.json({ success: true });
    }
    if (action === "id_verification_started") { await recordFunnel(db, user.uid, "id_verification_started"); return NextResponse.json({ success: true }); }
    throw new MarketplaceError("Unknown recruitment action.");
  } catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to continue recruitment." }, { status: error instanceof MarketplaceError ? error.status : 400 }); }
