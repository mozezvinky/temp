import { adminErrorStatus, requireAdmin, writeAdminAuditLog } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { listLocalAdminSessions, revokeLocalAdminSession } from "@/lib/local-sql";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "admins:manage");
    if (isSqlBackend()) return NextResponse.json({ sessions: listLocalAdminSessions() });
    const snapshot = await adminDb().collection("admin_sessions").orderBy("createdAt", "desc").limit(100).get();
    return NextResponse.json({ sessions: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load admin sessions." }, { status: adminErrorStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, "admins:manage");
    const body = await request.json().catch(() => ({}));
    const sessionId = String(body.sessionId ?? "").trim();
    if (!sessionId) return NextResponse.json({ error: "Choose a device session to log out." }, { status: 400 });
    if (isSqlBackend()) {
      revokeLocalAdminSession(sessionId);
    } else {
      await adminDb().collection("admin_sessions").doc(sessionId).set({ revoked: true, revokedAt: FieldValue.serverTimestamp(), revokedBy: admin.uid }, { merge: true });
    }
    await adminAuth().revokeRefreshTokens(admin.uid);
    await writeAdminAuditLog(request, {
      admin,
      targetUserId: admin.uid,
      actionType: "auth.admin_session_revoke",
      oldValue: { sessionId },
      newValue: { revoked: true },
      reason: "Admin device session revoked from settings."
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to log out this device." }, { status: adminErrorStatus(error) });
  }
}
