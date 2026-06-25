import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth } from "@/lib/firebase-admin";
import { listLocalActivities } from "@/lib/local-sql";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (!isSqlBackend()) return NextResponse.json({ error: "SQL backend is not enabled." }, { status: 400 });
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const decoded = await adminAuth().verifyIdToken(token);
    return NextResponse.json({ activities: listLocalActivities(decoded.uid) });
  } catch {
    return NextResponse.json({ error: "Unable to load activity." }, { status: 401 });
  }
}
