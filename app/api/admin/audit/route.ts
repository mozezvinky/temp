import { adminDb } from "@/lib/firebase-admin";
import { adminErrorStatus, requireAdmin } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { localDb } from "@/lib/local-sql";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "audit:read");
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 100), 1), 200);
    if (isSqlBackend()) {
      return NextResponse.json({ logs: localDb().prepare("SELECT * FROM admin_audit_logs ORDER BY createdAt DESC LIMIT ?").all(limit) });
    }
    const snapshot = await adminDb().collection("admin_audit_logs").orderBy("createdAt", "desc").limit(limit).get();
    return NextResponse.json({ logs: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load audit logs." }, { status: adminErrorStatus(error) });
  }
}
