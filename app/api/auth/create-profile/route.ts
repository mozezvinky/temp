import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { isSqlBackend } from "@/lib/data-backend";
import { upsertLocalUser } from "@/lib/local-sql";
import type { Role } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const roles: Role[] = ["worker", "client"];

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(token);
    const authUser = await adminAuth().getUser(decoded.uid);
    const body = await request.json().catch(() => ({}));
    const role = String(body.role ?? "") as Role;
    const displayName = String(body.displayName ?? authUser.displayName ?? authUser.email?.split("@")[0] ?? "Copic user").trim();
    const phoneNumber = body.phoneNumber ? String(body.phoneNumber) : authUser.phoneNumber ?? null;

    if (!roles.includes(role)) {
      return NextResponse.json({ error: "Choose either a worker or client account." }, { status: 400 });
    }

    if (isSqlBackend()) {
      const existingProfile = upsertLocalUser({
        uid: decoded.uid,
        role,
        displayName: displayName || "Copic user",
        email: authUser.email ?? decoded.email ?? null,
        phoneNumber,
        emailVerified: authUser.emailVerified
      });
      return NextResponse.json({ success: true, role: existingProfile?.role ?? role, roles: existingProfile?.roles ?? [role] });
    }

    const db = adminDb();
    const userRef = db.collection("users").doc(decoded.uid);

    const savedProfile = await db.runTransaction(async transaction => {
      const userSnap = await transaction.get(userRef);
      const existingData = userSnap.data();
      const existingRole = userSnap.exists ? userSnap.data()?.role : null;
      if (existingRole === "admin") {
        throw new Error("This account is managed by an administrator.");
      }
      const existingRoles = Array.isArray(existingData?.roles) ? existingData.roles.filter(item => roles.includes(item as Role)) as Role[] : [];
      const nextRoles = Array.from(new Set([...existingRoles, ...(roles.includes(existingRole as Role) ? [existingRole as Role] : []), role]));

      transaction.set(
        userRef,
        {
          uid: decoded.uid,
          role,
          roles: nextRoles,
          displayName: existingData?.displayName ?? (displayName || "Copic user"),
          email: existingData?.email ?? authUser.email ?? decoded.email ?? null,
          phoneNumber: existingData?.phoneNumber ?? phoneNumber,
          emailVerified: existingData?.emailVerified === true,
          emailVerifiedAt: existingData?.emailVerifiedAt ?? null,
          verificationStatus: existingData?.verificationStatus ?? "not_submitted",
          driverLicenseVerificationStatus: existingData?.driverLicenseVerificationStatus ?? "not_submitted",
          driverLicenseRejectionReason: existingData?.driverLicenseRejectionReason ?? null,
          profileCompleted: existingData?.profileCompleted === true,
          skills: Array.isArray(existingData?.skills) ? existingData?.skills : [],
          skillProfiles: Array.isArray(existingData?.skillProfiles) ? existingData?.skillProfiles : [],
          certificates: Array.isArray(existingData?.certificates) ? existingData?.certificates : [],
          workHistory: Array.isArray(existingData?.workHistory) ? existingData?.workHistory : [],
          ratingAverage: Number(existingData?.ratingAverage ?? 0),
          ratingCount: Number(existingData?.ratingCount ?? 0),
          trustScore: Number(existingData?.trustScore ?? 0),
          completedJobs: Number(existingData?.completedJobs ?? 0),
          isLocked: existingData?.isLocked === true,
          outstandingServiceFee: Number(existingData?.outstandingServiceFee ?? 0),
          badges: Array.isArray(existingData?.badges) ? existingData?.badges : role === "worker" ? ["Trial Worker"] : [],
          createdAt: existingData?.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      return { role, roles: nextRoles };
    });

    return NextResponse.json({ success: true, role: savedProfile.role, roles: savedProfile.roles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create account profile.";
    return NextResponse.json({ error: message }, { status: message.includes("Sign in") ? 401 : 400 });
  }
}
