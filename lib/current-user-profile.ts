import "server-only";

import { shouldUseFirebase } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getLocalUser, getLocalUserByEmail, linkLocalUserUidByEmail, upsertLocalUser } from "@/lib/local-sql";
import type { Role, UserProfile, VerificationStatus } from "@/types";
import { normalizeVerificationStatus } from "@/utils/verification";
import type { DecodedIdToken } from "firebase-admin/auth";
import { NextRequest } from "next/server";

export type CurrentUserProfile = {
  id: string;
  uid: string;
  email?: string;
  username: string;
  role?: Role;
  displayName: string;
  emailVerified: boolean;
  localProfileFound: boolean;
  profile: UserProfile | null;
  decoded: DecodedIdToken;
};

export async function getCurrentUserProfile(request: NextRequest, fallbackRole?: Role | null): Promise<CurrentUserProfile> {
  const token = authTokenFromRequest(request);
  if (!token) throw new CurrentUserProfileError("Sign in is required.", 401);

  const decoded = await adminAuth().verifyIdToken(token);
  const email = typeof decoded.email === "string" ? decoded.email : undefined;
  const displayName = typeof decoded.name === "string" && decoded.name.trim()
    ? decoded.name.trim()
    : email?.split("@")[0] ?? "Copic user";

  if (!shouldUseFirebase()) {
    const roleHint = fallbackRole ?? roleFromRequest(request);
    const profile = ensureLocalUserProfile(decoded, roleHint);
    return {
      id: profile?.id ?? decoded.uid,
      uid: profile?.uid ?? decoded.uid,
      email: profile?.email ?? email,
      username: usernameFor(profile?.displayName ?? displayName, profile?.email ?? email, decoded.uid),
      role: profile?.role,
      displayName: profile?.displayName ?? displayName,
      emailVerified: profile?.emailVerified ?? decoded.email_verified === true,
      localProfileFound: Boolean(profile),
      profile,
      decoded
    };
  }

  const snapshot = await adminDb().collection("users").doc(decoded.uid).get();
  const data = snapshot.exists ? snapshot.data() as Partial<UserProfile> : null;
  const role = activeRoleFor(data, fallbackRole ?? roleFromRequest(request));
  const activeRoles = rolesFor(data, role);
  const emailVerified = data?.emailVerified === true || decoded.email_verified === true;
  const baseProfile = snapshot.exists && data
    ? ({ id: snapshot.id, uid: snapshot.id, ...data, role, roles: activeRoles, emailVerified } as UserProfile)
    : null;
  const profile = await withFirestoreVerificationStatus(decoded.uid, baseProfile);
  return {
    id: decoded.uid,
    uid: decoded.uid,
    email: typeof data?.email === "string" ? data.email : email,
    username: usernameFor(data?.displayName ?? displayName, data?.email ?? email, decoded.uid),
    role,
    displayName: typeof data?.displayName === "string" ? data.displayName : displayName,
    emailVerified,
    localProfileFound: false,
    profile,
    decoded
  };
}

export async function withFirestoreVerificationStatus<T extends Partial<UserProfile>>(uid: string, profile: T | null): Promise<T | null> {
  if (!profile) return profile;

  const [identitySnap, driverLicenseSnap] = await Promise.all([
    adminDb().collection("verifications").doc(uid).get(),
    adminDb().collection("verifications").doc(`driver-license-${uid}`).get()
  ]);

  return mergeFirestoreVerificationRecords(
    profile,
    identitySnap.exists ? identitySnap.data() : null,
    driverLicenseSnap.exists ? driverLicenseSnap.data() : null
  );
}

