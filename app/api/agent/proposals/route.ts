import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/server-auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { activeAgent } from "@/functions/src/agent-policy";
import { MarketplaceError, validId } from "@/lib/marketplace-server";
import { jobSchema } from "@/utils/validation";
import { FieldValue } from "firebase-admin/firestore";
import { setNotification } from "@/lib/notifications-server";

export async function GET(request: NextRequest) {
  try {
    const user = await requireServerUser(request), db = adminDb(), id = validId(request.nextUrl.searchParams.get("id"));
    const proposal = (await db.doc(`agentJobProposals/${id}`).get()).data();
    if (!proposal || proposal.agentId !== user.uid && proposal.clientUid !== user.uid) throw new MarketplaceError("Proposal not found.", 404);
    return NextResponse.json({ id, ...proposal });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireServerUser(request), body = await request.json(), db = adminDb();
    if (body.action === "reject") {
      const ref = db.doc(`agentJobProposals/${validId(body.id)}`);
      await db.runTransaction(async tx => {
        const proposal = (await tx.get(ref)).data();
        if (!proposal || proposal.clientUid !== user.uid || proposal.status !== "pending" || user.profile.isLocked) throw new MarketplaceError("Only the intended client can reject a pending proposal.", 403);
        tx.update(ref, { status: "rejected", reviewedAt: FieldValue.serverTimestamp() });
      });
      return NextResponse.json({ success: true });
    }
    if (!activeAgent(user.profile)) throw new MarketplaceError("Active agent access required.", 403);
    const data = jobSchema.parse(body.job);
    const email = String(body.clientEmail ?? "").trim().toLowerCase();
    // Do not reveal account details or allow account discovery through this endpoint.
    const client = await adminAuth().getUserByEmail(email).catch(() => null);
    const profile = client ? (await db.doc(`users/${client.uid}`).get()).data() : null;
    if (!client || client.disabled || !profile || profile.role !== "client" || profile.agentEnabled || client.uid === user.uid) throw new MarketplaceError("Ask your client to create a client account and provide its email address.");
    const ref = db.collection("agentJobProposals").doc();
    await db.runTransaction(async tx => {
      const quotaRef = db.doc(`agentProposalLimits/${user.uid}`), quota = (await tx.get(quotaRef)).data();
      const today = new Date().toISOString().slice(0, 10), count = quota?.day === today ? Number(quota.count ?? 0) : 0;
      if (count >= 30) throw new MarketplaceError("Daily proposal limit reached. Try again tomorrow.", 429);
      tx.set(quotaRef, { day: today, count: count + 1 });
      tx.create(ref, { agentId: user.uid, clientUid: client.uid, job: JSON.parse(JSON.stringify(data)), status: "pending", createdAt: FieldValue.serverTimestamp() });
      setNotification(tx, db, { userId: client.uid, type: "agent_job_approval", title: "Review proposed work", message: "An agent prepared a job for your review. You can edit, approve or reject it.", link: `/agent/review/${ref.id}`, eventId: `agent-proposal-${ref.id}` });
    });
    return NextResponse.json({ id: ref.id, url: `/agent/review/${ref.id}` });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof MarketplaceError ? error.message : "Unable to process this proposal. Check your details and verified sign-in." }, { status: error instanceof MarketplaceError ? error.status : 400 });
}
