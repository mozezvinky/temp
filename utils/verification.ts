import type { VerificationStatus } from "@/types";

export function normalizeVerificationStatus(value: unknown): VerificationStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "verified" || status === "approved") return "approved";
  if (status === "pending") return "pending";
  if (status === "rejected") return "rejected";
  return "not_submitted";
}

export function verificationLabel(status: VerificationStatus) {
  return status === "not_submitted" ? "Not submitted" : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
