"use client";

import { requireDb } from "@/lib/firebase";
import { requireAuth } from "@/lib/firebase";
import { isSqlBackend } from "@/lib/data-backend";
import type { Activity } from "@/types";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";

export function subscribeActivities(userId: string, callback: (items: Activity[]) => void, onError?: (error: Error) => void) {
  if (isSqlBackend()) {
    let active = true;
    const load = async () => {
      try {
        const user = requireAuth().currentUser;
        if (!user) return;
        const response = await fetch("/api/activities", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        const payload = await response.json() as { activities?: Activity[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load activity.");
        if (active) callback(payload.activities ?? []);
      } catch (error) {
        if (active) onError?.(error instanceof Error ? error : new Error("Unable to load activity."));
      }
    };
    void load();
    const timer = window.setInterval(load, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }
  const db = requireDb();
  return onSnapshot(
    query(collection(db, "activities"), where("userId", "==", userId), orderBy("createdAt", "desc"), limit(8)),
    snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as Activity)),
    error => onError?.(error)
  );
}
