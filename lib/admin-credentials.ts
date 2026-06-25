import "server-only";

import { isSqlBackend } from "@/lib/data-backend";
import { adminDb } from "@/lib/firebase-admin";
import { getLocalAdminSetting, setLocalAdminSetting } from "@/lib/local-sql";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function matches(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBytes = Buffer.from(expected, "hex");
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

export async function adminPasswordMatches(password: string) {
  const stored = isSqlBackend()
    ? getLocalAdminSetting("passwordHash")
    : (await adminDb().collection("adminSettings").doc("login").get()).data()?.passwordHash;
  if (typeof stored === "string") return matches(password, stored);
  const configured = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === "development" ? "admin@4258" : "");
  return Boolean(configured) && password === configured;
}

export async function saveAdminPassword(password: string) {
  const passwordHash = hashPassword(password);
  if (isSqlBackend()) {
    setLocalAdminSetting("passwordHash", passwordHash);
    return;
  }
  await adminDb().collection("adminSettings").doc("login").set({ passwordHash, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
