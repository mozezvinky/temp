import type { VerificationStatus } from "@/types";

export function normalizeVerificationStatus(value: unknown): VerificationStatus {
  if (value === "verified" || value === "approved") return "approved";
  if (value === "pending") return "pending";
  if (value === "rejected") return "rejected";
  return "not_submitted";
}

export function verificationLabel(status: VerificationStatus) {
  return status === "not_submitted" ? "Not submitted" : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
