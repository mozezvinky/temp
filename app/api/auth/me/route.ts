import { isSqlBackend } from "@/lib/data-backend";
import { CurrentUserProfileError, getCurrentUserProfile } from "@/lib/current-user-profile";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { upsertLocalUser } from "@/lib/local-sql";
import type { Role } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserProfile(request);

    if (isSqlBackend()) {
      if (currentUser.profile) return NextResponse.json({ profile: currentUser.profile });
      return NextResponse.json({
        profile: null,
        authUser: {
          uid: currentUser.uid,
          email: currentUser.email ?? null,
          displayName: currentUser.displayName,
          phoneNumber: null
        }
      });
    }

    if (currentUser.profile) {
      const verification = await adminDb().collection("verifications").doc(currentUser.uid).get();
      const verificationStatus = verification.data()?.status;
      if (verificationStatus === "approved" || verificationStatus === "pending" || verificationStatus === "rejected") {
        return NextResponse.json({
          profile: {
            ...currentUser.profile,
            verificationStatus,
            identityVerificationStatus: verificationStatus,
            verificationRejectionReason: verificationStatus === "rejected" ? verification.data()?.rejectionReason ?? null : null
          }
        });
      }
    }
    return NextResponse.json({ profile: currentUser.profile });
  } catch (error) {
    if (error instanceof CurrentUserProfileError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Unable to load account profile.";
    if (message.includes("RESOURCE_EXHAUSTED") || message.includes("Quota exceeded")) {
      return NextResponse.json({ profile: null, degraded: true, reason: "quota" });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSqlBackend()) return NextResponse.json({ error: "SQL backend is not enabled." }, { status: 400 });
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(token);
    const authUser = await adminAuth().getUser(decoded.uid);
    const body = await request.json().catch(() => ({}));
    const role = body.role === "client" ? "client" : body.role === "worker" ? "worker" : null;
    if (!role) return NextResponse.json({ error: "Choose either a worker or client account." }, { status: 400 });

    const profile = upsertLocalUser({
      uid: decoded.uid,
      email: authUser.email ?? decoded.email ?? null,
      displayName: String(body.displayName ?? authUser.displayName ?? authUser.email?.split("@")[0] ?? "Copic user"),
      role,
      phoneNumber: typeof body.phoneNumber === "string" ? body.phoneNumber : authUser.phoneNumber ?? null,
      emailVerified: authUser.emailVerified
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save account profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
