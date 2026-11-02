import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import type { Transaction } from "firebase-admin/firestore";

export async function validateServiceMedia(urls: string[], ownerId: string, kind: "catalogue" | "inspiration", transaction?: Transaction) {
  for (const url of new Set(urls)) {
    const id = /^\/api\/service-media\?id=([a-zA-Z0-9_-]+)$/.exec(url)?.[1];
    if (!id) throw new Error("Upload a valid image first.");
    const ref = adminDb().doc(`serviceMedia/${id}`);
    const media = transaction ? await transaction.get(ref) : await ref.get();
    if (!media.exists || media.data()?.ownerId !== ownerId || media.data()?.kind !== kind) throw new Error("Use your own uploaded images for this request.");
  }
}
