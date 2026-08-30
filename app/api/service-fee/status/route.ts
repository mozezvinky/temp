import { adminAuth } from "@/lib/firebase-admin";
import { getServiceFeePaywallState } from "@/lib/service-fee-state";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(token);
    const paywall = await getServiceFeePaywallState(decoded.uid);
    return NextResponse.json({ paywall });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load service fee status." }, { status: 500 });
  }
}
