import { adminDb } from "@/lib/firebase-admin";
import { adminErrorStatus, requireAdmin, writeAdminAuditLog } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { listLocalOutstandingServiceFeeRequests, listLocalServiceFeePayments, reviewLocalServiceFeePayment } from "@/lib/local-sql";
import type { ServiceFeePayment } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "finance:read");
    if (isSqlBackend()) return NextResponse.json({ payments: [...listLocalServiceFeePayments(), ...listLocalOutstandingServiceFeeRequests()] });
    const snapshot = await adminDb().collection("service_fee_payments").orderBy("submittedAt", "desc").limit(200).get();
    const payments = snapshot.docs.map<ServiceFeePayment>(doc => ({ id: doc.id, ...doc.data() } as ServiceFeePayment));
    const outstandingRequests = await listOutstandingFirebaseServiceFeeRequests(payments);
    return NextResponse.json({ payments: [...payments, ...outstandingRequests] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load service fee payments." }, { status: adminErrorStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, "finance:adjust");
    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? "");
    const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : "";
    const reason = String(body.reason ?? "").trim();
    if (!id || !action) return NextResponse.json({ error: "Choose a payment and action." }, { status: 400 });
    if (id.startsWith("service-fee-due:")) return NextResponse.json({ error: "The worker has not submitted a payment yet." }, { status: 400 });
    if (action === "reject" && !reason) return NextResponse.json({ error: "Add a rejection reason." }, { status: 400 });

    if (isSqlBackend()) {
      const payment = reviewLocalServiceFeePayment(id, admin.uid, action, reason);
      if (!payment) return NextResponse.json({ error: "Payment was not found." }, { status: 404 });
      await writeAdminAuditLog(request, { admin, targetUserId: payment.workerId, actionType: `service_fee.${action}`, oldValue: null, newValue: payment, reason: reason || "Service fee payment approved" });
      return NextResponse.json({ success: true, payment });
    }

    const db = adminDb();
    const paymentRef = db.collection("service_fee_payments").doc(id);
    const updated = await db.runTransaction(async transaction => {
      const snap = await transaction.get(paymentRef);
      if (!snap.exists) throw new Error("Payment was not found.");
      const payment = snap.data() ?? {};
      const workerRef = db.collection("users").doc(String(payment.workerId));
      if (action === "approve") {
        const workerSnap = await transaction.get(workerRef);
        const currentOutstanding = Number(workerSnap.data()?.outstandingServiceFee ?? 0);
        const remainingOutstanding = Math.max(0, currentOutstanding - Number(payment.amount ?? 0));
        transaction.set(paymentRef, { status: "approved", rejectionReason: null, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: admin.uid }, { merge: true });
        transaction.set(workerRef, {
          isLocked: remainingOutstanding > 0,
          outstandingServiceFee: remainingOutstanding,
          lockReason: remainingOutstanding > 0 ? "Service Fee Payment Required" : null,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        const notificationRef = db.collection("notifications").doc();
        transaction.set(notificationRef, {
          id: notificationRef.id,
          userId: payment.workerId,
          title: remainingOutstanding > 0 ? "Account action required" : "Account unlocked",
          body: remainingOutstanding > 0 ? `Your payment was approved, but KES ${remainingOutstanding.toLocaleString()} service fee is still due.` : "Your payment was approved. You can apply for jobs again.",
          read: false,
          href: remainingOutstanding > 0 ? "/dashboard" : "/jobs",
          createdAt: FieldValue.serverTimestamp()
        });
      } else {
        transaction.set(paymentRef, { status: "rejected", rejectionReason: reason, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: admin.uid }, { merge: true });
        transaction.set(workerRef, { isLocked: true, outstandingServiceFee: Number(payment.amount ?? 0), lockReason: reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        const notificationRef = db.collection("notifications").doc();
        transaction.set(notificationRef, { id: notificationRef.id, userId: payment.workerId, title: "Payment rejected", body: `Your payment was rejected. Please retry.${reason ? ` Reason: ${reason}` : ""}`, read: false, href: "/dashboard", createdAt: FieldValue.serverTimestamp() });
      }
      return { id: snap.id, ...payment, workerId: String(payment.workerId ?? ""), status: action === "approve" ? "approved" : "rejected", rejectionReason: action === "reject" ? reason : null };
    });
    await writeAdminAuditLog(request, { admin, targetUserId: String(updated.workerId ?? ""), actionType: `service_fee.${action}`, oldValue: null, newValue: updated, reason: reason || "Service fee payment approved" });
    return NextResponse.json({ success: true, payment: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to review payment." }, { status: adminErrorStatus(error) });
  }
}

async function listOutstandingFirebaseServiceFeeRequests(payments: ServiceFeePayment[]) {
  const blockedWorkerIds = new Set(payments
    .filter(payment => payment.status !== "approved" && payment.status !== "rejected")
    .map(payment => payment.workerId));
  const snapshot = await adminDb().collection("users")
    .where("outstandingServiceFee", ">", 0)
    .limit(200)
    .get();
  return snapshot.docs
    .filter(doc => !blockedWorkerIds.has(doc.id))
    .filter(doc => doc.data().role === "worker" || (Array.isArray(doc.data().roles) && doc.data().roles.includes("worker")))
    .map<ServiceFeePayment>(doc => {
      const data = doc.data();
      const workerName = String(data.displayName ?? data.email ?? "Worker");
      const username = workerName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || doc.id.slice(0, 12);
      return {
        id: `service-fee-due:${doc.id}`,
        workerId: doc.id,
        workerName,
        username,
        transactionCode: "Not submitted yet",
        screenshotUrl: null,
        status: "service_fee_due",
        amount: Number(data.outstandingServiceFee ?? 0),
        rejectionReason: null,
        matchedMpesaRecordId: null,
        submittedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        requiresWorkerSubmission: true
      };
    });
}
