"use client";

import { requireAuth } from "@/lib/firebase";

export const EMAIL_VERIFICATION_MESSAGE = "Please verify your email before using this feature.";

async function post(path: string, body: Record<string, unknown> = {}) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in again to continue.");
  const token = await user.getIdToken();
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(typeof result.error === "string" ? result.error : "Unable to complete email verification."), { status: response.status, retryAfter: result.retryAfter });
  return result;
}

export async function sendEmailVerificationCode() { return post("/api/auth/send-email-otp"); }
export async function verifyEmailCode(code: string) { return post("/api/auth/verify-email-otp", { code }); }

export async function reloadVerifiedRecruitmentUser() {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in again to continue your application.");
  await user.reload();
  if (requireAuth().currentUser?.uid !== user.uid) throw new Error("Your account changed. Please sign in again.");
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  return true;
}

export async function requireVerifiedEmail(userId: string) {
  const user = requireAuth().currentUser;
  if (!user || user.uid !== userId || !user.emailVerified) throw new Error(EMAIL_VERIFICATION_MESSAGE);
}
