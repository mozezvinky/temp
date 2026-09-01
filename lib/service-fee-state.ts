import "server-only";

import { isSqlBackend } from "@/lib/data-backend";
import { adminDb } from "@/lib/firebase-admin";
import { getLatestLocalServiceFeePayment, getLocalUser, listLocalApplications } from "@/lib/local-sql";
import type { ServiceFeePaymentStatus, ServiceFeePaywallState } from "@/types";
import { calculateJobPaymentBreakdown, calculateWorkerEarningsFromServiceFee } from "@/utils/money";

type ServiceFeeBreakdown = {
  grossAmount: number;
  workerEarnings: number;
  serviceFeeAmount: number;
  jobId?: string | null;
  applicationId?: string | null;
};

function timestampMillis(value: unknown) {
  if (typeof value === "string") return Date.parse(value) || 0;
  if (typeof value !== "object" || !value) return 0;
  if ("toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if ("seconds" in value && typeof (value as { seconds?: unknown }).seconds === "number") return Number((value as { seconds: number }).seconds) * 1000;
  return 0;
}

function paymentIsPending(status: unknown) {
  return status === "service_fee_due" || status === "payment_pending_verification" || status === "verified";
}

function emptyState(): ServiceFeePaywallState {
  return {
    shouldShowPaywall: false,
    status: "not_due",
    amountDue: 0,
    totalOutstandingFee: 0,
    grossAmount: 0,
    workerEarnings: 0,
    serviceFeeAmount: 0,
    paymentId: null,
    paymentStatus: null,
    jobId: null,
    applicationId: null,
    accountRestricted: false,
    lockReason: null
  };
}

function stateFromAmounts(input: {
  uid: string;
  outstandingFee: number;
  locked: boolean;
  lockReason?: string | null;
  payment?: Record<string, unknown> | null;
  breakdown?: ServiceFeeBreakdown;
}): ServiceFeePaywallState {
  const pendingAmount = input.payment && paymentIsPending(input.payment.status) ? Number(input.payment.amount ?? 0) : 0;
  const totalOutstandingFee = Math.max(0, input.outstandingFee, pendingAmount);
  const status = totalOutstandingFee <= 0
    ? "not_due"
    : input.payment?.status === "rejected"
      ? "failed"
      : pendingAmount > 0
        ? "pending"
        : "due";
  const fallbackBreakdown: ServiceFeeBreakdown = input.breakdown ?? calculateBreakdownFromFee(totalOutstandingFee);
  const state: ServiceFeePaywallState = {
    shouldShowPaywall: status === "due" || status === "pending" || status === "failed",
    status,
    amountDue: totalOutstandingFee,
    totalOutstandingFee,
    grossAmount: fallbackBreakdown.grossAmount,
    workerEarnings: fallbackBreakdown.workerEarnings,
    serviceFeeAmount: fallbackBreakdown.serviceFeeAmount || totalOutstandingFee,
    paymentId: typeof input.payment?.id === "string" ? input.payment.id : null,
    paymentStatus: typeof input.payment?.status === "string" ? input.payment.status as ServiceFeePaymentStatus : null,
    jobId: fallbackBreakdown.jobId ?? null,
    applicationId: fallbackBreakdown.applicationId ?? null,
    accountRestricted: input.locked || totalOutstandingFee > 0,
    lockReason: input.lockReason ?? null
  };
  console.info("[COPIC PAYWALL]", {
    uid: input.uid,
    jobId: state.jobId,
    applicationId: state.applicationId,
    paymentConfirmed: state.status !== "not_due",
    serviceFeeAmount: state.serviceFeeAmount,
    serviceFeeStatus: state.status,
    accountRestricted: state.accountRestricted,
    shouldShowPaywall: state.shouldShowPaywall
  });
  return state;
}

function calculateBreakdownFromFee(serviceFee: number) {
  const workerEarnings = calculateWorkerEarningsFromServiceFee(serviceFee);
  const breakdown = calculateJobPaymentBreakdown(workerEarnings);
  return {
    grossAmount: breakdown.total,
    workerEarnings: breakdown.workerEarnings,
    serviceFeeAmount: breakdown.serviceFee
  };
}

export async function getServiceFeePaywallState(uid: string): Promise<ServiceFeePaywallState> {
  if (isSqlBackend()) return getLocalServiceFeePaywallState(uid);

  const db = adminDb();
  const [userSnap, paymentSnap, applicationSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("service_fee_payments").where("workerId", "==", uid).limit(30).get(),
    db.collection("applications").where("workerId", "==", uid).limit(80).get()
  ]);
  if (!userSnap.exists) return emptyState();
  const user = userSnap.data() ?? {};
  const payments = paymentSnap.docs
    .map<Record<string, unknown>>(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => timestampMillis(b.submittedAt) - timestampMillis(a.submittedAt));
  const latestPayment = payments[0] ?? null;
  const applications = applicationSnap.docs
    .map<Record<string, unknown>>(doc => ({ id: doc.id, ...doc.data() }))
    .filter(application => application.status === "completed" || ["due", "pending", "failed"].includes(String(application.serviceFeeStatus ?? "")))
    .sort((a, b) => timestampMillis(b.updatedAt) - timestampMillis(a.updatedAt));
  const breakdown = await latestBreakdown(applications);
  return stateFromAmounts({
    uid,
    outstandingFee: Number(user.outstandingServiceFee ?? 0),
    locked: user.isLocked === true,
    lockReason: typeof user.lockReason === "string" ? user.lockReason : null,
    payment: latestPayment,
    breakdown
  });
}

