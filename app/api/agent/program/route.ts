import { adminDb } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public program information only; never expose agent identities or configuration documents. */
export async function GET() {
  try {
    const config = await adminDb().doc("marketplaceConfig/agents").get();
    // Same configuration and legacy default as marketplace-completions.
    const commissionRate = Number(config.data()?.commissionRate ?? 0.01);
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) throw new Error("Invalid configuration");
    return NextResponse.json({ commissionRate }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Commission information is temporarily unavailable." }, { status: 503 });
  }
}
