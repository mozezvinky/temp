"use client";

import { requireAuth } from "@/lib/firebase";

export const EMAIL_VERIFICATION_MESSAGE = "Please verify your email before using this feature.";

export async function sendEmailVerificationCode() {
  const user = requireAuth().currentUser;
  if (!user?.email) throw new Error("Sign in with an email account first.");
  const response = await fetch("/api/auth/send-email-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ uid: user.uid, email: user.email })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to send verification code.");
  return String(payload.message ?? "Verification code sent.");
}

export async function verifyEmailCode(otp: string) {
  const user = requireAuth().currentUser;
  if (!user?.email) throw new Error("Sign in with an email account first.");
  const response = await fetch("/api/auth/verify-email-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ uid: user.uid, email: user.email, otp })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to verify this code.");
  await user.reload();
  await user.getIdToken(true);
  window.sessionStorage.setItem("temp.emailVerified.uid", user.uid);
  window.sessionStorage.setItem("temp.emailVerified", "true");
  return String(payload.message ?? "Email verified successfully.");
}

export async function requireVerifiedEmail(userId: string) {
  const user = requireAuth().currentUser;
  if (!user || user.uid !== userId || !user.emailVerified) throw new Error(EMAIL_VERIFICATION_MESSAGE);
}
