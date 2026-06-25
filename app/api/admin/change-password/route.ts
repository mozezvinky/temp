import { adminErrorStatus, requireAdmin } from "@/lib/admin-security";
import { saveAdminPassword } from "@/lib/admin-credentials";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request, "admins:manage");
    const body = await request.json().catch(() => ({}));
    const password = String(body.password ?? "");
    if (password.length < 8) return NextResponse.json({ error: "Use a password with at least 8 characters." }, { status: 400 });
    await saveAdminPassword(password);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to change the admin password." }, { status: adminErrorStatus(error) });
  }
}
