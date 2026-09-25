import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { sendAppEmail } from "@/lib/app-email";
import { EMAIL_OTP_RESEND_MS, EMAIL_OTP_TTL_MS, emailOtpHtml, generateEmailOtp, hashEmailOtp } from "@/lib/email-otp";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/, "") ?? "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(token, true);
    const user = await adminAuth().getUser(decoded.uid);
    if (user.disabled || !user.email) return NextResponse.json({ error: "This account cannot verify an email address." }, { status: 400 });
    if (user.emailVerified) return NextResponse.json({ alreadyVerified: true });

    const db = adminDb();
    const ref = db.collection("emailVerificationCodes").doc(decoded.uid);
    const now = Date.now();
    let previous: Record<string, unknown> | undefined;
    const code = generateEmailOtp();
    const resendAt = now + EMAIL_OTP_RESEND_MS;
    const codeHash = hashEmailOtp(decoded.uid, user.email, code);
    const accepted = await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const stored = snap.data();
      if (Number(stored?.resendAt ?? 0) > now) return { resendAfter: Number(stored!.resendAt) - now };
      previous = stored;
      transaction.set(ref, { email: user.email!.trim().toLowerCase(), codeHash, expiresAt: now + EMAIL_OTP_TTL_MS, attempts: 0, resendAt, updatedAt: FieldValue.serverTimestamp() });
      return { resendAfter: 0 };
    });
    if (accepted.resendAfter > 0) return NextResponse.json({ error: "Please wait before requesting another code.", retryAfter: Math.ceil(accepted.resendAfter / 1000) }, { status: 429 });

    const restorePreviousCode = async () => db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (snap.data()?.codeHash !== codeHash) return;
      if (previous) transaction.set(ref, previous);
      else transaction.delete(ref);
    });
    let delivery;
    try { delivery = await sendAppEmail(user.email, "Verify your COPIC email", emailOtpHtml(code)); }
    catch { await restorePreviousCode(); throw new Error("EMAIL_DELIVERY_FAILED"); }
    if (!delivery.attempted) {
      await restorePreviousCode();
      return NextResponse.json({ error: delivery.skippedReason === "missing_api_key" ? "Email delivery is temporarily unavailable. Please try again later." : "Unable to send a verification code." }, { status: 503 });
    }
    return NextResponse.json({ sent: true, retryAfter: Math.ceil(EMAIL_OTP_RESEND_MS / 1000), expiresIn: Math.ceil(EMAIL_OTP_TTL_MS / 1000) });
  } catch (error) {
    if ((error as { message?: string })?.message === "OTP_SECRET must be configured with at least 32 characters.") return NextResponse.json({ error: "Email verification is temporarily unavailable." }, { status: 503 });
    if ((error as { code?: string })?.code === "auth/id-token-revoked") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.json({ error: "Unable to send a verification code. Please try again." }, { status: 503 });
  }
}
