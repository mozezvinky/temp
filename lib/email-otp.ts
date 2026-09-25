import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const EMAIL_OTP_TTL_MS = 10 * 60_000;
export const EMAIL_OTP_RESEND_MS = 60_000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;

function secret() {
  const value = process.env.OTP_SECRET;
  if (!value || value.length < 32) throw new Error("OTP_SECRET must be configured with at least 32 characters.");
  return value;
}

export function generateEmailOtp() { return randomInt(0, 1_000_000).toString().padStart(6, "0"); }
export function hashEmailOtp(uid: string, email: string, code: string) {
  return createHmac("sha256", secret()).update(`${uid}:${email.trim().toLowerCase()}:${code}`).digest("hex");
}
export function matchesEmailOtp(storedHash: string, uid: string, email: string, code: string) {
  const actual = Buffer.from(hashEmailOtp(uid, email, code), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function emailOtpHtml(code: string) {
  return `<div style="font-family:Arial,sans-serif;color:#202124;max-width:520px;margin:24px auto;line-height:1.6"><h1 style="font-size:22px">Verify your COPIC email</h1><p>Your COPIC verification code is:</p><p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p><p>This code expires in 10 minutes.</p><p>If you didn't create a COPIC account, you can ignore this email.</p></div>`;
}
