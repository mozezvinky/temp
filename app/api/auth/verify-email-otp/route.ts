import { timingSafeEqual } from "node:crypto";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { isSqlBackend } from "@/lib/data-backend";
import { markLocalEmailVerified } from "@/lib/local-sql";
import { hashOtp, normalizeEmail, requireAuthenticatedOtpUser, validEmail, validOtp } from "@/lib/email-otp";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { uid?: unknown; email?: unknown; otp?: unknown };
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    const email = normalizeEmail(body.email);
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";
    if (!uid || !email || !otp) return NextResponse.json({ error: "Account and verification code are required." }, { status: 400 });
    if (!validEmail(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    if (!validOtp(otp)) return NextResponse.json({ error: "Enter the 6-digit verification code." }, { status: 400 });

    await requireAuthenticatedOtpUser(request, uid, email);
    const db = adminDb();
    const ref = db.collection("emailOtps").doc(uid);
    const record = await ref.get();
    if (!record.exists) return NextResponse.json({ error: "Request a new verification code first." }, { status: 400 });

    const data = record.data()!;
    if (data.email !== email || data.purpose !== "email_verification") {
      return NextResponse.json({ error: "Request a new verification code first." }, { status: 400 });
    }
    if (!(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now()) {
      await ref.delete();
      return NextResponse.json({ error: "This verification code has expired. Please request a new one." }, { status: 400 });
    }
    const attempts = Number(data.attempts ?? 0);
    const maxAttempts = Number(data.maxAttempts ?? 5);
    if (attempts >= maxAttempts) {
      return NextResponse.json({ error: "Too many attempts. Please request a new code." }, { status: 429 });
    }

    const submittedHash = hashOtp(otp);
    const savedHash = String(data.otpHash ?? "");
    const matches = savedHash.length === submittedHash.length &&
      timingSafeEqual(Buffer.from(savedHash), Buffer.from(submittedHash));
    if (!matches) {
      await ref.update({ attempts: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ error: "The verification code is incorrect." }, { status: 400 });
    }

    await adminAuth().updateUser(uid, { emailVerified: true });
    if (isSqlBackend()) {
      markLocalEmailVerified(uid);
      await ref.delete();
      return NextResponse.json({ success: true, message: "Email verified successfully." });
    }
    const batch = db.batch();
    batch.set(db.collection("users").doc(uid), {
      emailVerified: true,
      emailVerifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    batch.delete(ref);
    await batch.commit();

    return NextResponse.json({ success: true, message: "Email verified successfully." });
  } catch {
    return NextResponse.json({ error: "Unable to verify this code right now." }, { status: 500 });
  }
}
