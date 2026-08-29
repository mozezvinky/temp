import "server-only";

import { isSqlBackend } from "@/lib/data-backend";
import { adminDb } from "@/lib/firebase-admin";
import { getLocalUser, localDb } from "@/lib/local-sql";
import type { Job, UserProfile, VerificationStatus } from "@/types";
import { requiresDriverLicenseForJob, workerCanApplyToJob, workerCanWork } from "@/utils/jobRules";
import { normalizeVerificationStatus } from "@/utils/verification";

export type WorkerVerificationStatus = {
  uid: string;
  identityVerificationStatus: VerificationStatus;
  identityVerified: boolean;
  drivingLicenceStatus: VerificationStatus;
  drivingLicenceVerified: boolean;
  user: Partial<UserProfile> | null;
};

export type WorkerEligibilityDecision = WorkerVerificationStatus & {
  drivingJob: boolean;
  decision: "allowed" | "blocked";
  reason: string;
};

function firstStatus(...values: unknown[]) {
  const statuses = values.map(normalizeVerificationStatus);
  if (statuses.includes("approved")) return "approved";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("rejected")) return "rejected";
  return "not_submitted";
}

function logIdentityVerificationResolution(input: {
  uid: string;
  source: string;
  rawStatus: unknown;
  normalizedStatus: VerificationStatus;
  identityVerified: boolean;
  action: string;
}) {
  console.info("[COPIC VERIFICATION]", {
    uid: input.uid,
    source: input.source,
    rawStatus: typeof input.rawStatus === "string" ? input.rawStatus : input.rawStatus == null ? null : String(input.rawStatus),
    normalizedStatus: input.normalizedStatus,
    identityVerified: input.identityVerified,
    action: input.action
  });
}

export function getWorkerVerificationStatusFromRecords(
  uid: string,
  user: Partial<UserProfile> | Record<string, unknown> | null | undefined,
  identity: Record<string, unknown> | null | undefined,
  driverLicense: Record<string, unknown> | null | undefined
): WorkerVerificationStatus {
  const userRecord = user as (Partial<UserProfile> & Record<string, unknown>) | null | undefined;
  const rawIdentityStatus = identity?.identityVerificationStatus ?? identity?.status ?? userRecord?.identityVerificationStatus ?? userRecord?.verificationStatus ?? userRecord?.kycStatus;
  const identityVerificationStatus = firstStatus(identity?.identityVerificationStatus, identity?.status, userRecord?.identityVerificationStatus, userRecord?.verificationStatus, userRecord?.kycStatus);
  const drivingLicenceStatus = firstStatus(driverLicense?.driverLicenseVerificationStatus, driverLicense?.status, userRecord?.driverLicenseVerificationStatus);
  logIdentityVerificationResolution({
    uid,
    source: identity ? "verification_record" : userRecord ? "user_profile_fallback" : "missing",
    rawStatus: rawIdentityStatus,
    normalizedStatus: identityVerificationStatus,
    identityVerified: identityVerificationStatus === "approved",
    action: "worker_eligibility"
  });
  return {
    uid,
    identityVerificationStatus,
    identityVerified: identityVerificationStatus === "approved",
    drivingLicenceStatus,
    drivingLicenceVerified: drivingLicenceStatus === "approved",
    user: userRecord ?? null
  };
}

function rowFor(table: "identity_verifications" | "driver_license_verifications", uid: string) {
  return localDb().prepare(`SELECT * FROM ${table} WHERE userId = ?`).get(uid) as Record<string, unknown> | undefined;
}

export async function getWorkerVerificationStatus(uid: string): Promise<WorkerVerificationStatus> {
  if (isSqlBackend()) {
    const user = getLocalUser(uid);
    const identity = rowFor("identity_verifications", uid);
    const driverLicense = rowFor("driver_license_verifications", uid);
    return getWorkerVerificationStatusFromRecords(uid, user, identity, driverLicense);
  }

  const [userSnap, identitySnap, driverLicenseSnap] = await Promise.all([
    adminDb().collection("users").doc(uid).get(),
    adminDb().collection("verifications").doc(uid).get(),
    adminDb().collection("verifications").doc(`driver-license-${uid}`).get()
  ]);
  const user = userSnap.exists ? userSnap.data() as Partial<UserProfile> & Record<string, unknown> : null;
  const identity = identitySnap.exists ? identitySnap.data() : null;
  const driverLicense = driverLicenseSnap.exists ? driverLicenseSnap.data() : null;
  return getWorkerVerificationStatusFromRecords(uid, user, identity, driverLicense);
}

export function getWorkerEligibilityFromVerification(
  verification: WorkerVerificationStatus,
  job?: Pick<Job, "title" | "category" | "requiredSkills"> | null
): WorkerEligibilityDecision {
  const worker = {
    verificationStatus: verification.identityVerificationStatus,
    driverLicenseVerificationStatus: verification.drivingLicenceStatus,
    isLocked: verification.user?.isLocked === true,
    outstandingServiceFee: Number(verification.user?.outstandingServiceFee ?? 0)
  };
  const drivingJob = job ? requiresDriverLicenseForJob(job) : false;
  const allowed = job ? workerCanApplyToJob(worker, job) : workerCanWork(worker);
  return {
    ...verification,
    drivingJob,
    decision: allowed.ok ? "allowed" : "blocked",
    reason: allowed.reason
  };
}

export async function getWorkerJobEligibility(uid: string, job: Pick<Job, "title" | "category" | "requiredSkills">): Promise<WorkerEligibilityDecision> {
  return getWorkerEligibilityFromVerification(await getWorkerVerificationStatus(uid), job);
}

export async function getWorkerWorkEligibility(uid: string): Promise<WorkerEligibilityDecision> {
  return getWorkerEligibilityFromVerification(await getWorkerVerificationStatus(uid), null);
}

export function logApplyEligibilityCheck(check: WorkerEligibilityDecision) {
  console.info("[COPIC APPLY CHECK]", {
    uid: check.uid,
    identityVerificationStatus: check.identityVerificationStatus,
    identityVerified: check.identityVerified,
    drivingJob: check.drivingJob,
    drivingLicenceStatus: check.drivingLicenceStatus,
    drivingLicenceVerified: check.drivingLicenceVerified,
    decision: check.decision
  });
}
