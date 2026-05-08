import * as admin from "firebase-admin";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
const PLATFORM_FEE_RATE = 0.142857;

function requireAuth(uid?: string) {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
}

function fee(amount: number) {
  return Math.round(amount * PLATFORM_FEE_RATE);
}

async function assertAdmin(uid: string) {
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.role !== "admin") throw new HttpsError("permission-denied", "Admin role required.");
}

export const reviewKyc = onCall(async request => {
  requireAuth(request.auth?.uid);
  await assertAdmin(request.auth!.uid);
  const { userId, status, rejectionReason } = request.data as { userId: string; status: "verified" | "rejected"; rejectionReason?: string };
  if (!["verified", "rejected"].includes(status)) throw new HttpsError("invalid-argument", "Invalid KYC status.");
  await db.runTransaction(async tx => {
    tx.update(db.doc(`kyc/${userId}`), { status, rejectionReason: rejectionReason ?? null, reviewedBy: request.auth!.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(db.doc(`users/${userId}`), { kycStatus: status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.create(db.collection("notifications").doc(), {
      userId,
      title: status === "verified" ? "KYC approved" : "KYC rejected",
      body: status === "verified" ? "Your Temp account is verified." : rejectionReason ?? "Please resubmit your KYC.",
      read: false,
      href: "/settings",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

export const setAdminRole = onCall(async request => {
  requireAuth(request.auth?.uid);
  await assertAdmin(request.auth!.uid);
  const { userId, enabled } = request.data as { userId: string; enabled: boolean };
  await admin.auth().setCustomUserClaims(userId, { admin: enabled });
  await db.doc(`users/${userId}`).set({ role: enabled ? "admin" : "client", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const completeMpesaJob = onCall(async request => {
  requireAuth(request.auth?.uid);
  const { jobId, amount, mpesaReceipt } = request.data as { jobId: string; amount: number; mpesaReceipt: string };
  const jobRef = db.doc(`jobs/${jobId}`);
  await db.runTransaction(async tx => {
    const jobSnap = await tx.get(jobRef);
    const job = jobSnap.data();
    if (!job || job.clientId !== request.auth!.uid) throw new HttpsError("permission-denied", "Only the client can complete this job.");
    if (!job.hiredWorkerId) throw new HttpsError("failed-precondition", "No hired worker.");
    const serviceFee = fee(amount);
    const net = amount - serviceFee;
    tx.update(jobRef, { status: "completed", paymentType: "mpesa", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(db.doc(`wallets/${job.hiredWorkerId}`), { balance: admin.firestore.FieldValue.increment(net), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.create(db.collection("transactions").doc(), {
      userId: job.hiredWorkerId,
      jobId,
      type: "wallet_credit",
      status: "succeeded",
      amount: net,
      serviceFee,
      paymentType: "mpesa",
      mpesaReceipt,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    tx.create(db.collection("notifications").doc(), {
      userId: job.hiredWorkerId,
      title: "Payment received",
      body: `KES ${net} was credited to your Temp wallet.`,
      read: false,
      href: "/wallet",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

export const markPaidInCash = onCall(async request => {
  requireAuth(request.auth?.uid);
  const { jobId, amount } = request.data as { jobId: string; amount: number };
  const jobRef = db.doc(`jobs/${jobId}`);
  await db.runTransaction(async tx => {
    const jobSnap = await tx.get(jobRef);
    const job = jobSnap.data();
    if (!job || job.clientId !== request.auth!.uid) throw new HttpsError("permission-denied", "Only the client can complete this job.");
    if (!job.hiredWorkerId) throw new HttpsError("failed-precondition", "No hired worker.");
    const serviceFee = fee(amount);
    tx.update(jobRef, { status: "completed", paymentType: "cash", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(db.doc(`users/${job.hiredWorkerId}`), {
      isLocked: true,
      lockReason: `KES ${serviceFee} service fee required.`,
      outstandingServiceFee: admin.firestore.FieldValue.increment(serviceFee),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    tx.update(db.doc(`wallets/${job.hiredWorkerId}`), { outstandingServiceFee: admin.firestore.FieldValue.increment(serviceFee), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.create(db.collection("transactions").doc(), {
      userId: job.hiredWorkerId,
      jobId,
      type: "cash_fee",
      status: "pending",
      amount: serviceFee,
      paymentType: "cash",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

export const payOutstandingFee = onCall(async request => {
  requireAuth(request.auth?.uid);
  const { amount, mpesaReceipt } = request.data as { amount: number; mpesaReceipt: string };
  const userId = request.auth!.uid;
  await db.runTransaction(async tx => {
    const userRef = db.doc(`users/${userId}`);
    const walletRef = db.doc(`wallets/${userId}`);
    const userSnap = await tx.get(userRef);
    const outstanding = Number(userSnap.data()?.outstandingServiceFee ?? 0);
    if (amount < outstanding) throw new HttpsError("failed-precondition", "Outstanding service fee is not fully paid.");
    tx.update(userRef, { isLocked: false, lockReason: null, outstandingServiceFee: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(walletRef, { outstandingServiceFee: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.create(db.collection("transactions").doc(), {
      userId,
      type: "service_fee",
      status: "succeeded",
      amount,
      mpesaReceipt,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
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
  if (before.isLocked === after.isLocked && before.kycStatus === after.kycStatus && before.role === after.role) return;
  await db.collection("adminLogs").add({
    action: "USER_SECURITY_STATE_CHANGED",
    userId: event.params.userId,
    before: { role: before.role, isLocked: before.isLocked, kycStatus: before.kycStatus },
    after: { role: after.role, isLocked: after.isLocked, kycStatus: after.kycStatus },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
});

export const updateBadgesOnJobCompletion = onDocumentUpdated("jobs/{jobId}", async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (before?.status === after?.status || after?.status !== "completed" || !after?.hiredWorkerId) return;
  const userRef = db.doc(`users/${after.hiredWorkerId}`);
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
