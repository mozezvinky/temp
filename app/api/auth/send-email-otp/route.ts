import { NextResponse } from "next/server";

/** Older open tabs must move to the shared Firebase verification-link screen. */
export async function POST() {
  return NextResponse.json({ error: "Open /verify-email to verify your email with a verification link.", verificationPath: "/verify-email" }, { status: 410 });
}
