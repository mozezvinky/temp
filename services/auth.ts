"use client";
import { accountRole } from "@/utils/onboarding";
import { validSignupEmail } from "@/utils/email-validation";
import { verificationPath, verificationReturnPath } from "@/utils/verification-return";

import { authReady, googleProvider, requireAuth, requireDb } from "@/lib/firebase";
import type { Role } from "@/types";
import {
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  linkWithPhoneNumber,
  sendPasswordResetEmail,
  type ConfirmationResult,
  type User,
  updateProfile
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export function authErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/email-already-in-use") return "This email is already registered. Sign in or reset your password.";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) return "The email or password is incorrect.";
  if (code === "auth/network-request-failed") return "Check your connection and try again.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait and try again.";
  if (code === "auth/weak-password") return "Choose a stronger password with at least 8 characters.";
  if (code === "auth/user-disabled") return "This account is disabled. Please contact COPIC support.";

  if (code === "auth/configuration-not-found") {
    return "Sign in is not available right now. Please contact support.";
  }
  if (code === "auth/operation-not-allowed") {
    return "This sign-in method is not available right now.";
  }
  if (code === "auth/invalid-api-key" || code === "auth/api-key-not-valid") {
    return "Sign in is not available right now. Please contact support.";
  }
  return "Unable to complete sign-in. Please try again.";
}

function storedAvailableRoles(uid: string): Role[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`temp.profile.roles.${uid}`) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((role): role is Role => role === "worker" || role === "client" || role === "admin") : [];
  } catch {
    return [];
  }
}

function rememberActiveRole(user: User, role: Role, roles: Role[] = [role]) {
  const availableRoles = Array.from(new Set([...storedAvailableRoles(user.uid), ...roles, role]));
  window.sessionStorage.setItem("temp.profile.uid", user.uid);
  window.sessionStorage.setItem("temp.profile.role", role);
  window.localStorage.setItem(`temp.profile.role.${user.uid}`, role);
  window.localStorage.setItem(`temp.profile.roles.${user.uid}`, JSON.stringify(availableRoles));
  if (user.email) window.localStorage.setItem(`temp.accountRole.${user.email.toLowerCase()}`, role);
}

function pendingRoleKey(uid: string) {
  return `temp.profile.pendingRole.${uid}`;
}

export async function createProfile(uid: string, role: Role, displayName: string, email?: string, phone?: string): Promise<Role> {
  const user = requireAuth().currentUser;
  if (!user || user.uid !== uid) throw new Error("Please sign in again before continuing.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/auth/create-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uid, role, displayName, email, phoneNumber: phone })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.error === "string" ? payload.error : "Could not save your account profile.");
  }
  const payload = await response.json().catch(() => ({}));
  const savedRole = payload.role === "client" || payload.role === "worker" ? payload.role : role;
  const savedRoles = Array.isArray(payload.roles)
    ? payload.roles.filter((item: unknown): item is Role => item === "client" || item === "worker" || item === "admin")
    : [savedRole];
  rememberActiveRole(user, savedRole, savedRoles);
  window.localStorage.removeItem(pendingRoleKey(uid));
  return savedRole;
}

export async function activateProfileRole(user: User, role: Role, displayName: string, email?: string, phone?: string): Promise<Role> {
  if (!user.emailVerified) throw new Error("Verify your email before continuing.");
  return createProfile(user.uid, role, displayName, email, phone);
}

export async function registerWithEmail(email: string, password: string, displayName: string) {
  if (!validSignupEmail(email)) throw new Error("Enter a valid email address.");
  const auth = requireAuth();
  await authReady;
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  try { await updateProfile(credential.user, { displayName }); } catch {
    if (process.env.NODE_ENV !== "production") console.warn("[auth] Account created, display name update failed.");
  }
  return credential.user;
}

