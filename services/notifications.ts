"use client";

import { messaging, requireAuth, requireDb } from "@/lib/firebase";
import type { AppNotification } from "@/types";
import { getToken, onMessage } from "firebase/messaging";
import { doc, updateDoc } from "firebase/firestore";
import { toast } from "sonner";

function notifyNotificationsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("copic:notifications-changed"));
}

export async function enablePush(userId: string) {
  const db = requireDb();
  const instance = await messaging();
  if (!instance) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const token = await getToken(instance, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: await navigator.serviceWorker.ready
  });
  await updateDoc(doc(db, "users", userId), { fcmToken: token });
  return token;
}

export async function foregroundMessages() {
  const instance = await messaging();
  if (!instance) return () => undefined;
  return onMessage(instance, payload => {
    toast(payload.notification?.title ?? "Copic", { description: payload.notification?.body });
    notifyNotificationsChanged();
    window.dispatchEvent(new Event("copic:applications-changed"));
  });
}

export function subscribeNotifications(userId: string, callback: (items: AppNotification[]) => void, onError?: (error: Error) => void, archived = false) {
  void userId;
  let stopped = false;
  let inFlight = false;
  let intervalMs = 30_000;
  let timeoutId: number | null = null;
  const quotaCooldownUntil = () => {
    if (process.env.NEXT_PUBLIC_DATA_BACKEND === "local-sqlite") {
      window.localStorage.removeItem("temp.dataQuotaPausedUntil");
      return 0;
    }
    return Number(window.localStorage.getItem("temp.dataQuotaPausedUntil") ?? 0);
  };
  const load = async () => {
    if (inFlight || stopped) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
    if (Date.now() < quotaCooldownUntil()) throw new Error("quota-paused");
    inFlight = true;
    try {
    const user = requireAuth().currentUser;
    if (!user) throw new Error("Please sign in to load alerts.");
    const token = await user.getIdToken();
    const response = await fetch(`/api/notifications${archived ? "?archived=true" : ""}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load alerts.");
    if (payload.degraded && payload.reason === "quota") {
      window.localStorage.setItem("temp.dataQuotaPausedUntil", String(Date.now() + 300_000));
      intervalMs = 300_000;
    }
    if (!stopped) callback(Array.isArray(payload.notifications) ? payload.notifications as AppNotification[] : []);
    } finally {
      inFlight = false;
    }
  };
  const run = () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (!stopped) onError?.(new Error("offline"));
      return;
    }
    void load()
      .then(() => {
        if (Date.now() >= quotaCooldownUntil()) intervalMs = 30_000;
      })
      .catch(error => {
        if (!stopped) onError?.(error);
        const message = error instanceof Error ? error.message : "";
        const quotaLimited = message.includes("RESOURCE_EXHAUSTED") || message.includes("Quota exceeded") || message.includes("quota-paused");
        if (quotaLimited) window.localStorage.setItem("temp.dataQuotaPausedUntil", String(Date.now() + 300_000));
        if (quotaLimited) intervalMs = 300_000;
      })
      .finally(() => {
        if (stopped) return;
        const delay = Math.max(intervalMs, quotaCooldownUntil() - Date.now(), 0);
        timeoutId = window.setTimeout(run, delay);
      });
  };
  run();
  const resume = () => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    run();
  };
  window.addEventListener("online", resume);
  window.addEventListener("copic:notifications-changed", resume);
  return () => {
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    window.removeEventListener("online", resume);
    window.removeEventListener("copic:notifications-changed", resume);
  };
}

export async function setNotificationArchived(notificationId: string, archived: boolean) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in to update alerts.");
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ notificationId, action: archived ? "archive" : "restore" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to update this alert.");
}

export async function markNotificationRead(notificationId: string) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in to update alerts.");
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ notificationId, action: "read" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to mark this alert as viewed.");
  notifyNotificationsChanged();
}

export async function deleteNotification(notificationId: string) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in to delete alerts.");
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ notificationId, action: "delete" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to delete this alert.");
}
