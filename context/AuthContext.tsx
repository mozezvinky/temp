"use client";

import { auth, db } from "@/lib/firebase";
import { isSqlBackend } from "@/lib/data-backend";
import type { UserProfile } from "@/types";
import { accountRole, accountRoles, accountHome, onboardingState } from "@/utils/onboarding";
import { normalizeVerificationStatus } from "@/utils/verification";
import { onIdTokenChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  homePath: string;
  profileError: string | null;
  state: ReturnType<typeof onboardingState>;
  resolveProfile: () => Promise<UserProfile | null>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true, isAdmin: false, homePath: "/dashboard", profileError: null, state: "loading", resolveProfile: async () => null, refreshProfile: async () => {} });

function storedPhoto(userId: string) {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`temp.profile.photo.${userId}`) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed as { photoURL?: string; photoPositionX?: number; photoPositionY?: number; photoZoom?: number } : {};
  } catch {
    return {};
  }
}

function strongestVerificationStatus(...values: unknown[]) {
  const statuses = values.map(normalizeVerificationStatus);
  if (statuses.includes("approved")) return "approved";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("rejected")) return "rejected";
  return "not_submitted";
}

function profileFromDocument(user: User, data: Record<string, unknown>): UserProfile | null {
  const cachedPhoto = storedPhoto(user.uid);
  const emailVerified = user.emailVerified;
  const role = accountRole(data);
  const roles = accountRoles(data);
  if (!role) return null;
  return {
    ...data,
    id: user.uid,
    uid: String(data.uid ?? user.uid),
    role,
    roles,
    displayName: String(data.displayName ?? user.displayName ?? "Copic user"),
    email: String(data.email ?? user.email ?? ""),
    emailVerified,
    emailVerifiedAt: (data.emailVerifiedAt as UserProfile["emailVerifiedAt"]) ?? null,
    phoneNumber: data.phoneNumber ? String(data.phoneNumber) : data.phone ? String(data.phone) : undefined,
    photoURL: data.photoURL ? String(data.photoURL) : cachedPhoto.photoURL ?? user.photoURL ?? undefined,
    photoPositionX: Number(data.photoPositionX ?? cachedPhoto.photoPositionX ?? 50),
    photoPositionY: Number(data.photoPositionY ?? cachedPhoto.photoPositionY ?? 50),
    photoZoom: Number(data.photoZoom ?? cachedPhoto.photoZoom ?? 1),
    location: data.location as UserProfile["location"],
    skills: Array.isArray(data.skills) ? data.skills as string[] : [],
    skillProfiles: Array.isArray(data.skillProfiles) ? data.skillProfiles as UserProfile["skillProfiles"] : [],
    certificates: Array.isArray(data.certificates) ? data.certificates as string[] : [],
    workHistory: Array.isArray(data.workHistory) ? data.workHistory as string[] : [],
    ratingAverage: Number(data.ratingAverage ?? 0),
    ratingCount: Number(data.ratingCount ?? 0),
    completedJobs: Number(data.completedJobs ?? 0),
    verificationStatus: strongestVerificationStatus(data.verificationStatus, data.identityVerificationStatus, data.kycStatus),
    verificationRejectionReason: typeof data.verificationRejectionReason === "string" ? data.verificationRejectionReason : null,
    agentEnabled: data.agentEnabled === true,
    driverLicenseExpiryDate: typeof data.driverLicenseExpiryDate === "string" ? data.driverLicenseExpiryDate : undefined,
    driverLicenseVerificationStatus: normalizeVerificationStatus(data.driverLicenseVerificationStatus),
    driverLicenseRejectionReason: typeof data.driverLicenseRejectionReason === "string" ? data.driverLicenseRejectionReason : null,
    profileCompleted: Boolean(data.profileCompleted),
    isLocked: Boolean(data.isLocked),
    outstandingServiceFee: Number(data.outstandingServiceFee ?? 0),
    badges: Array.isArray(data.badges) ? data.badges as string[] : [],
    createdAt: (data.createdAt as UserProfile["createdAt"]) ?? null,
    updatedAt: (data.updatedAt as UserProfile["updatedAt"]) ?? null
  };
}

