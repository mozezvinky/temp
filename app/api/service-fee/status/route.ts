import { verifyVerifiedIdToken } from "@/lib/verified-auth";
import { getServiceFeePaywallState } from "@/lib/service-fee-state";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await verifyVerifiedIdToken(token);
    const paywall = await getServiceFeePaywallState(decoded.uid);
    return NextResponse.json({ paywall });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load service fee status." }, { status: 500 });
  }
}
