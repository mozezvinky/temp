import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { EMAIL_OTP_MAX_ATTEMPTS, matchesEmailOtp } from "@/lib/email-otp";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/, "") ?? "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(token, true);
    const user = await adminAuth().getUser(decoded.uid);
    if (user.disabled || !user.email) return NextResponse.json({ error: "This account cannot verify an email address." }, { status: 400 });
    if (user.emailVerified) return NextResponse.json({ verified: true, alreadyVerified: true });
    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });

    const db = adminDb();
    const ref = db.collection("emailVerificationCodes").doc(decoded.uid);
    const result = await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const data = snap.data();
      if (!data) return "missing" as const;
      if (Number(data.expiresAt) <= Date.now()) { transaction.delete(ref); return "expired" as const; }
      if (Number(data.attempts) >= EMAIL_OTP_MAX_ATTEMPTS) return "locked" as const;
      if (String(data.email).toLowerCase() !== user.email!.toLowerCase()) return "email_changed" as const;
      if (!matchesEmailOtp(String(data.codeHash), decoded.uid, user.email!, code)) {
        const attempts = Number(data.attempts) + 1;
        transaction.update(ref, { attempts, ...(attempts >= EMAIL_OTP_MAX_ATTEMPTS ? { expiresAt: Date.now() } : {}) });
        return attempts >= EMAIL_OTP_MAX_ATTEMPTS ? "locked" as const : "incorrect" as const;
      }
      transaction.delete(ref);
      return "verified" as const;
    });
    if (result !== "verified") {
      const errors = { missing: ["Request a new verification code.", 400], expired: ["That code has expired. Request a new one.", 400], locked: ["Too many incorrect attempts. Request a new code.", 429], email_changed: ["Your account email has changed. Request a new code.", 400], incorrect: ["That code is incorrect. Please try again.", 400] } as const;
      const [error, status] = errors[result];
      return NextResponse.json({ error }, { status });
    }

    await adminAuth().updateUser(decoded.uid, { emailVerified: true });
    await db.collection("users").doc(decoded.uid).set({ emailVerified: true, emailVerifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ verified: true });
  } catch (error) {
    if ((error as { message?: string })?.message === "OTP_SECRET must be configured with at least 32 characters.") return NextResponse.json({ error: "Email verification is temporarily unavailable." }, { status: 503 });
    return NextResponse.json({ error: "Unable to verify the code. Please try again." }, { status: 503 });
  }
}
