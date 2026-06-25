import "server-only";

import { createHash } from "node:crypto";
import { adminAuth } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

const OTP_PATTERN = /^\d{6}$/;

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validOtp(value: unknown): value is string {
  return typeof value === "string" && OTP_PATTERN.test(value.trim());
}

export function hashOtp(otp: string) {
  const secret = process.env.OTP_SECRET;
  if (!secret) throw new Error("OTP_SECRET is not configured.");
  return createHash("sha256").update(`${otp}:${secret}`).digest("hex");
}

export async function requireAuthenticatedOtpUser(request: NextRequest, uid: string, email: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("Sign in is required.");

  const decoded = await adminAuth().verifyIdToken(token);
  if (decoded.uid !== uid || normalizeEmail(decoded.email) !== email) {
    throw new Error("Account details do not match.");
  }

  const user = await adminAuth().getUser(uid);
  if (normalizeEmail(user.email) !== email) throw new Error("Account details do not match.");
  return user;
}