export async function loadSignedInRole() {
  const user = requireAuth().currentUser;
  if (!user) return null;
  const token = await user.getIdToken(true);
  const roleHint = window.sessionStorage.getItem("temp.profile.role") ?? window.localStorage.getItem(`temp.profile.role.${user.uid}`) ?? "";
  const response = await fetch("/api/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(roleHint === "client" || roleHint === "worker" || roleHint === "admin" ? { "X-Temp-Role": roleHint } : {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.degraded) throw new Error("Unable to load your account. Please try again.");
  const role = accountRole(payload.profile);
  if (role === "client" || role === "worker") {
    const roles = Array.isArray(payload.profile?.roles)
      ? payload.profile.roles.filter((item: unknown): item is Role => item === "client" || item === "worker" || item === "admin")
      : [role];
    rememberActiveRole(user, role, roles);
    return role as Role;
  }
  return null;
}

export async function loginWithEmail(email: string, password: string) {
  await authReady;
  const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
  return credential;
}

export async function sendPasswordReset(email: string) {
  await sendPasswordResetEmail(requireAuth(), email);
}

export async function loginAsAdmin(username: string, password: string, twoFactorCode = "") {
  const response = await fetch("/api/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, twoFactorCode })
  });
  const payload = await response.json().catch(() => ({})) as { token?: string; error?: string };
  if (!response.ok || !payload.token) throw new Error(payload.error ?? "Admin sign in failed.");
  const credential = await signInWithCustomToken(requireAuth(), payload.token);
  await credential.user.reload();
  if (!credential.user.emailVerified) return credential;
  try {
    window.sessionStorage.setItem("temp.profile.uid", credential.user.uid);
    window.sessionStorage.setItem("temp.profile.role", "admin");
    window.localStorage.setItem(`temp.profile.role.${credential.user.uid}`, "admin");
    window.localStorage.setItem(`temp.profile.roles.${credential.user.uid}`, JSON.stringify(["admin"]));
    const token = await credential.user.getIdToken();
    const profileResponse = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}`, "X-Temp-Role": "admin" }, cache: "no-store" });
    const profilePayload = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || profilePayload.profile?.role !== "admin") {
      throw new Error(typeof profilePayload.error === "string" ? profilePayload.error : "Admin role could not be verified.");
    }
    return credential;
  } catch (error) {
    await signOut(requireAuth());
    throw error;
  }
}

export async function loginWithGoogle(role: Role = "worker") {
  const auth = requireAuth();
  const db = requireDb();
  if (!googleProvider) throw new Error("This sign-in method is not available right now.");
  const credential = await signInWithPopup(auth, googleProvider);
  await credential.user.reload();
  if (!credential.user.emailVerified) { window.location.assign(verificationPath(verificationReturnPath(`/complete-profile?role=${role === "client" ? "client" : "worker"}`))); return; }
  const existing = await getDoc(doc(db, "users", credential.user.uid));
  if (existing.exists()) return;
  await createProfile(credential.user.uid, role, credential.user.displayName ?? "Copic user", credential.user.email ?? undefined);
}

export function phoneVerifier(containerId: string) {
  return new RecaptchaVerifier(requireAuth(), containerId, { size: "invisible" });
}

export function sendPhoneOtp(phone: string, verifier: RecaptchaVerifier) {
  return signInWithPhoneNumber(requireAuth(), phone, verifier);
}

export function linkPhoneNumber(user: User, phone: string, verifier: RecaptchaVerifier): Promise<ConfirmationResult> {
  return linkWithPhoneNumber(user, phone, verifier);
}

export async function savePhoneNumber(userId: string, phoneNumber: string) {
  await setDoc(doc(requireDb(), "users", userId), { phoneNumber, updatedAt: serverTimestamp() }, { merge: true });
}

export async function logout() {
  const uid = requireAuth().currentUser?.uid;
  await signOut(requireAuth());
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      for (const key of ["temp.profile.uid", "temp.profile.role", "temp.dataQuotaPausedUntil", "copic.verification.return", "copic.acquisition.return", ...(uid ? [`temp.profile.role.${uid}`, `temp.profile.roles.${uid}`, `temp.profile.pendingRole.${uid}`] : [])]) storage.removeItem(key);
    } catch { /* Signing out must work even when storage is unavailable. */ }
  }
}
