import { adminErrorStatus, requireAdmin } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { adminDb } from "@/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "moderation:write");
    const kind = request.nextUrl.searchParams.get("kind") === "disputes" ? "disputes" : "reports";
    if (isSqlBackend()) return NextResponse.json({ items: [] });
    const snapshot = await adminDb().collection(kind).orderBy("createdAt", "desc").limit(50).get();
    return NextResponse.json({ items: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load moderation records." }, { status: adminErrorStatus(error) });
  }
}
