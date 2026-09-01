export const PLATFORM_FEE_RATE = 0.1;

export type JobPaymentBreakdown = {
  total: number;
  workerEarnings: number;
  serviceFee: number;
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
  return roundCurrencyAmount(clientTotal / (1 + PLATFORM_FEE_RATE));
}

export function kes(amount: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(amount);
}
