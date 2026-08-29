import type { Job, UserProfile, VerificationStatus } from "@/types";
import { normalizeVerificationStatus } from "@/utils/verification";

const driverJobTerms = [
  "driver",
  "rider",
  "courier",
  "delivery",
  "boda",
  "tuk tuk",
  "tuktuk",
  "matatu",
  "truck",
  "chauffeur"
];

export function isApprovedVerification(status?: VerificationStatus | null) {
  return normalizeVerificationStatus(status) === "approved";
}

export function requiresDriverLicenseForJob(job: Pick<Job, "title" | "category" | "requiredSkills">) {
  const text = [job.title, job.category, ...(job.requiredSkills ?? [])].join(" ").toLowerCase();
  return driverJobTerms.some(term => text.includes(term));
}

export function clientCanPost(profile: { verificationStatus?: VerificationStatus | null } | null | undefined) {
  return isApprovedVerification(profile?.verificationStatus);
}

export function workerCanWork(profile: Pick<UserProfile, "verificationStatus" | "isLocked" | "outstandingServiceFee"> | null | undefined) {
  if (!profile) return { ok: false, reason: "Use a worker account to do jobs." };
  const identityStatus = normalizeVerificationStatus(profile.verificationStatus);
  if (identityStatus === "pending") {
    return { ok: false, reason: "Your identity verification is still under review." };
  }
  if (identityStatus === "rejected") {
    return { ok: false, reason: "Your identity verification was not approved. Please resubmit your verification." };
  }
  if (!isApprovedVerification(identityStatus)) {
    return { ok: false, reason: "Verification required. Verify your identity before applying for jobs." };
  }
  if (profile.isLocked || Number(profile.outstandingServiceFee ?? 0) > 0) {
    return { ok: false, reason: "Your account is locked. Open your dashboard for the next step." };
  }
  return { ok: true, reason: "" };
}

export function workerCanApplyToJob(worker: Pick<UserProfile, "verificationStatus" | "driverLicenseVerificationStatus" | "isLocked" | "outstandingServiceFee"> | null | undefined, job: Pick<Job, "title" | "category" | "requiredSkills">) {
  const base = workerCanWork(worker);
  if (!base.ok) return base;
  if (requiresDriverLicenseForJob(job) && !isApprovedVerification(worker?.driverLicenseVerificationStatus)) {
    return { ok: false, reason: "Driving licence verification required. Your identity is verified, but you do not currently have a verified driving licence on COPIC." };
  }
  return { ok: true, reason: "" };
}
