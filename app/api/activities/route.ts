import { verifyVerifiedIdToken } from "@/lib/verified-auth";
import { isSqlBackend } from "@/lib/data-backend";
import { listLocalActivities } from "@/lib/local-sql";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (!isSqlBackend()) return NextResponse.json({ error: "SQL backend is not enabled." }, { status: 400 });
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const decoded = await verifyVerifiedIdToken(token);
    return NextResponse.json({ activities: listLocalActivities(decoded.uid) });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    return NextResponse.json({ error: "Unable to load activity." }, { status: 401 });
  }
}
