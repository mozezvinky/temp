"use client";

import { googleProvider, requireAuth, requireDb } from "@/lib/firebase";
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
  type ConfirmationResult,
  type User,
  updateProfile
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export function authErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  if (code === "auth/configuration-not-found") {
    return "Sign in is not available right now. Please contact support.";
  }
  if (code === "auth/operation-not-allowed") {
    return "This sign-in method is not available right now.";
  }
  if (code === "auth/invalid-api-key" || code === "auth/api-key-not-valid") {
    return "Sign in is not available right now. Please contact support.";
  }
  return error instanceof Error ? error.message.replace(/Firebase|Firestore|API key|\.env\.local|Console/gi, "service") : "Sign in failed";
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
  const cachedRoles = storedAvailableRoles(user.uid);
  const pendingRole = window.localStorage.getItem(pendingRoleKey(user.uid));
  if (cachedRoles.includes(role) && pendingRole !== role) {
    rememberActiveRole(user, role, cachedRoles);
    return role;
  }

  // Account-mode selection must remain usable when Firestore live reads/writes
  // are temporarily quota-limited. Activate locally first, then synchronize
  // the durable profile in the background when the service accepts writes.
  rememberActiveRole(user, role, [...cachedRoles, role]);
  window.localStorage.setItem(pendingRoleKey(user.uid), role);
  const quotaPausedUntil = Number(window.localStorage.getItem("temp.dataQuotaPausedUntil") ?? 0);
  if (Date.now() >= quotaPausedUntil) {
    void createProfile(user.uid, role, displayName, email, phone).catch(error => {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("RESOURCE_EXHAUSTED") || message.includes("Quota exceeded")) {
        window.localStorage.setItem("temp.dataQuotaPausedUntil", String(Date.now() + 300_000));
      }
    });
  }
  return role;
}

export async function registerWithEmail(email: string, password: string, displayName: string) {
  const auth = requireAuth();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
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
  const role = payload.profile?.role;
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
  const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
  return credential;
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

export function logout() {
  return signOut(requireAuth());
}
