"use client";

import { auth, db } from "@/lib/firebase";
import { isSqlBackend } from "@/lib/data-backend";
import type { Role, UserProfile } from "@/types";
import { normalizeVerificationStatus } from "@/utils/verification";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  homePath: string;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true, isAdmin: false, homePath: "/dashboard", refreshProfile: async () => undefined });

function storedRecoveredRole(userId: string): Role | null {
  if (typeof window === "undefined") return null;
  const storedUserId = window.sessionStorage.getItem("temp.profile.uid");
  const storedRole = window.sessionStorage.getItem("temp.profile.role");
  if (storedUserId === userId && (storedRole === "worker" || storedRole === "client" || storedRole === "admin")) return storedRole;
  const persistedRole = window.localStorage.getItem(`temp.profile.role.${userId}`);
  return persistedRole === "worker" || persistedRole === "client" || persistedRole === "admin" ? persistedRole : null;
}

function roleHintHeaders(userId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  const pendingRole = window.localStorage.getItem(`temp.profile.pendingRole.${userId}`);
  const routeRole = window.location.pathname.startsWith("/jobs")
    ? "worker"
    : window.location.pathname.startsWith("/find-work") || window.location.pathname.startsWith("/workers") || window.location.pathname.startsWith("/completed-requests")
      ? "client"
      : "";
  const role = pendingRole === "worker" || pendingRole === "client" || pendingRole === "admin"
    ? pendingRole
    : routeRole;
  return role ? { "X-Temp-Role": role } : {};
}

function rememberRecoveredRole(userId: string, role: Role, email?: string) {
  if (typeof window === "undefined" || (role !== "worker" && role !== "client" && role !== "admin")) return;
  window.sessionStorage.setItem("temp.profile.uid", userId);
  window.sessionStorage.setItem("temp.profile.role", role);
  window.localStorage.setItem(`temp.profile.role.${userId}`, role);
  if (email) window.localStorage.setItem(`temp.accountRole.${email.toLowerCase()}`, role);
}

function rememberAvailableRoles(userId: string, roles: Role[]) {
  if (typeof window === "undefined") return;
  const validRoles = roles.filter(role => role === "worker" || role === "client" || role === "admin");
  window.localStorage.setItem(`temp.profile.roles.${userId}`, JSON.stringify(Array.from(new Set(validRoles))));
}

function storedEmailVerified(userId: string) {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem("temp.emailVerified.uid") === userId &&
    window.sessionStorage.getItem("temp.emailVerified") === "true";
}

function storedPhoto(userId: string) {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`temp.profile.photo.${userId}`) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed as { photoURL?: string; photoPositionX?: number; photoPositionY?: number; photoZoom?: number } : {};
  } catch {
    return {};
  }
}

function recoveredProfile(user: User, role: Role): UserProfile {
  const photo = storedPhoto(user.uid);
  return {
    id: user.uid,
    uid: user.uid,
    role,
    roles: role === "admin" ? ["admin"] : [role],
    displayName: user.displayName ?? user.email?.split("@")[0] ?? "Copic user",
    email: user.email ?? "",
    emailVerified: storedEmailVerified(user.uid) || user.emailVerified,
    emailVerifiedAt: null,
    phoneNumber: user.phoneNumber ?? undefined,
    photoURL: photo.photoURL ?? user.photoURL ?? undefined,
    photoPositionX: photo.photoPositionX ?? 50,
    photoPositionY: photo.photoPositionY ?? 50,
    photoZoom: photo.photoZoom ?? 1,
    skills: [],
    certificates: [],
    workHistory: [],
    ratingAverage: 0,
    ratingCount: 0,
    completedJobs: 0,
    verificationStatus: "not_submitted",
    driverLicenseVerificationStatus: "not_submitted",
    driverLicenseRejectionReason: null,
    profileCompleted: false,
    isLocked: false,
    outstandingServiceFee: 0,
    badges: role === "worker" ? ["Trial Worker"] : [],
    createdAt: null,
    updatedAt: null
  };
}

