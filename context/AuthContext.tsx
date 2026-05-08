"use client";

import { auth, db, requireDb } from "@/lib/firebase";
import type { Role, UserProfile } from "@/types";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  homePath: string;
}

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true, isAdmin: false, homePath: "/dashboard" });

function pendingRole(): Role {
  if (typeof window === "undefined") return "worker";
  const stored = window.localStorage.getItem("temp_pending_role");
  return stored === "client" ? "client" : "worker";
}

function fallbackProfile(user: User): UserProfile {
  const role = pendingRole();
  return {
    id: user.uid,
    role,
    accountType: role,
    displayName: user.displayName || user.email?.split("@")[0] || "Temp user",
    email: user.email ?? undefined,
    phone: user.phoneNumber ?? undefined,
    photoURL: user.photoURL ?? undefined,
    skills: [],
    certificates: [],
    workHistory: [],
    ratingAverage: 0,
    ratingCount: 0,
    trustScore: 0,
    completedJobs: 0,
    kycStatus: "pending",
    verificationStatus: "pending",
    isLocked: false,
    outstandingServiceFee: 0,
    walletBalance: 0,
    badges: role === "worker" ? ["Trial Worker"] : [],
    createdAt: null,
    updatedAt: null
  } as unknown as UserProfile;
}

async function ensureProfileDocument(user: User, profile: UserProfile) {
  const firestore = requireDb();
  await setDoc(
    doc(firestore, "users", user.uid),
    {
      id: user.uid,
      role: profile.role,
      accountType: profile.role,
      displayName: profile.displayName,
      email: user.email ?? null,
      phone: user.phoneNumber ?? null,
      photoURL: user.photoURL ?? null,
      profileDetails: {
        displayName: profile.displayName,
        role: profile.role,
        onboardingComplete: false
      },
      skills: [],
      certificates: [],
      workHistory: [],
      ratingAverage: 0,
      ratingCount: 0,
      trustScore: 0,
      completedJobs: 0,
      kycStatus: "pending",
      verificationStatus: "pending",
      isLocked: false,
      outstandingServiceFee: 0,
      walletBalance: 0,
      badges: profile.role === "worker" ? ["Trial Worker"] : [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
  await setDoc(
    doc(firestore, "wallets", user.uid),
    {
      id: user.uid,
      userId: user.uid,
      balance: 0,
      pendingPayouts: 0,
      outstandingServiceFee: 0,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    return onAuthStateChanged(auth, nextUser => {
      setUser(nextUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    if (!db) {
      setProfile(fallbackProfile(user));
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const fallbackTimer = window.setTimeout(() => {
      setProfile(current => current ?? fallbackProfile(user));
      setProfileLoading(false);
    }, 4500);
    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      snap => {
        window.clearTimeout(fallbackTimer);
        if (snap.exists()) {
          setProfile({ id: snap.id, ...snap.data() } as UserProfile);
        } else {
          const fallback = fallbackProfile(user);
          setProfile(fallback);
          ensureProfileDocument(user, fallback).catch(() => undefined);
        }
        setProfileLoading(false);
      },
      () => {
        window.clearTimeout(fallbackTimer);
        setProfile(fallbackProfile(user));
        setProfileLoading(false);
      }
    );
    return () => {
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [user]);

  const loading = authLoading || (!!user && profileLoading);
  const homePath = profile?.role === "worker" ? "/jobs" : profile?.role === "client" ? "/find-work" : "/dashboard";
  const value = useMemo(() => ({ user, profile, loading, isAdmin: profile?.role === "admin", homePath }), [user, profile, loading, homePath]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