async function latestBreakdown(applications: Record<string, unknown>[]) {
  const latestWithFee = applications.find(application => Number(application.serviceFeeAmount ?? 0) > 0);
  if (latestWithFee) {
    const grossAmount = Number(latestWithFee.grossAmount ?? latestWithFee.jobAmount ?? 0);
    const serviceFeeAmount = Number(latestWithFee.serviceFeeAmount ?? 0);
    return {
      grossAmount,
      workerEarnings: Number(latestWithFee.workerEarnings ?? calculateWorkerEarningsFromServiceFee(serviceFeeAmount)),
      serviceFeeAmount,
      jobId: typeof latestWithFee.jobId === "string" ? latestWithFee.jobId : null,
      applicationId: typeof latestWithFee.id === "string" ? latestWithFee.id : null
    };
  }

  const latest = applications.find(application => typeof application.jobId === "string");
  if (!latest) return undefined;
  const jobSnap = await adminDb().collection("jobs").doc(String(latest.jobId)).get();
  const grossAmount = Number(jobSnap.data()?.payAmount ?? jobSnap.data()?.rateAmount ?? latest.jobAmount ?? 0);
  if (grossAmount <= 0) return undefined;
  const breakdown = calculateJobPaymentBreakdown(grossAmount);
  return {
    grossAmount: breakdown.total,
    workerEarnings: breakdown.workerEarnings,
    serviceFeeAmount: breakdown.serviceFee,
    jobId: String(latest.jobId),
    applicationId: typeof latest.id === "string" ? latest.id : null
  };
}

function getLocalServiceFeePaywallState(uid: string): ServiceFeePaywallState {
  const user = getLocalUser(uid);
  if (!user) return emptyState();
  const payment = getLatestLocalServiceFeePayment(uid) as Record<string, unknown> | null;
  const applications = listLocalApplications(uid, "worker")
    .filter(application => application.status === "completed")
    .sort((a, b) => timestampMillis(b.updatedAt) - timestampMillis(a.updatedAt));
  const latest = applications[0];
  const grossAmount = Number(latest?.jobAmount ?? 0);
  const paymentBreakdown = grossAmount > 0 ? calculateJobPaymentBreakdown(grossAmount) : null;
  const fallbackBreakdown = paymentBreakdown
    ? {
        grossAmount: paymentBreakdown.total,
        workerEarnings: paymentBreakdown.workerEarnings,
        serviceFeeAmount: paymentBreakdown.serviceFee
      }
    : calculateBreakdownFromFee(Number(user.outstandingServiceFee ?? 0));
  return stateFromAmounts({
    uid,
    outstandingFee: Number(user.outstandingServiceFee ?? 0),
    locked: user.isLocked === true,
    lockReason: user.lockReason ?? null,
    payment,
    breakdown: {
      grossAmount: fallbackBreakdown.grossAmount,
      workerEarnings: fallbackBreakdown.workerEarnings,
      serviceFeeAmount: fallbackBreakdown.serviceFeeAmount,
      jobId: latest?.jobId ?? null,
      applicationId: latest?.id ?? null
    }
  });
}