function profileFromDocument(user: User, data: Record<string, unknown>): UserProfile {
  const cachedPhoto = storedPhoto(user.uid);
  const emailVerified = data.emailVerified === true || user.emailVerified || storedEmailVerified(user.uid);
  const storedRole = storedRecoveredRole(user.uid);
  const pendingRole = typeof window !== "undefined" ? window.localStorage.getItem(`temp.profile.pendingRole.${user.uid}`) : null;
  const documentRole = data.role as UserProfile["role"];
  const roles = Array.isArray(data.roles) ? data.roles.filter((role): role is Role => role === "worker" || role === "client" || role === "admin") : documentRole === "worker" || documentRole === "client" || documentRole === "admin" ? [documentRole] : [];
  const pendingProfileRole = pendingRole === "worker" || pendingRole === "client" || pendingRole === "admin" ? pendingRole : null;
  const role = pendingProfileRole && (roles.includes(pendingProfileRole) || pendingProfileRole === documentRole)
    ? pendingProfileRole
    : documentRole === "worker" || documentRole === "client" || documentRole === "admin"
      ? documentRole
      : storedRole && roles.includes(storedRole)
        ? storedRole
        : documentRole;
  rememberAvailableRoles(user.uid, roles);
  if (role === "worker" || role === "client" || role === "admin") rememberRecoveredRole(user.uid, role, user.email ?? undefined);
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
    verificationStatus: normalizeVerificationStatus(data.verificationStatus ?? data.identityVerificationStatus ?? data.kycStatus),
    verificationRejectionReason: typeof data.verificationRejectionReason === "string" ? data.verificationRejectionReason : null,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const refreshInFlightRef = useRef(false);

  const refreshProfile = useCallback(async () => {
    if (!user || refreshInFlightRef.current) return;
    const quotaPausedUntil = Number(window.localStorage.getItem("temp.dataQuotaPausedUntil") ?? 0);
    if (Date.now() < quotaPausedUntil) return;
    refreshInFlightRef.current = true;
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}`, ...roleHintHeaders(user.uid) },
        cache: "no-store",
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to refresh profile.");
      if (payload.degraded) {
        window.localStorage.setItem("temp.dataQuotaPausedUntil", String(Date.now() + 300_000));
      }
      if (payload.profile) {
        setProfile(profileFromDocument(user, payload.profile as Record<string, unknown>));
        return;
      }
      const role = storedRecoveredRole(user.uid);
      setProfile(role ? recoveredProfile(user, role) : null);
    } catch {
      const role = storedRecoveredRole(user.uid);
      setProfile(current => current ?? (role ? recoveredProfile(user, role) : null));
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    const readinessTimeout = window.setTimeout(() => {
      if (active) setAuthLoading(false);
    }, 8_000);
    const unsubscribe = onAuthStateChanged(auth, nextUser => {
      if (!active) return;
      window.clearTimeout(readinessTimeout);
      setUser(nextUser);
      setProfile(nextUser ? (storedRecoveredRole(nextUser.uid) ? recoveredProfile(nextUser, storedRecoveredRole(nextUser.uid)!) : null) : null);
      setAuthLoading(false);
      setProfileLoading(!!nextUser);
    }, () => {
      if (!active) return;
      window.clearTimeout(readinessTimeout);
      setUser(null);
      setProfile(null);
      setAuthLoading(false);
      setProfileLoading(false);
    });
    return () => {
      active = false;
      window.clearTimeout(readinessTimeout);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !db) {
      setProfileLoading(false);
      return;
    }
    if (isSqlBackend()) {
      const activeUser = user;
      let cancelled = false;
      async function loadSqlProfile() {
        try {
          const token = await activeUser.getIdToken();
          const response = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}`, ...roleHintHeaders(activeUser.uid) },
            cache: "no-store",
            credentials: "same-origin"
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load profile.");
          if (cancelled) return;
          if (payload.profile) {
            const nextProfile = profileFromDocument(activeUser, payload.profile as Record<string, unknown>);
            setProfile(nextProfile);
          } else {
            const role = storedRecoveredRole(activeUser.uid);
            setProfile(role ? recoveredProfile(activeUser, role) : null);
          }
        } catch {
          const role = storedRecoveredRole(activeUser.uid);
          setProfile(role ? recoveredProfile(activeUser, role) : null);
        } finally {
          if (!cancelled) setProfileLoading(false);
        }
      }
      void loadSqlProfile();
      return () => {
        cancelled = true;
      };
    }
    return onSnapshot(
      doc(db, "users", user.uid),
      snapshot => {
        if (snapshot.exists()) {
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem("temp.profile.uid");
            window.sessionStorage.removeItem("temp.profile.role");
          }
          setProfile(profileFromDocument(user, snapshot.data()));
        } else {
          const role = storedRecoveredRole(user.uid);
          setProfile(role ? recoveredProfile(user, role) : null);
        }
        setProfileLoading(false);
      },
      () => {
        const role = storedRecoveredRole(user.uid);
        setProfile(role ? recoveredProfile(user, role) : null);
        setProfileLoading(false);
      }
    );
  }, [refreshProfile, user]);

  const loading = authLoading || profileLoading;
  const homePath = profile?.role === "admin" ? "/admin" : profile?.role === "client" ? "/find-work" : "/jobs";
  const value = useMemo(() => ({ user, profile, loading, isAdmin: profile?.role === "admin", homePath, refreshProfile }), [user, profile, loading, homePath, refreshProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
