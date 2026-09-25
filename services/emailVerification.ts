"use client";

import { requireAuth } from "@/lib/firebase";
import { sendEmailVerification } from "firebase/auth";
import { verificationPath } from "@/utils/verification-return";
import { COPIC_PRODUCTION_APP_URL } from "@/lib/production-env";

export const EMAIL_VERIFICATION_MESSAGE = "Please verify your email before using this feature.";

export async function sendRecruitmentVerificationEmail(returnPath: string) {
  const user = requireAuth().currentUser;
  if (!user?.email) throw new Error("Sign in with an email account first.");
  // Development stays local; production uses the existing authoritative application origin.
  await sendEmailVerification(user, {
    url: new URL(verificationPath(returnPath), process.env.NODE_ENV === "production" ? COPIC_PRODUCTION_APP_URL : window.location.origin).href,
    handleCodeInApp: false
  });
}

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

export function verificationSendError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/too-many-requests") return "Too many verification emails have been requested. Please wait a moment and try again.";
  if (code === "auth/network-request-failed") return "We couldn't send the verification email because of a connection problem. Check your connection and try again.";
  if (["auth/unauthorized-continue-uri", "auth/invalid-continue-uri", "auth/missing-continue-uri"].includes(code ?? "")) return "Verification email is temporarily unavailable. Please contact COPIC support.";
  return "Unable to send the verification email. Please try again.";
}

export function verificationDeliveryStatus(uid: string): { sent?: boolean; error?: string; retryAt?: number } {
  try { return JSON.parse(window.sessionStorage.getItem(`copic.verification.delivery.${uid}`) || "{}"); } catch { return {}; }
}

export async function deliverVerificationEmail(returnPath: string) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in again.");
  const status: { sent?: boolean; error?: string; retryAt?: number } = {};
  try {
    await sendRecruitmentVerificationEmail(returnPath);
    status.sent = true;
    status.retryAt = Date.now() + 60_000;
  } catch (error) {
    status.error = verificationSendError(error);
    if ((error as { code?: string })?.code === "auth/too-many-requests") status.retryAt = Date.now() + 60_000;
    if (process.env.NODE_ENV !== "production") console.warn("[auth] Verification email failed", (error as { code?: string })?.code || "unknown");
  }
  try { window.sessionStorage.setItem(`copic.verification.delivery.${user.uid}`, JSON.stringify(status)); } catch { /* Delivery does not depend on storage. */ }
  return status;
}
