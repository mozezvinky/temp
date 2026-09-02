export const PLATFORM_FEE_RATE = 0.1;

export type JobPaymentBreakdown = {
  total: number;
  workerEarnings: number;
  serviceFee: number;
};

export type JobPriceSource = "worker_posted_skill" | "client_posted_job";

export type ResolvedJobPaymentBreakdown = JobPaymentBreakdown & {
  priceSource: JobPriceSource;
  clientTotal: number;
  copicFee: number;
};

type PaymentRecord = {
  source?: string | null;
  requestSkillId?: string | null;
  requestPricing?: {
    total?: number | null;
    subtotal?: number | null;
    serviceFee?: number | null;
    serviceFeeAmount?: number | null;
    clientTotal?: number | null;
    workerSubtotal?: number | null;
  } | null;
  payAmount?: number | null;
  rateAmount?: number | null;
  jobAmount?: number | null;
  grossAmount?: number | null;
  workerEarnings?: number | null;
  serviceFeeAmount?: number | null;
};

export function roundCurrencyAmount(amount: number) {
  return Math.max(0, Math.round(Number(amount) || 0));
}

export function calculateJobPaymentBreakdown(jobPrice: number): JobPaymentBreakdown {
  const workerEarnings = roundCurrencyAmount(jobPrice);
  const serviceFee = calculateServiceFeeFromWorkerEarnings(workerEarnings);
  return {
    total: workerEarnings + serviceFee,
    workerEarnings,
    serviceFee
  };
}

export function calculateServiceFee(workerEarnings: number) {
  return calculateServiceFeeFromWorkerEarnings(workerEarnings);
}

export function calculateWorkerNet(workerEarnings: number) {
  return calculateJobPaymentBreakdown(workerEarnings).workerEarnings;
}

export function addPlatformFee(amount: number) {
  return calculateJobPaymentBreakdown(amount).total;
}

export function calculateServiceFeeFromWorkerEarnings(workerEarnings: number) {
  return roundCurrencyAmount(workerEarnings * PLATFORM_FEE_RATE);
}

export function calculateWorkerEarningsFromServiceFee(serviceFee: number) {
  if (!Number.isFinite(serviceFee) || serviceFee <= 0) return 0;
  return roundCurrencyAmount(serviceFee / PLATFORM_FEE_RATE);
}

export function calculateWorkerEarningsFromClientTotal(clientTotal: number) {
  if (!Number.isFinite(clientTotal) || clientTotal <= 0) return 0;
  return Math.max(0, roundCurrencyAmount(clientTotal) - calculateServiceFeeFromClientTotal(clientTotal));
}

export function calculateServiceFeeFromClientTotal(clientTotal: number) {
  return roundCurrencyAmount(clientTotal * PLATFORM_FEE_RATE);
}

export function calculateClientPostedJobPaymentBreakdown(clientTotalInput: number): ResolvedJobPaymentBreakdown {
  const clientTotal = roundCurrencyAmount(clientTotalInput);
  const serviceFee = calculateServiceFeeFromClientTotal(clientTotal);
  const workerEarnings = Math.max(0, clientTotal - serviceFee);
  return {
    priceSource: "client_posted_job",
    total: clientTotal,
    clientTotal,
    workerEarnings,
    serviceFee,
    copicFee: serviceFee
  };
}

export function calculateWorkerPostedSkillPaymentBreakdown(workerEarningsInput: number): ResolvedJobPaymentBreakdown {
  const breakdown = calculateJobPaymentBreakdown(workerEarningsInput);
  return {
    priceSource: "worker_posted_skill",
    total: breakdown.total,
    clientTotal: breakdown.total,
    workerEarnings: breakdown.workerEarnings,
    serviceFee: breakdown.serviceFee,
    copicFee: breakdown.serviceFee
  };
}

export function resolveJobPaymentBreakdown(record: PaymentRecord | null | undefined): ResolvedJobPaymentBreakdown {
  const input = record ?? {};
  const priceSource: JobPriceSource = input.source === "direct_hire" || Boolean(input.requestSkillId) || Boolean(input.requestPricing)
    ? "worker_posted_skill"
    : "client_posted_job";
  if (priceSource === "worker_posted_skill") {
    const requestPricing = input.requestPricing;
    const workerEarnings = positiveNumber(requestPricing?.subtotal)
      ?? positiveNumber(requestPricing?.workerSubtotal)
      ?? positiveNumber(input.workerEarnings)
      ?? positiveNumber(input.rateAmount)
      ?? 0;
    const serviceFee = positiveNumber(requestPricing?.serviceFee)
      ?? positiveNumber(requestPricing?.serviceFeeAmount)
      ?? positiveNumber(input.serviceFeeAmount)
      ?? calculateServiceFeeFromWorkerEarnings(workerEarnings);
    const clientTotal = positiveNumber(requestPricing?.total)
      ?? positiveNumber(requestPricing?.clientTotal)
      ?? positiveNumber(input.grossAmount)
      ?? workerEarnings + serviceFee;
    return {
      priceSource,
      total: roundCurrencyAmount(clientTotal),
      clientTotal: roundCurrencyAmount(clientTotal),
      workerEarnings: roundCurrencyAmount(workerEarnings),
      serviceFee: roundCurrencyAmount(serviceFee),
      copicFee: roundCurrencyAmount(serviceFee)
    };
  }
  return calculateClientPostedJobPaymentBreakdown(positiveNumber(input.payAmount) ?? positiveNumber(input.jobAmount) ?? positiveNumber(input.grossAmount) ?? positiveNumber(input.rateAmount) ?? 0);
}

function positiveNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

export function kes(amount: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(amount);
}
