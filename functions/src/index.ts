import * as admin from "firebase-admin";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
const PLATFORM_FEE_RATE = Number(process.env.PLATFORM_FEE_RATE ?? 0.1);

function calculateServiceFee(amount: number) {
  return Math.round(Math.max(0, amount) * PLATFORM_FEE_RATE);
}

function requireAuth(uid?: string) {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
}

async function assertAdmin(uid: string) {
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.role !== "admin") throw new HttpsError("permission-denied", "Admin role required.");
}

async function assertEmailVerified(uid: string) {
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.emailVerified !== true) {
    throw new HttpsError("failed-precondition", "Please verify your email before using this feature.");
  }
}

export const requestDeposit = onCall(async request => {
  requireAuth(request.auth?.uid);
  throw new HttpsError("failed-precondition", "Deposits have been removed. Clients pay workers directly outside the platform.");
});

export const reviewVerification = onCall(async request => {
  requireAuth(request.auth?.uid);
  await assertAdmin(request.auth!.uid);
  const { userId, status, rejectionReason } = request.data as { userId: string; status: "approved" | "rejected"; rejectionReason?: string };
  if (!["approved", "rejected"].includes(status)) throw new HttpsError("invalid-argument", "Invalid verification status.");
  await db.runTransaction(async tx => {
    tx.update(db.doc(`verifications/${userId}`), { status, addressVerificationStatus: status, rejectionReason: rejectionReason ?? null, reviewedBy: request.auth!.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(db.doc(`users/${userId}`), { verificationStatus: status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.create(db.collection("notifications").doc(), {
      userId,
      title: status === "approved" ? "Verification approved" : "Verification rejected",
      body: status === "approved" ? "Your Temp account is verified." : rejectionReason ?? "Please resubmit your verification details.",
      read: false,
      href: "/settings",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

export const reviewKyc = reviewVerification;

export const setAdminRole = onCall(async request => {
  requireAuth(request.auth?.uid);
  await assertAdmin(request.auth!.uid);
  const { userId, enabled } = request.data as { userId: string; enabled: boolean };
  await admin.auth().setCustomUserClaims(userId, { admin: enabled });
  await db.doc(`users/${userId}`).set({ role: enabled ? "admin" : "client", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const acceptApplication = onCall(async request => {
  requireAuth(request.auth?.uid);
  await assertEmailVerified(request.auth!.uid);
  const { applicationId } = request.data as { applicationId?: string };
  if (!applicationId) throw new HttpsError("invalid-argument", "Application is required.");
  const applicationRef = db.doc(`applications/${applicationId}`);
  await db.runTransaction(async tx => {
    const applicationSnapshot = await tx.get(applicationRef);
    const application = applicationSnapshot.data();
    if (!application || application.clientId !== request.auth!.uid) throw new HttpsError("permission-denied", "Only the client can accept this application.");
    if (application.status !== "pending") throw new HttpsError("failed-precondition", "This application is no longer pending.");
    const jobRef = db.doc(`jobs/${application.jobId}`);
    const jobSnapshot = await tx.get(jobRef);
    const job = jobSnapshot.data();
    if (!job || job.clientId !== request.auth!.uid || job.status !== "open") throw new HttpsError("failed-precondition", "This job is no longer open.");
    const conversationId = `${application.jobId}_${application.workerId}`;
    tx.update(applicationRef, { status: "accepted", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(jobRef, { status: "live", assignedWorkerId: application.workerId, hiredWorkerId: application.workerId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.set(db.doc(`messages/${conversationId}`), {
      id: conversationId,
      jobId: application.jobId,
      clientId: application.clientId,
      workerId: application.workerId,
      locked: false,
      participants: [application.clientId, application.workerId],
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

export const completeMpesaJob = onCall(async request => {
  requireAuth(request.auth?.uid);
  throw new HttpsError("failed-precondition", "Platform payouts have been removed. Clients pay workers directly outside the platform.");
});

export const markPaidInCash = onCall(async request => {
  requireAuth(request.auth?.uid);
  await assertEmailVerified(request.auth!.uid);
  const { jobId } = request.data as { jobId: string };
  const jobRef = db.doc(`jobs/${jobId}`);
  await db.runTransaction(async tx => {
    const jobSnap = await tx.get(jobRef);
    const job = jobSnap.data();
    if (!job || job.clientId !== request.auth!.uid) throw new HttpsError("permission-denied", "Only the client can complete this job.");
    const workerId = job.assignedWorkerId ?? job.hiredWorkerId;
    if (!workerId) throw new HttpsError("failed-precondition", "No hired worker.");
    const serviceFee = calculateServiceFee(Number(job.payAmount ?? job.rateAmount ?? 0));
    tx.update(jobRef, { status: "completed", paymentType: "cash", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.set(db.doc(`messages/${jobId}_${workerId}`), {
      locked: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    tx.update(db.doc(`users/${workerId}`), {
      isLocked: true,
      lockReason: `KES ${serviceFee} service fee required.`,
      outstandingServiceFee: admin.firestore.FieldValue.increment(serviceFee),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    tx.create(db.collection("service_fee_payments").doc(), {
      workerId,
      workerName: job.workerName ?? null,
      username: job.workerUsername ?? null,
      jobId,
      status: "payment_pending_verification",
      amount: serviceFee,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

export const payOutstandingFee = onCall(async request => {
  requireAuth(request.auth?.uid);
  throw new HttpsError("failed-precondition", "Fee settlement requires a reconciled server payment.");
});

export const mpesaCallback = onRequest(async (req, res) => {
  logger.info("M-Pesa callback", req.body);
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

export const notifyOnNotificationCreate = onDocumentCreated("notifications/{notificationId}", async event => {
  const notification = event.data?.data();
  if (!notification?.userId) return;
  const user = await db.doc(`users/${notification.userId}`).get();
  const token = user.data()?.fcmToken;
  if (!token) return;
  await messaging.send({
    token,
    notification: { title: notification.title, body: notification.body },
    webpush: { fcmOptions: { link: notification.href ?? "/notifications" } }
  });
});

export const alertMatchingWorkersOnJobCreate = onDocumentCreated("jobs/{jobId}", async event => {
  const job = event.data?.data();
  if (!job || job.status !== "open") return;
  const workers = await db.collection("users")
    .where("role", "==", "worker")
    .where("skills", "array-contains-any", Array.isArray(job.requiredSkills) && job.requiredSkills.length ? job.requiredSkills.slice(0, 10) : [job.category])
    .limit(50)
    .get();
  const batch = db.batch();
  workers.docs.forEach(worker => {
    batch.create(db.collection("notifications").doc(), {
      userId: worker.id,
      title: "Recommended job",
      body: `${job.title} matches your skills in ${job.category}.`,
      read: false,
      href: `/jobs/${event.params.jobId}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    batch.create(db.collection("activities").doc(), {
      userId: worker.id,
      role: "worker",
      type: "job_recommended",
      title: "New matching job",
      description: `${job.title} is available in ${job.category}.`,
      relatedId: event.params.jobId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  batch.create(db.collection("adminLogs").doc(), {
    action: "JOB_MATCH_ALERTS_CREATED",
    jobId: event.params.jobId,
    count: workers.size,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
});

export const auditUserUpdates = onDocumentUpdated("users/{userId}", async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.isLocked === after.isLocked && before.verificationStatus === after.verificationStatus && before.role === after.role) return;
  await db.collection("adminLogs").add({
    action: "USER_SECURITY_STATE_CHANGED",
    userId: event.params.userId,
    before: { role: before.role, isLocked: before.isLocked, verificationStatus: before.verificationStatus },
    after: { role: after.role, isLocked: after.isLocked, verificationStatus: after.verificationStatus },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
});

export const updateBadgesOnJobCompletion = onDocumentUpdated("jobs/{jobId}", async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const workerId = after?.assignedWorkerId ?? after?.hiredWorkerId;
  if (before?.status === after?.status || after?.status !== "completed" || !workerId) return;
  const userRef = db.doc(`users/${workerId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(userRef);
    const data = snap.data();
    const completedJobs = Number(data?.completedJobs ?? 0) + 1;
    const badges = new Set<string>(data?.badges ?? []);
    if (completedJobs >= 3) {
      badges.delete("Trial Worker");
      badges.add("Trusted Worker");
    }
    tx.update(userRef, { completedJobs, badges: Array.from(badges), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
});