function profileDataWithVerificationRecords(data: Record<string, unknown>, identity: Record<string, unknown> | null, driverLicense: Record<string, unknown> | null) {
  const merged = { ...data };
  if (identity) {
    const status = normalizeVerificationStatus(identity.status);
    merged.verificationStatus = status;
    merged.identityVerificationStatus = status;
    merged.verificationRejectionReason = status === "rejected" && typeof identity.rejectionReason === "string" ? identity.rejectionReason : null;
  }
  if (driverLicense) {
    const status = normalizeVerificationStatus(driverLicense.status);
    merged.driverLicenseVerificationStatus = status;
    merged.driverLicenseExpiryDate = driverLicense.expiryDate;
    merged.driverLicenseRejectionReason = status === "rejected" && typeof driverLicense.rejectionReason === "string" ? driverLicense.rejectionReason : null;
  }
  return merged;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const activeUid = useRef<string | null>(null);
  const requestVersion = useRef(0);

  const resolveProfile = useCallback(async (): Promise<UserProfile | null> => {
    const current = auth?.currentUser;
    if (!current) return null;
    const version = ++requestVersion.current;
    setProfileLoading(true);
    setProfileError(null);
    try {
      await current.reload();
      if (auth?.currentUser?.uid !== current.uid || version !== requestVersion.current) throw new Error("Account request superseded.");
      setEmailVerified(current.emailVerified);
      if (!current.emailVerified) { setProfile(null); return null; }
      const token = await current.getIdToken(true);
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", credentials: "same-origin",
        signal: AbortSignal.timeout(15_000)
      });
      const payload = await response.json();
      if (!response.ok || payload.degraded) throw new Error("Unable to load your account. Please try again.");
      if (auth?.currentUser?.uid !== current.uid || version !== requestVersion.current) throw new Error("Account request superseded.");
      const next = payload.profile ? profileFromDocument(current, payload.profile) : null;
      setProfile(next);
      return next;
    } catch {
      if (auth?.currentUser?.uid === current.uid && version === requestVersion.current) {
        setProfileError("Unable to load your account. Please try again.");
      }
      throw new Error("Unable to load your account. Please try again.");
    } finally {
      if (version === requestVersion.current) setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    return onIdTokenChanged(auth, next => {
      const changed = activeUid.current !== (next?.uid ?? null);
      activeUid.current = next?.uid ?? null;
      setUser(next);
      setEmailVerified(next?.emailVerified ?? false);
      setAuthLoading(false);
      if (!next) {
        ++requestVersion.current;
        setProfile(null); setProfileLoading(false); setProfileError(null);
      } else if (changed) {
        setProfile(null);
        void resolveProfile().catch(() => {});
      }
    }, () => {
      setAuthLoading(false);
      setProfileError("Unable to restore your session. Please sign in again.");
    });
  }, [resolveProfile]);

  useEffect(() => {
    if (!user || !emailVerified || !db || isSqlBackend()) return;
    let stopped = false;
    let userData: Record<string, unknown> | null | undefined;
    let identity: Record<string, unknown> | null = null;
    let license: Record<string, unknown> | null = null;
    const update = () => {
      if (stopped || userData === undefined || auth?.currentUser?.uid !== user.uid) return;
      setProfile(userData ? profileFromDocument(user, profileDataWithVerificationRecords(userData, identity, license)) : null);
      setProfileError(null);
    };
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), snapshot => {
      // Cached absence is not proof that the account has no saved role.
      if (snapshot.metadata?.fromCache) return;
      userData = snapshot.exists() ? snapshot.data() : null;
      update();
    }, () => { void resolveProfile().catch(() => {}); });
    const unsubscribeIdentity = onSnapshot(doc(db, "verifications", user.uid), snapshot => {
      identity = snapshot.exists() ? snapshot.data() : null; update();
    }, () => {});
    const unsubscribeLicense = onSnapshot(doc(db, "verifications", `driver-license-${user.uid}`), snapshot => {
      license = snapshot.exists() ? snapshot.data() : null; update();
    }, () => {});
    return () => { stopped = true; unsubscribe(); unsubscribeIdentity(); unsubscribeLicense(); };
  }, [user, emailVerified, resolveProfile]);

  const refreshProfile = useCallback(async () => { await resolveProfile().catch(() => null); }, [resolveProfile]);
  const loading = authLoading || profileLoading;
  const state = onboardingState(user ? { emailVerified } : null, profile, loading, profileError);
  const homePath = accountHome(accountRole(profile));
  const value = useMemo<AuthState>(() => ({ user, profile, loading, profileError, state, isAdmin: profile?.role === "admin", homePath, resolveProfile, refreshProfile }), [user, profile, loading, profileError, state, homePath, resolveProfile, refreshProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
