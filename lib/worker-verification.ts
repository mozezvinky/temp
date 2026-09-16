import "server-only";
import { validLicence } from "@/functions/src/marketplace-policy";

import { isSqlBackend } from "@/lib/data-backend";
import { adminDb } from "@/lib/firebase-admin";
import { getLatestLocalServiceFeePayment, getLocalUser, localDb } from "@/lib/local-sql";
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

export function getWorkerVerificationStatusFromRecords(
  uid: string,
  user: Partial<UserProfile> | Record<string, unknown> | null | undefined,
  identity: Record<string, unknown> | null | undefined,
  driverLicense: Record<string, unknown> | null | undefined
): WorkerVerificationStatus {
  const userRecord = user as (Partial<UserProfile> & Record<string, unknown>) | null | undefined;

  const identityVerificationStatus = normalizeVerificationStatus(identity ? identity.status ?? identity.identityVerificationStatus : userRecord?.verificationStatus ?? userRecord?.identityVerificationStatus ?? userRecord?.kycStatus);
  const drivingLicenceStatus = normalizeVerificationStatus(driverLicense ? driverLicense.status ?? driverLicense.driverLicenseVerificationStatus : userRecord?.driverLicenseVerificationStatus);
  return {
    uid,
    identityVerificationStatus,
    identityVerified: identityVerificationStatus === "approved",
    drivingLicenceStatus,
    drivingLicenceVerified: validLicence(drivingLicenceStatus, driverLicense?.expiryDate ?? userRecord?.driverLicenseExpiryDate),
    user: userRecord ?? null
  };
}

function rowFor(table: "identity_verifications" | "driver_license_verifications", uid: string) {
  return localDb().prepare(`SELECT * FROM ${table} WHERE userId = ?`).get(uid) as Record<string, unknown> | undefined;
}

function isOutstandingServiceFeePayment(payment: Record<string, unknown> | null | undefined) {
  return !!payment
    && (payment.status === "service_fee_due" || payment.status === "payment_pending_verification" || payment.status === "verified")
    && Number(payment.amount ?? 0) > 0;
}

function mergeOutstandingServiceFeeState(
  user: (Partial<UserProfile> & Record<string, unknown>) | null,
  amount: number
) {
  if (!user || amount <= 0) return user;
  return {
    ...user,
    isLocked: true,
    outstandingServiceFee: Math.max(Number(user.outstandingServiceFee ?? 0), amount),
    lockReason: typeof user.lockReason === "string" && user.lockReason ? user.lockReason : "COPIC service fee outstanding"
  };
}

export async function getWorkerVerificationStatus(uid: string): Promise<WorkerVerificationStatus> {
  if (isSqlBackend()) {
    const latestPayment = getLatestLocalServiceFeePayment(uid) as Record<string, unknown> | null;
    const localPendingAmount = isOutstandingServiceFeePayment(latestPayment)
      ? Number((latestPayment as Record<string, unknown>).amount ?? 0)
      : 0;
    const user = mergeOutstandingServiceFeeState(
      getLocalUser(uid) as (Partial<UserProfile> & Record<string, unknown>) | null,
      localPendingAmount
    );
    const identity = rowFor("identity_verifications", uid);
    const driverLicense = rowFor("driver_license_verifications", uid);
    return getWorkerVerificationStatusFromRecords(uid, user, identity, driverLicense);
  }

  const [userSnap, identitySnap, driverLicenseSnap, paymentSnap] = await Promise.all([
    adminDb().collection("users").doc(uid).get(),
    adminDb().collection("verifications").doc(uid).get(),
    adminDb().collection("verifications").doc(`driver-license-${uid}`).get(),
    adminDb().collection("service_fee_payments").where("workerId", "==", uid).limit(20).get()
  ]);
  const pendingPaymentAmount = paymentSnap.docs.reduce((max, doc) => {
    const payment = doc.data();
    return isOutstandingServiceFeePayment(payment) ? Math.max(max, Number(payment.amount ?? 0)) : max;
  }, 0);
  const user = mergeOutstandingServiceFeeState(
    userSnap.exists ? userSnap.data() as Partial<UserProfile> & Record<string, unknown> : null,
    pendingPaymentAmount
  );
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
    driverLicenseVerificationStatus: verification.drivingLicenceVerified ? "approved" as const : "not_submitted" as const,
    driverLicenseExpiryDate: verification.drivingLicenceVerified ? "9999-12-31" : undefined,
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
