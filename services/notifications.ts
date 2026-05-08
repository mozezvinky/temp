"use client";

import { messaging, requireDb } from "@/lib/firebase";
import type { AppNotification } from "@/types";
import { getToken, onMessage } from "firebase/messaging";
import { collection, doc, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { toast } from "sonner";

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
  return onMessage(instance, payload => toast(payload.notification?.title ?? "Temp", { description: payload.notification?.body }));
}

export function subscribeNotifications(userId: string, callback: (items: AppNotification[]) => void) {
  const db = requireDb();
  return onSnapshot(query(collection(db, "notifications"), where("userId", "==", userId), orderBy("createdAt", "desc")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AppNotification));
  });
}
