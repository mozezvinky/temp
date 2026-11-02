"use client";
import { requireAuth } from "@/lib/firebase";
export async function catalogueRequest(path: string, body: unknown) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Sign in first.");
  const response = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Unable to save changes.");
  return result;
}
export async function uploadServiceImage(file: File, kind: "catalogue" | "inspiration" | "certificate") {
  if (file.size > 8 * 1024 * 1024) throw new Error("File exceeds 8 MB.");
  const data = new FormData(); data.set("file", file); data.set("kind", kind);
  return (await catalogueRequest("/api/service-media", data)).url as string;
}
