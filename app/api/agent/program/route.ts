import { NextResponse } from "next/server";
import { AGENT_RATE } from "@/functions/src/agent-policy";
export const dynamic = "force-dynamic";
/** Public fixed program rate; historical ledger rates remain immutable. */
export async function GET() {
  return NextResponse.json({ commissionRate: AGENT_RATE }, { headers: { "Cache-Control": "no-store" } });
}
