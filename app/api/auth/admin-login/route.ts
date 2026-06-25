import { isSqlBackend } from "@/lib/data-backend";
import { adminPasswordMatches } from "@/lib/admin-credentials";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { createLocalAdminSession, localDb, upsertLocalUser } from "@/lib/local-sql";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const twoFactorCode = String(body.twoFactorCode ?? "");
    const configuredUsername = process.env.ADMIN_USERNAME ?? (process.env.NODE_ENV === "development" ? "admin" : "");
    if (!configuredUsername || !(process.env.ADMIN_PASSWORD || process.env.NODE_ENV === "development")) {
      return NextResponse.json({ error: "Admin login is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_EMAIL." }, { status: 503 });
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
    const userAgent = request.headers.get("user-agent") ?? null;
    const locked = await adminLoginLocked(username);
    if (locked) {
      await logAdminLoginAttempt(username, false, ip, userAgent, "lockout");
      return NextResponse.json({ error: "Too many failed attempts. Try again later." }, { status: 429 });
    }
    const configuredTwoFactorCode = process.env.ADMIN_2FA_CODE;

    if (!configuredUsername || username !== configuredUsername || !(await adminPasswordMatches(password))) {
      await logAdminLoginAttempt(username, false, ip, userAgent, "invalid_credentials");
      return NextResponse.json({ error: "Invalid admin username or password." }, { status: 401 });
    }
    if (configuredTwoFactorCode && twoFactorCode !== configuredTwoFactorCode) {
      await logAdminLoginAttempt(username, false, ip, userAgent, "invalid_2fa");
      return NextResponse.json({ error: "Invalid admin verification code." }, { status: 401 });
    }

    const auth = adminAuth();
    const email = process.env.ADMIN_EMAIL ?? (process.env.NODE_ENV === "development" ? "admin@copic.test" : "");
    if (!email) return NextResponse.json({ error: "Admin login is not configured. Set ADMIN_EMAIL." }, { status: 503 });
    let adminUser;
    try {
      adminUser = await auth.getUserByEmail(email);
    } catch {
      adminUser = await auth.createUser({ email, displayName: "Copic Admin", emailVerified: true });
    }
    if (!adminUser.emailVerified && process.env.NODE_ENV === "production") {
      await logAdminLoginAttempt(username, false, ip, userAgent, "email_not_verified");
      return NextResponse.json({ error: "Admin email verification is required." }, { status: 403 });
    }
    await auth.setCustomUserClaims(adminUser.uid, { admin: true });

    if (isSqlBackend()) {
      upsertLocalUser({
        uid: adminUser.uid,
        email,
        displayName: "Copic Admin",
        role: "admin",
        phoneNumber: null,
        emailVerified: true
      });
      localDb().prepare("UPDATE users SET adminRole = 'super_admin', adminPermissions = ? WHERE uid = ?").run(JSON.stringify([]), adminUser.uid);
    } else {
      await adminDb().collection("users").doc(adminUser.uid).set({
        uid: adminUser.uid,
        email,
        displayName: "Copic Admin",
        role: "admin",
        roles: ["admin"],
        adminRole: "super_admin",
        adminPermissions: [],
        emailVerified: true,
        profileCompleted: true,
        verificationStatus: "approved",
        ratingAverage: 0,
        ratingCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await recordAdminSession(sessionId, adminUser.uid, ip, userAgent, expiresAt);
    await logAdminLoginAttempt(username, true, ip, userAgent, "success");
    return NextResponse.json({ token: await auth.createCustomToken(adminUser.uid, { admin: true, role: "admin" }), uid: adminUser.uid, sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin sign in is unavailable right now.";
    return NextResponse.json({ error: process.env.NODE_ENV === "development" ? message : "Admin sign in is unavailable right now." }, { status: 500 });
  }
}

async function recordAdminSession(id: string, adminId: string, ip: string | null, userAgent: string | null, expiresAt: Date) {
  if (isSqlBackend()) {
    createLocalAdminSession({ id, adminId, ip, userAgent, expiresAt: expiresAt.toISOString() });
    return;
  }
  await adminDb().collection("admin_sessions").doc(id).set({
    id,
    adminId,
    ip,
    userAgent,
    revoked: false,
    createdAt: FieldValue.serverTimestamp(),
    lastSeenAt: FieldValue.serverTimestamp(),
    expiresAt
  });
}

async function adminLoginLocked(username: string) {
  const since = Date.now() - 15 * 60 * 1000;
  if (isSqlBackend()) {
    const rows = localDb().prepare("SELECT success, createdAt FROM admin_login_attempts WHERE username = ? ORDER BY createdAt DESC LIMIT 10").all(username);
    return rows.filter(row => Number(row.success) === 0 && new Date(String(row.createdAt)).getTime() >= since).length >= 5;
  }
  const snapshot = await adminDb().collection("admin_login_attempts").where("username", "==", username).limit(10).get();
  return snapshot.docs.filter(doc => doc.data().success === false && timestampMillis(doc.data().createdAt) >= since).length >= 5;
}

async function logAdminLoginAttempt(username: string, success: boolean, ip: string | null, userAgent: string | null, reason: string) {
  const id = crypto.randomUUID();
  if (isSqlBackend()) {
    localDb().prepare("INSERT INTO admin_login_attempts (id, username, success, ip, userAgent, reason, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, username, success ? 1 : 0, ip, userAgent, reason, new Date().toISOString());
    return;
  }
  await adminDb().collection("admin_login_attempts").doc(id).set({ id, username, success, ip, userAgent, reason, createdAt: FieldValue.serverTimestamp() });
}

function timestampMillis(value: unknown) {
  return typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis: () => number }).toMillis()
    : 0;
}
