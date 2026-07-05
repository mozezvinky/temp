"use client";

import { requireAuth } from "@/lib/firebase";
import type { Rating } from "@/types";

type RatingsResult = { ratings: Rating[]; aggregate: { average: number; count: number; breakdown: Record<number, number> } };
const ratingsRequests = new Map<string, Promise<RatingsResult>>();

function activeRoleHeaders(userId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  const role = window.sessionStorage.getItem("temp.profile.role") ?? window.localStorage.getItem(`temp.profile.role.${userId}`) ?? "";
  return role === "client" || role === "worker" || role === "admin" ? { "X-Temp-Role": role } : {};
}

export async function loadRatings(toUserId: string) {
  const cached = ratingsRequests.get(toUserId);
  if (cached) return cached;
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in to load ratings.");
  const request = fetch(`/api/ratings?toUserId=${encodeURIComponent(toUserId)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...activeRoleHeaders(user.uid) } })
    .then(async response => {
      const payload = await response.json().catch(() => ({})) as { ratings?: Rating[]; aggregate?: { average: number; count: number; breakdown: Record<number, number> }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load ratings.");
      return { ratings: payload.ratings ?? [], aggregate: payload.aggregate ?? { average: 0, count: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } };
    })
    .finally(() => {
      ratingsRequests.delete(toUserId);
    });
  ratingsRequests.set(toUserId, request);
  return request;
}

export async function rateClient(jobId: string, toUserId: string, stars: number, review: string, ratingScopeId?: string) {
  return rateUser(jobId, toUserId, stars, review, ratingScopeId);
}

export async function rateUser(jobId: string, toUserId: string, stars: number, review: string, ratingScopeId?: string) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before submitting a rating.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...activeRoleHeaders(user.uid) },
    body: JSON.stringify({ jobId, toUserId, stars, review, ratingScopeId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to save rating.");
}
