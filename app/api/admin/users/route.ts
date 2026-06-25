import { adminDb } from "@/lib/firebase-admin";
import { adminErrorStatus, requireAdmin } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { localDb, rowToUser } from "@/lib/local-sql";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "users:read");
    const search = (request.nextUrl.searchParams.get("search") ?? "").trim().toLowerCase();
    const userId = (request.nextUrl.searchParams.get("userId") ?? "").trim();
    const roleFilter = (request.nextUrl.searchParams.get("role") ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 80), 1), 100);

    if (isSqlBackend()) {
      if (userId) {
        const user = localDb().prepare("SELECT * FROM users WHERE uid = ?").get(userId) as Record<string, unknown> | undefined;
        if (!user) return NextResponse.json({ error: "User was not found." }, { status: 404 });
        const applications = localDb().prepare("SELECT * FROM applications WHERE workerId = ? OR clientId = ? ORDER BY createdAt DESC LIMIT 120").all(userId, userId);
        const jobs = localDb().prepare("SELECT * FROM jobs WHERE clientId = ? ORDER BY createdAt DESC LIMIT 120").all(userId);
        return NextResponse.json({ user: rowToUser(user), applications, jobs });
      }
      const users = (localDb().prepare("SELECT * FROM users ORDER BY updatedAt DESC LIMIT ?").all(limit) as Record<string, unknown>[])
        .map(rowToUser)
        .filter(user => matchesRole(user, roleFilter))
        .filter(user => matchesSearch(user, search));
      return NextResponse.json({ users });
    }

    if (userId) {
      const db = adminDb();
      const userSnap = await db.collection("users").doc(userId).get();
      if (!userSnap.exists) return NextResponse.json({ error: "User was not found." }, { status: 404 });
      const [workerApplications, clientApplications, jobs] = await Promise.all([
        db.collection("applications").where("workerId", "==", userId).limit(120).get(),
        db.collection("applications").where("clientId", "==", userId).limit(120).get(),
        db.collection("jobs").where("clientId", "==", userId).limit(120).get()
      ]);
      return NextResponse.json({
        user: { id: userSnap.id, ...userSnap.data() },
        applications: [...workerApplications.docs, ...clientApplications.docs].map(doc => ({ id: doc.id, ...doc.data() })),
        jobs: jobs.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      });
    }

    const snapshot = await adminDb().collection("users").limit(limit).get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, uid: doc.id, ...doc.data() })).filter(user => matchesRole(user, roleFilter)).filter(user => matchesSearch(user, search));
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load users." }, { status: adminErrorStatus(error) });
  }
}

function matchesSearch(user: unknown, search: string) {
  if (!search) return true;
  return ["id", "uid", "displayName", "email", "phoneNumber", "role", "username"].some(key => String(readField(user, key) ?? "").toLowerCase().includes(search));
}

function matchesRole(user: unknown, roleFilter: string) {
  const role = readField(user, "role");
  if (roleFilter === "admin") return role === "admin";
  if (roleFilter === "non-admin") return role !== "admin";
  return true;
}

function readField(user: unknown, key: string) {
  return typeof user === "object" && user !== null && key in user ? (user as Record<string, unknown>)[key] : undefined;
}
