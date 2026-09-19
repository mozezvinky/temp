import { verifyVerifiedIdToken } from "@/lib/verified-auth";
import { resolveCurrentLocationWithGoogle } from "@/lib/google-location";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    await verifyVerifiedIdToken(token);

    const body = await request.json().catch(() => ({}));
    const latitude = Number((body as Record<string, unknown>).latitude);
    const longitude = Number((body as Record<string, unknown>).longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: "Valid coordinates are required." }, { status: 400 });
    }

    const resolved = await resolveCurrentLocationWithGoogle({ latitude, longitude });
    return NextResponse.json(resolved);
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to resolve this location." }, { status: 500 });
  }
}