export function mergeFirestoreVerificationRecords<T extends Partial<UserProfile>>(
  profile: T | null,
  identity: Record<string, unknown> | null | undefined,
  driverLicense: Record<string, unknown> | null | undefined
): T | null {
  if (!profile) return profile;

  const nextProfile = { ...profile };
  const identityStatus = normalizeVerificationStatus(identity?.identityVerificationStatus ?? identity?.status);
  if (isVerificationStatus(identityStatus)) {
    nextProfile.verificationStatus = identityStatus;
    nextProfile.verificationRejectionReason = identityStatus === "rejected"
      ? stringOrNull(identity?.rejectionReason)
      : null;
  }

  const driverLicenseStatus = normalizeVerificationStatus(driverLicense?.driverLicenseVerificationStatus ?? driverLicense?.status);
  if (isVerificationStatus(driverLicenseStatus)) {
    nextProfile.driverLicenseVerificationStatus = driverLicenseStatus;
    nextProfile.driverLicenseRejectionReason = driverLicenseStatus === "rejected"
      ? stringOrNull(driverLicense?.rejectionReason)
      : null;
  }

  return nextProfile;
}

function isVerificationStatus(value: unknown): value is VerificationStatus {
  return value === "not_submitted" || value === "pending" || value === "approved" || value === "rejected";
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function ensureLocalUserProfile(decoded: DecodedIdToken, fallbackRole?: Role | null) {
  const email = typeof decoded.email === "string" ? decoded.email : undefined;
  const displayName = typeof decoded.name === "string" && decoded.name.trim()
    ? decoded.name.trim()
    : email?.split("@")[0] ?? "Copic user";

  const byUid = getLocalUser(decoded.uid);
  if (byUid) {
    return selectLocalRole(byUid, fallbackRole, decoded);
  }

  const byEmail = email ? getLocalUserByEmail(email) : null;
  if (byEmail) {
    const linked = email ? linkLocalUserUidByEmail(email, decoded.uid) ?? byEmail : byEmail;
    return selectLocalRole(linked, fallbackRole, decoded);
  }

  const role = fallbackRole === "client" || fallbackRole === "worker" || fallbackRole === "admin" ? fallbackRole : null;
  if (!role) {
    return null;
  }

  const created = upsertLocalUser({
    uid: decoded.uid,
    email: email ?? null,
    displayName,
    role,
    phoneNumber: typeof decoded.phone_number === "string" ? decoded.phone_number : null,
    emailVerified: decoded.email_verified === true
  });
  return created;
}

function selectLocalRole(profile: UserProfile, roleHint: Role | null | undefined, decoded: DecodedIdToken) {
  if (profile.role === "admin") return profile;
  if (roleHint !== "worker" && roleHint !== "client") return profile;
  const roles = Array.from(new Set([...(profile.roles ?? []), profile.role, roleHint].filter((role): role is Role => role === "worker" || role === "client" || role === "admin")));
  if (!roles.includes(roleHint) || profile.role !== roleHint || JSON.stringify(profile.roles ?? []) !== JSON.stringify(roles)) {
    const saved = upsertLocalUser({
      uid: decoded.uid,
      email: profile.email ?? (typeof decoded.email === "string" ? decoded.email : null),
      displayName: profile.displayName,
      role: roleHint,
      phoneNumber: profile.phoneNumber ?? (typeof decoded.phone_number === "string" ? decoded.phone_number : null),
      emailVerified: profile.emailVerified || decoded.email_verified === true
    });
    if (saved) return saved;
  }
  return { ...profile, role: roleHint, roles };
}

function authTokenFromRequest(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7);
  return request.cookies.get("__session")?.value ?? request.cookies.get("token")?.value ?? "";
}

function roleFromRequest(request: NextRequest): Role | null {
  const value = request.headers.get("x-temp-role") ?? request.cookies.get("temp-role")?.value ?? "";
  return value === "client" || value === "worker" || value === "admin" ? value : null;
}

function rolesFor(data: Partial<UserProfile> | null, activeRole?: Role): Role[] {
  const role = data?.role;
  const roles = Array.isArray(data?.roles) ? data.roles : [];
  return Array.from(new Set([...roles, role, activeRole].filter((item): item is Role => item === "client" || item === "worker" || item === "admin")));
}

function activeRoleFor(data: Partial<UserProfile> | null, roleHint?: Role | null): Role | undefined {
  const roles = rolesFor(data);
  if (roles.includes("admin")) return "admin";
  if (roleHint && roles.includes(roleHint)) return roleHint;
  return roles[0];
}

function usernameFor(displayName: string, email: string | undefined, uid: string) {
  return (displayName || email || uid).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || uid.slice(0, 12);
}

export class CurrentUserProfileError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
