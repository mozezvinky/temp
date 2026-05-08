"use client";

import { googleProvider, requireAuth, requireDb } from "@/lib/firebase";
import type { Role } from "@/types";
import {
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  updateProfile
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export function authErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  if (code === "auth/configuration-not-found") {
    return "Firebase Authentication is not enabled for this Firebase project, or .env.local points to the wrong web app. In Firebase Console, open Authentication, click Get started, and enable Email/Password and Google providers.";
  }
  if (code === "auth/operation-not-allowed") {
    return "This sign-in provider is disabled in Firebase Authentication. Enable it in Firebase Console > Authentication > Sign-in method.";
  }
  if (code === "auth/invalid-api-key" || code === "auth/api-key-not-valid") {
    return "The Firebase web API key in .env.local is invalid. Copy the config from Firebase Console > Project settings > Your apps.";
  }
  return error instanceof Error ? error.message : "Authentication failed";
}

export async function createProfile(uid: string, role: Role, displayName: string, email?: string, phone?: string) {
  const db = requireDb();
  await setDoc(
    doc(db, "users", uid),
    {
      id: uid,
      role,
      accountType: role,
      displayName,
      email: email ?? null,
      phone: phone ?? null,
      profileDetails: {
        displayName,
        role,
        onboardingComplete: false
      },
      skills: [],
      certificates: [],
      workHistory: [],
      ratingAverage: 0,
      ratingCount: 0,
      trustScore: 0,
      completedJobs: 0,
      kycStatus: "pending",
      verificationStatus: "pending",
      isLocked: false,
      outstandingServiceFee: 0,
      walletBalance: 0,
      badges: role === "worker" ? ["Trial Worker"] : [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
  await setDoc(doc(db, "wallets", uid), {
    id: uid,
    userId: uid,
    balance: 0,
    pendingPayouts: 0,
    outstandingServiceFee: 0,
    updatedAt: serverTimestamp()
  });
}

export async function registerWithEmail(email: string, password: string, displayName: string, role: Role) {
  const auth = requireAuth();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  await createProfile(credential.user.uid, role, displayName, email);
}

export function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(requireAuth(), email, password);
}

export async function loginWithGoogle(role: Role = "worker") {
  const auth = requireAuth();
  const db = requireDb();
  if (!googleProvider) throw new Error("Google login is only available in the browser.");
  const credential = await signInWithPopup(auth, googleProvider);
  const existing = await getDoc(doc(db, "users", credential.user.uid));
  if (existing.exists()) return;
  await createProfile(credential.user.uid, role, credential.user.displayName ?? "Temp user", credential.user.email ?? undefined);
}

export function phoneVerifier(containerId: string) {
  return new RecaptchaVerifier(requireAuth(), containerId, { size: "invisible" });
}

export function sendPhoneOtp(phone: string, verifier: RecaptchaVerifier) {
  return signInWithPhoneNumber(requireAuth(), phone, verifier);
}

export function logout() {
  return signOut(requireAuth());
}
