import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

export async function requireServerUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("Sign in is required.");
  const decoded = await adminAuth().verifyIdToken(token);
  const profile = await adminDb().collection("users").doc(decoded.uid).get();
  if (!profile.exists) throw new Error("Your account profile was not found.");
  return { uid: decoded.uid, email: decoded.email ?? "", profile: profile.data()! };
}

export async function requireVerifiedServerUser(request: NextRequest) {
  const user = await requireServerUser(request);
  if (user.profile.emailVerified !== true) {
    throw new Error("Please verify your email before using this feature.");
  }
  return user;
}

export function authErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("required") || message.includes("profile") ? 401 : message.includes("verify your email") ? 403 : 500;
}
