"use client";

import { requireAuth } from "@/lib/firebase";

export async function reportCompletedJob(input: {
  completedJobId: string;
  jobId?: string;
  applicationId?: string;
  title: string;
  reason: string;
}) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in.");
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`
    },
    body: JSON.stringify(input)
  });
  const payload = await response.json().catch(() => ({})) as { ticketId?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Unable to submit report.");
  return payload;
}
