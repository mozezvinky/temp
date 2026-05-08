"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBadgesOnJobCompletion = exports.notifyOnNotificationCreate = exports.mpesaCallback = exports.payOutstandingFee = exports.markPaidInCash = exports.completeMpesaJob = exports.setAdminRole = exports.reviewKyc = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
const PLATFORM_FEE_RATE = 0.142857;
function requireAuth(uid) {
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Sign in required.");
}
function fee(amount) {
    return Math.round(amount * PLATFORM_FEE_RATE);
}
async function assertAdmin(uid) {
    const user = await db.doc(`users/${uid}`).get();
    if (user.data()?.role !== "admin")
        throw new https_1.HttpsError("permission-denied", "Admin role required.");
}
exports.reviewKyc = (0, https_1.onCall)(async (request) => {
    requireAuth(request.auth?.uid);
    await assertAdmin(request.auth.uid);
    const { userId, status, rejectionReason } = request.data;
    if (!["verified", "rejected"].includes(status))
        throw new https_1.HttpsError("invalid-argument", "Invalid KYC status.");
    await db.runTransaction(async (tx) => {
        tx.update(db.doc(`kyc/${userId}`), { status, rejectionReason: rejectionReason ?? null, reviewedBy: request.auth.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
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
exports.setAdminRole = (0, https_1.onCall)(async (request) => {
    requireAuth(request.auth?.uid);
    await assertAdmin(request.auth.uid);
    const { userId, enabled } = request.data;
    await admin.auth().setCustomUserClaims(userId, { admin: enabled });
    await db.doc(`users/${userId}`).set({ role: enabled ? "admin" : "client", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
});
exports.completeMpesaJob = (0, https_1.onCall)(async (request) => {
    requireAuth(request.auth?.uid);
    const { jobId, amount, mpesaReceipt } = request.data;
    const jobRef = db.doc(`jobs/${jobId}`);
    await db.runTransaction(async (tx) => {
        const jobSnap = await tx.get(jobRef);
        const job = jobSnap.data();
        if (!job || job.clientId !== request.auth.uid)
            throw new https_1.HttpsError("permission-denied", "Only the client can complete this job.");
        if (!job.hiredWorkerId)
            throw new https_1.HttpsError("failed-precondition", "No hired worker.");
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
exports.markPaidInCash = (0, https_1.onCall)(async (request) => {
    requireAuth(request.auth?.uid);
    const { jobId, amount } = request.data;
    const jobRef = db.doc(`jobs/${jobId}`);
    await db.runTransaction(async (tx) => {
        const jobSnap = await tx.get(jobRef);
        const job = jobSnap.data();
        if (!job || job.clientId !== request.auth.uid)
            throw new https_1.HttpsError("permission-denied", "Only the client can complete this job.");
        if (!job.hiredWorkerId)
            throw new https_1.HttpsError("failed-precondition", "No hired worker.");
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
exports.payOutstandingFee = (0, https_1.onCall)(async (request) => {
    requireAuth(request.auth?.uid);
    const { amount, mpesaReceipt } = request.data;
    const userId = request.auth.uid;
    await db.runTransaction(async (tx) => {
        const userRef = db.doc(`users/${userId}`);
        const walletRef = db.doc(`wallets/${userId}`);
        const userSnap = await tx.get(userRef);
        const outstanding = Number(userSnap.data()?.outstandingServiceFee ?? 0);
        if (amount < outstanding)
            throw new https_1.HttpsError("failed-precondition", "Outstanding service fee is not fully paid.");
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
exports.mpesaCallback = (0, https_1.onRequest)(async (req, res) => {
    firebase_functions_1.logger.info("M-Pesa callback", req.body);
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});
exports.notifyOnNotificationCreate = (0, firestore_1.onDocumentCreated)("notifications/{notificationId}", async (event) => {
    const notification = event.data?.data();
    if (!notification?.userId)
        return;
    const user = await db.doc(`users/${notification.userId}`).get();
    const token = user.data()?.fcmToken;
    if (!token)
        return;
    await messaging.send({
        token,
        notification: { title: notification.title, body: notification.body },
        webpush: { fcmOptions: { link: notification.href ?? "/notifications" } }
    });
});
exports.updateBadgesOnJobCompletion = (0, firestore_1.onDocumentUpdated)("jobs/{jobId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (before?.status === after?.status || after?.status !== "completed" || !after?.hiredWorkerId)
        return;
    const userRef = db.doc(`users/${after.hiredWorkerId}`);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.data();
        const completedJobs = Number(data?.completedJobs ?? 0) + 1;
        const badges = new Set(data?.badges ?? []);
        if (completedJobs >= 3) {
            badges.delete("Trial Worker");
            badges.add("Trusted Worker");
        }
        tx.update(userRef, { completedJobs, badges: Array.from(badges), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
});
//# sourceMappingURL=index.js.map