import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getLatestLocalServiceFeePayment, getLocalUser, submitLocalServiceFeePayment } from "@/lib/local-sql";
import { isServiceFeeScreenshot, saveServiceFeeScreenshot } from "@/lib/service-fee-upload-storage";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const decoded = await requireUser(request);
    if (isSqlBackend()) return NextResponse.json({ payment: getLatestLocalServiceFeePayment(decoded.uid) });
    const snapshot = await adminDb().collection("service_fee_payments").where("workerId", "==", decoded.uid).limit(20).get();
    const payment = snapshot.docs.map<Record<string, unknown>>(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => timestampMillis(b.submittedAt) - timestampMillis(a.submittedAt))[0] ?? null;
    return NextResponse.json({ payment });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load payment details." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await requireUser(request);
    const form = await request.formData();
    const screenshot = form.get("screenshot");
    if (!isServiceFeeScreenshot(screenshot)) {
      return NextResponse.json({ error: "Upload a clear JPEG, PNG, or WebP M-Pesa confirmation screenshot under 8 MB." }, { status: 400 });
    }

    if (isSqlBackend()) {
      const worker = getLocalUser(decoded.uid);
      if (!worker || worker.role === "admin" || Number(worker.outstandingServiceFee ?? 0) <= 0) return NextResponse.json({ error: "An outstanding service fee is required." }, { status: 403 });
      const paymentId = crypto.randomUUID();
      const screenshotUrl = await saveServiceFeeScreenshot(decoded.uid, paymentId, screenshot);
      return NextResponse.json({ success: true, payment: submitLocalServiceFeePayment({ workerId: decoded.uid, screenshotUrl }) });
    }

    const db = adminDb();
    const userSnap = await db.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists || userSnap.data()?.role === "admin") return NextResponse.json({ error: "An outstanding service fee is required." }, { status: 403 });
    const serviceFeeAmount = Number(userSnap.data()?.outstandingServiceFee ?? 0);
    if (!Number.isFinite(serviceFeeAmount) || serviceFeeAmount <= 0) return NextResponse.json({ error: "No service fee is currently outstanding." }, { status: 400 });
    const username = usernameForUser(decoded.uid, userSnap.data());
    const ref = db.collection("service_fee_payments").doc();
    const screenshotUrl = await saveServiceFeeScreenshot(decoded.uid, ref.id, screenshot);
    const status = "payment_pending_verification";
    const payload = {
      id: ref.id,
      workerId: decoded.uid,
      workerName: String(userSnap.data()?.displayName ?? "Worker"),
      username,
      transactionCode: `ADMIN-${ref.id.slice(0, 8).toUpperCase()}`,
      screenshotUrl,
      status,
      amount: serviceFeeAmount,
      matchedMpesaRecordId: null,
      rejectionReason: null,
      submittedAt: FieldValue.serverTimestamp()
    };
    await db.runTransaction(async transaction => {
      transaction.set(ref, payload);
      transaction.set(userSnap.ref, {
        isLocked: true,
        lockReason: "Waiting for admin confirmation",
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      const notificationRef = db.collection("notifications").doc();
      transaction.set(notificationRef, {
        id: notificationRef.id,
        userId: decoded.uid,
        title: "Payment submitted",
        body: "Waiting for admin confirmation.",
        read: false,
        href: "/dashboard",
        createdAt: FieldValue.serverTimestamp()
      });
    });
    return NextResponse.json({ success: true, payment: payload });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit payment." }, { status: 500 });
  }
}

async function requireUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("Sign in is required.");
  return adminAuth().verifyIdToken(token);
}

function usernameForUser(uid: string, data?: Record<string, unknown>) {
  return String(data?.displayName ?? data?.email ?? uid).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || uid.slice(0, 12);
}

function timestampMillis(value: unknown) {
  return typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis: () => number }).toMillis()
    : 0;
}
