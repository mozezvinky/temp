"use client";

import { requireAuth } from "@/lib/firebase";
import type { UserProfile } from "@/types";
import { normalizeVerificationStatus } from "@/utils/verification";

function normalizeWorker(item: UserProfile) {
  return {
    ...item,
    id: item.id ?? item.uid,
    uid: item.uid ?? item.id,
    skills: Array.isArray(item.skills) ? item.skills : [],
    certificates: Array.isArray(item.certificates) ? item.certificates : [],
    skillProfiles: Array.isArray(item.skillProfiles) ? item.skillProfiles : [],
    verificationStatus: normalizeVerificationStatus(item.verificationStatus),
    isOccupied: Boolean(item.isOccupied),
    activeJobCount: Number(item.activeJobCount ?? 0)
  } as UserProfile;
}

function usesOneShotDevFetch() {
  return process.env.NODE_ENV === "development";
}

export function subscribeWorkers(callback: (items: UserProfile[]) => void, onError?: (error: Error) => void) {
  let stopped = false;
  const load = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
    const user = requireAuth().currentUser;
    if (!user) throw new Error("Please sign in to load workers.");
    const response = await fetch("/api/users?role=worker", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    const payload = await response.json().catch(() => ({})) as { users?: UserProfile[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Unable to load workers.");
    if (!stopped) callback((payload.users ?? []).map(normalizeWorker));
  };
  const run = () => void load().catch(error => !stopped && onError?.(error instanceof Error ? error : new Error("Unable to load workers.")));
  run();
  if (usesOneShotDevFetch()) return () => {
    stopped = true;
  };
  const interval = window.setInterval(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    run();
  }, 5000);
  const resume = () => run();
  window.addEventListener("online", resume);
  window.addEventListener("offline", run);
  return () => {
    stopped = true;
    window.clearInterval(interval);
    window.removeEventListener("online", resume);
    window.removeEventListener("offline", run);
  };
}
