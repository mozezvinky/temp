import { isSqlBackend } from "@/lib/data-backend";
import { getCurrentUserProfile } from "@/lib/current-user-profile";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { createLocalDirectHireRequest, getLocalUser, respondLocalDirectHireRequest } from "@/lib/local-sql";
import { sendNotificationEmailsAfterCommit, setNotification } from "@/lib/notifications-server";
import { getWorkerEligibilityFromVerification, getWorkerJobEligibility, getWorkerVerificationStatusFromRecords } from "@/lib/worker-verification";
import type { WorkerSkillProfile } from "@/types";
import { calculateDirectHirePricing, resolveSkillPricingType, resolveSkillUnit } from "@/utils/direct-hire-pricing";
import { clientCanPost } from "@/utils/jobRules";
import { normalizeLocationFields, locationRequiresDescription } from "@/utils/location-fields";
import { jobLocationLabel } from "@/utils/location-display";
import { normalizeSkillVerificationStatus } from "@/utils/worker-skills";
import { normalizeVerificationStatus } from "@/utils/verification";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const activeMode = activeRoleFromRequest(request);
    if (activeMode === "worker") return NextResponse.json({ error: "Switch to client mode before sending hire requests." }, { status: 403 });
    const currentUser = await getCurrentUserProfile(request, activeMode === "client" ? "client" : null);
    const decoded = currentUser.decoded;
    const body = await request.json().catch(() => ({}));
    const input = normalizeRequest(body);
    if (!input.workerId || !input.skillId || !input.title || !input.category || !input.location || !input.locationDetails || !input.startDate || !input.duration) {
      return NextResponse.json({ error: "Complete the direct hire request details." }, { status: 400 });
    }
    const locationDetails = input.locationDetails;
    if (locationRequiresDescription(locationDetails)) return NextResponse.json({ error: "Add a location description because no nearby landmark was found." }, { status: 400 });
    if (input.workerId === decoded.uid) return NextResponse.json({ error: "You cannot hire yourself." }, { status: 400 });

    if (isSqlBackend()) {
      const client = currentUser.profile ?? getLocalUser(decoded.uid);
      if (!canUseClientMode(client, currentUser.role, activeMode)) return NextResponse.json({ error: "Use client mode to send hire requests." }, { status: 403 });
      const localClient = client as NonNullable<typeof client>;
      if (!clientCanPost(localClient)) return NextResponse.json({ error: "Verify your identity before posting jobs." }, { status: 403 });
      const allowedWorker = await getWorkerJobEligibility(input.workerId, { title: input.title, category: input.category, requiredSkills: [] });
      if (allowedWorker.decision === "blocked") return NextResponse.json({ error: allowedWorker.reason }, { status: 403 });
      const savedSkill = selectedWorkerSkill(getLocalUser(input.workerId)?.skillProfiles, input.skillId);
      if (!savedSkill) return NextResponse.json({ error: "Choose a verified worker skill." }, { status: 400 });
      const pricing = calculateVerifiedPricing(savedSkill, input.quantity);
      const application = createLocalDirectHireRequest({
        id: crypto.randomUUID(),
        jobId: crypto.randomUUID(),
        clientId: localClient.id,
        clientName: localClient.displayName,
        ...input,
        locationDetails,
        skillName: savedSkill.name,
        pricing
      });
      return NextResponse.json({ success: true, request: application });
    }

    const db = adminDb();
    const [clientSnap, workerSnap, clientVerificationSnap] = await Promise.all([
      db.collection("users").doc(decoded.uid).get(),
      db.collection("users").doc(input.workerId).get(),
      db.collection("verifications").doc(decoded.uid).get()
    ]);
    const client = clientSnap.data();
    const worker = workerSnap.data();
    if (!clientSnap.exists || !canUseClientMode(client, currentUser.role, activeMode)) return NextResponse.json({ error: "Use client mode to send hire requests." }, { status: 403 });
    const clientVerificationStatus = normalizeVerificationStatus(clientVerificationSnap.data()?.identityVerificationStatus ?? clientVerificationSnap.data()?.status);
    const effectiveClient: Record<string, unknown> = {
      ...client,
      verificationStatus: clientVerificationStatus !== "not_submitted" ? clientVerificationStatus : client?.verificationStatus
    };
    if (!clientCanPost(effectiveClient as { verificationStatus?: "not_submitted" | "pending" | "approved" | "rejected" } | null)) return NextResponse.json({ error: "Verify your identity before posting jobs." }, { status: 403 });
    if (!workerSnap.exists || !hasRole(worker, "worker")) return NextResponse.json({ error: "Choose a valid worker." }, { status: 404 });
    const allowedWorker = await getWorkerJobEligibility(input.workerId, { title: input.title, category: input.category, requiredSkills: [] });
    if (allowedWorker.decision === "blocked") return NextResponse.json({ error: allowedWorker.reason }, { status: 403 });
    const savedSkill = selectedWorkerSkill(Array.isArray(worker?.skillProfiles) ? worker.skillProfiles as WorkerSkillProfile[] : [], input.skillId);
    if (!savedSkill) return NextResponse.json({ error: "Choose a verified worker skill." }, { status: 400 });
    const pricing = calculateVerifiedPricing(savedSkill, input.quantity);
    const activeSnap = await db.collection("applications").where("workerId", "==", input.workerId).limit(40).get();
    const activeApps = activeSnap.docs.filter(doc => ["accepted", "completion_requested", "payment_sent"].includes(String(doc.data().status)));
    if (activeApps.length) return NextResponse.json({ error: "This worker is occupied on another job right now." }, { status: 400 });

    const jobRef = db.collection("jobs").doc();
    const applicationRef = db.collection("applications").doc();
    const notification = {
      userId: input.workerId,
      type: "direct_hire_received",
      title: "Direct hire request",
      message: `${String(effectiveClient.displayName ?? "A client")} sent you a direct hire request for ${input.title} in ${input.locationLabel}.`,
      link: "/dashboard",
      emailSubject: "Direct hire request on COPIC",
      eventId: `direct-hire:${applicationRef.id}:created`
    };
    const payload = {
      id: applicationRef.id,
      jobId: jobRef.id,
      workerId: input.workerId,
      clientId: decoded.uid,
      jobTitle: input.title,
      jobCategory: input.category,
      coverNote: "Direct hire request",
      source: "direct_hire",
      requestLocation: input.location,
      requestLocationDetails: input.locationDetails,
      requestStartDate: input.startDate,
      requestDuration: input.duration,
      requestDescription: input.description,
      requestSkillId: savedSkill.id,
      requestSkillName: savedSkill.name,
      requestPricing: pricing,
      jobAmount: pricing.total,
      grossAmount: pricing.total,
      workerEarnings: pricing.subtotal,
      serviceFeeAmount: pricing.serviceFee,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    const batch = db.batch();
    batch.set(jobRef, {
      id: jobRef.id,
      clientId: decoded.uid,
      clientName: String(effectiveClient.displayName ?? "Client"),
      createdBy: decoded.uid,
      title: input.title,
      description: input.description,
      category: input.category,
      location: input.location,
      county: "",
      locationDetails: input.locationDetails,
      payAmount: pricing.total,
      payType: pricing.pricingType === "timeline" ? "timeline" : "fixed",
      duration: input.duration,
      workersNeeded: 1,
      quantity: pricing.quantity,
      unit: pricing.unit,
      customUnit: null,
      requiredSkills: [savedSkill.name],
      applicants: [],
      assignedWorkerId: null,
      status: "pending",
      rateType: pricing.pricingType,
      rateAmount: pricing.rateAmount,
      grossAmount: pricing.total,
      workerEarnings: pricing.subtotal,
      serviceFeeAmount: pricing.serviceFee,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    batch.set(applicationRef, payload);
    setNotification(batch, db, notification);
    await batch.commit();
    await sendNotificationEmailsAfterCommit(db, [notification]);
    return NextResponse.json({ success: true, request: payload });
  } catch (error) {
    const status = error instanceof AuthRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to send direct hire request.";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const decoded = await requireDecodedUser(request);
    const body = await request.json().catch(() => ({}));
    const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
    const response = body.response === "accept" ? "accept" : body.response === "reject" ? "reject" : "";
    if (!applicationId || !response) return NextResponse.json({ error: "Choose a request to update." }, { status: 400 });

    if (isSqlBackend()) {
      const worker = getLocalUser(decoded.uid);
      if (!worker || worker.role !== "worker") return NextResponse.json({ error: "Use a worker account to answer hire requests." }, { status: 403 });
      const application = respondLocalDirectHireRequest(applicationId, decoded.uid, response);
      if (!application) return NextResponse.json({ error: "Hire request was not found." }, { status: 404 });
      return NextResponse.json({ success: true, request: application });
    }

    const db = adminDb();
    const applicationRef = db.collection("applications").doc(applicationId);
    let notification: {
      userId: string;
      type: string;
      title: string;
      message: string;
      link: string;
      emailSubject: string;
      eventId: string;
    } | null = null;
    const result = await db.runTransaction(async transaction => {
      const applicationSnap = await transaction.get(applicationRef);
      if (!applicationSnap.exists) throw new AuthRouteError("Hire request was not found.", 404);
      const application = applicationSnap.data() ?? {};
      if (application.workerId !== decoded.uid) throw new AuthRouteError("You can only answer your own hire requests.", 403);
      if (application.source !== "direct_hire") throw new AuthRouteError("This is not a direct hire request.", 400);
      if (application.status !== "pending") throw new AuthRouteError("This request has already been answered.", 400);
      if (response === "accept") {
        const [workerSnap, identityVerificationSnap, driverLicenseVerificationSnap] = await Promise.all([
          transaction.get(db.collection("users").doc(decoded.uid)),
          transaction.get(db.collection("verifications").doc(decoded.uid)),
          transaction.get(db.collection("verifications").doc(`driver-license-${decoded.uid}`))
        ]);
        const allowedWorker = getWorkerEligibilityFromVerification(getWorkerVerificationStatusFromRecords(
          decoded.uid,
          workerSnap.exists ? workerSnap.data() : null,
          identityVerificationSnap.exists ? identityVerificationSnap.data() : null,
          driverLicenseVerificationSnap.exists ? driverLicenseVerificationSnap.data() : null
        ), {
          title: String(application.jobTitle ?? ""),
          category: String(application.jobCategory ?? ""),
          requiredSkills: []
        });
        if (allowedWorker.decision === "blocked") throw new AuthRouteError(allowedWorker.reason, 403);
      }
      const jobRef = db.collection("jobs").doc(String(application.jobId));
      const jobSnap = await transaction.get(jobRef);
      if (!jobSnap.exists) throw new AuthRouteError("Job was not found.", 404);
      const status = response === "accept" ? "accepted" : "rejected";
      transaction.set(applicationRef, { status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(jobRef, { status: response === "accept" ? "live" : "cancelled", assignedWorkerId: response === "accept" ? decoded.uid : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (response === "accept") {
        const conversationRef = db.collection("messages").doc(`${application.jobId}_${application.workerId}`);
        transaction.set(conversationRef, {
          id: conversationRef.id,
          jobId: application.jobId,
          clientId: application.clientId,
          workerId: application.workerId,
          locked: false,
          participants: [application.clientId, application.workerId],
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
      notification = {
        userId: String(application.clientId),
        type: response === "accept" ? "direct_hire_accepted" : "direct_hire_rejected",
        title: response === "accept" ? "Direct hire accepted" : "Direct hire rejected",
        message: response === "accept"
          ? `${application.workerName ?? "The worker"} accepted your direct hire request for ${application.jobTitle ?? "the job"}.`
          : `${application.workerName ?? "The worker"} rejected your direct hire request for ${application.jobTitle ?? "the job"}.`,
        link: response === "accept" ? "/find-work" : "/workers",
        emailSubject: response === "accept" ? "Direct hire accepted on COPIC" : "Direct hire declined on COPIC",
        eventId: `direct-hire:${applicationSnap.id}:${response}`
      };
      setNotification(transaction, db, notification);
      return { id: applicationSnap.id, ...application, status };
    });
    if (notification) await sendNotificationEmailsAfterCommit(db, [notification]);
    return NextResponse.json({ success: true, request: result });
  } catch (error) {
    const status = error instanceof AuthRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to update hire request.";
    return NextResponse.json({ error: message }, { status });
  }
}

async function requireDecodedUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new AuthRouteError("Sign in is required.", 401);
  return adminAuth().verifyIdToken(token);
}

function normalizeRequest(body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const locationDetails = normalizeLocationFields(input.locationDetails);
  const locationLabel = locationDetails ? jobLocationLabel({ location: locationDetails.addressText, county: locationDetails.county, locationDetails }) : String(input.location ?? "").trim();
  return {
    workerId: typeof input.workerId === "string" ? input.workerId : "",
    skillId: typeof input.skillId === "string" ? input.skillId.trim() : "",
    title: typeof input.title === "string" ? input.title.trim() : "",
    category: typeof input.category === "string" ? input.category.trim() : "",
    quantity: Math.max(1, Math.trunc(Number(input.quantity) || 1)),
    location: locationDetails?.addressText ?? (typeof input.location === "string" ? input.location.trim() : ""),
    locationDetails,
    locationLabel,
    startDate: typeof input.startDate === "string" ? input.startDate : "",
    duration: typeof input.duration === "string" ? input.duration.trim() : "",
    description: typeof input.description === "string" ? input.description.trim() : ""
  };
}

function selectedWorkerSkill(skills: WorkerSkillProfile[] | undefined | null, skillId: string) {
  return (skills ?? []).find(skill => skill.id === skillId && normalizeSkillVerificationStatus(skill.verificationStatus) === "approved" && Number(skill.chargeAmount ?? 0) > 0) ?? null;
}

function calculateVerifiedPricing(skill: WorkerSkillProfile, quantity: number) {
  if (resolveSkillPricingType(skill) === "unit" && !resolveSkillUnit(skill)) throw new AuthRouteError("This worker skill does not have a valid pricing unit.", 400);
  return calculateDirectHirePricing(skill, quantity);
}

function activeRoleFromRequest(request: NextRequest) {
  const value = request.headers.get("x-temp-role") ?? request.cookies.get("temp-role")?.value ?? "";
  return value === "client" || value === "worker" || value === "admin" ? value : null;
}

function hasRole(profile: unknown, role: "client" | "worker") {
  if (!profile || typeof profile !== "object") return false;
  const data = profile as { role?: unknown; roles?: unknown };
  return data.role === role || (Array.isArray(data.roles) && data.roles.includes(role));
}

function canUseClientMode(profile: unknown, resolvedRole: string | undefined, activeMode: string | null) {
  const selectedRole = activeMode ?? resolvedRole;
  if (selectedRole !== "client") return false;
  return hasRole(profile, "client") || hasRole(profile, "worker");
}

class AuthRouteError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
