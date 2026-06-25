import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ error: "Rehire has been removed from this platform." }, { status: 410 });
}
