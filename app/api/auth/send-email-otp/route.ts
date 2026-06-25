import { randomInt } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import { hashOtp, normalizeEmail, requireAuthenticatedOtpUser, validEmail } from "@/lib/email-otp";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

const EXPIRES_IN_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const isProduction = process.env.NODE_ENV === "production";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: unknown; uid?: unknown };
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    const email = normalizeEmail(body.email);
    if (!uid || !email) return NextResponse.json({ error: "Email and account are required." }, { status: 400 });
    if (!validEmail(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });

    await requireAuthenticatedOtpUser(request, uid, email);
    const otp = randomInt(100000, 1000000).toString();
    const now = Date.now();
    const db = adminDb();
    const ref = db.collection("emailOtps").doc(uid);

    await db.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      const resendAvailableAt = existing.data()?.resendAvailableAt as Timestamp | undefined;
      if (resendAvailableAt && resendAvailableAt.toMillis() > now) {
        const seconds = Math.ceil((resendAvailableAt.toMillis() - now) / 1000);
        throw new Error(`Please wait ${seconds} seconds before requesting another code.`);
      }
      transaction.set(ref, {
        uid,
        email,
        otpHash: hashOtp(otp),
        purpose: "email_verification",
        attempts: 0,
        maxAttempts: 5,
        expiresAt: Timestamp.fromMillis(now + EXPIRES_IN_MS),
        resendAvailableAt: Timestamp.fromMillis(now + RESEND_COOLDOWN_MS),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      if (!isProduction) {
        console.warn("[Copic email OTP] RESEND_API_KEY is missing. Use this development code:", { email, otp });
        return NextResponse.json({
          success: true,
          message: "Verification code generated. Email sending is not configured locally, so check your dev server terminal for the code."
        });
      }
      await ref.delete();
      return NextResponse.json({ error: "Email sending is not configured. Add RESEND_API_KEY to your environment and restart the app." }, { status: 500 });
    }

    const resend = new Resend(apiKey);
    try {
      const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Copic <onboarding@resend.dev>",
        to: email,
        subject: "Your Copic verification code",
        html: `
          <div style="font-family:Arial,sans-serif;background:#11120D;color:#FFFBF4;padding:32px;">
            <h1 style="font-size:24px;margin:0 0 16px;">Verify your email</h1>
            <p style="color:#D8CFBC;margin:0 0 22px;">Enter this code in Copic to confirm your email address.</p>
            <div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#FFFBF4;color:#11120D;border-radius:12px;padding:18px 22px;display:inline-block;">${otp}</div>
            <p style="color:#D8CFBC;margin:22px 0 0;">This code expires in 10 minutes.</p>
          </div>
        `
      });
      if (!error) return NextResponse.json({ success: true, message: "Verification code sent." });
      if (!isProduction) {
        console.warn("[Copic email OTP] Resend rejected the email. Use this development code:", { email, otp, error });
        return NextResponse.json({
          success: true,
          message: "Verification code generated. Resend rejected the email, so check your dev server terminal for the code."
        });
      }
      await ref.delete();
      return NextResponse.json({ error: resendErrorMessage(error) }, { status: 502 });
    } catch (sendError) {
      if (!isProduction) {
        console.warn("[Copic email OTP] Resend failed. Use this development code:", { email, otp, error: sendError });
        return NextResponse.json({
          success: true,
          message: "Verification code generated. Email sending failed locally, so check your dev server terminal for the code."
        });
      }
      await ref.delete();
      return NextResponse.json({ error: resendErrorMessage(sendError) }, { status: 502 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send a verification code right now.";
    if (!isProduction) console.error("[Copic email OTP] send failed:", error);
    const normalized = message.toLowerCase();
    const status = normalized.includes("wait") ? 429 : normalized.includes("required") || normalized.includes("match") ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? otpSetupErrorMessage(message) : message }, { status });
  }
}

function otpSetupErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("otp_secret")) {
    return "Email verification is missing OTP_SECRET. Add OTP_SECRET to .env.local and restart the app.";
  }
  if (normalized.includes("firebase") || normalized.includes("credential") || normalized.includes("private_key") || normalized.includes("client_email")) {
    return "Email verification server access is not configured correctly. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.";
  }
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "Email verification could not reach the verification service. Check your internet connection and try again.";
  }
  return "Unable to send a verification code right now. Check the dev server terminal for details.";
}

function resendErrorMessage(error: unknown) {
  const message = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message)
    : error instanceof Error
      ? error.message
      : "";
  if (message.toLowerCase().includes("domain") || message.toLowerCase().includes("from")) {
    return "Email sender is not ready. Verify your Resend sending domain or set RESEND_FROM_EMAIL to a verified sender.";
  }
  if (message.toLowerCase().includes("api key")) {
    return "Email sending is not configured correctly. Check your Resend API key.";
  }
  return "Unable to send a verification code right now. Check your Resend sender settings.";
}
