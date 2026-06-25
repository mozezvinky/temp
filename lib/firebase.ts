import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getMessaging, isSupported } from "firebase/messaging";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app =
  !getApps().length
    ? initializeApp(firebaseConfig)
    : getApp();

export const db =
  typeof window !== "undefined"
    ? getFirestore(app)
    : null;

export const auth =
  typeof window !== "undefined"
    ? getAuth(app)
    : null;

export const storage =
  typeof window !== "undefined"
    ? getStorage(app)
    : null;

export const functions =
  typeof window !== "undefined"
    ? getFunctions(app)
    : null;

export const googleProvider =
  typeof window !== "undefined"
    ? new GoogleAuthProvider()
    : null;

if (typeof window !== "undefined" && auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => undefined);
}

export function requireDb() {
  if (!db) throw new Error("This service is not available right now.");
  return db;
}

export function requireAuth() {
  if (!auth) throw new Error("Sign in is not available right now.");
  return auth;
}

export function requireStorage() {
  if (!storage) throw new Error("Uploads are not available right now.");
  return storage;
}

export function requireFunctions() {
  if (!functions) throw new Error("This service is not available right now.");
  return functions;
}

export async function messaging() {
  if (typeof window === "undefined") return null;
  return (await isSupported()) ? getMessaging(app) : null;
}

export default app;
