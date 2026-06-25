"use client";

import { requireAuth } from "@/lib/firebase";
import type { LocationFields } from "@/types";

export async function updateProfileLocation(location: LocationFields) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before updating location.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/profile/location", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ location })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to update location.");
  return payload.profile;
}
