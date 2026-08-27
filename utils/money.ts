export const PLATFORM_FEE_RATE = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_RATE ?? 0.1);

export type JobPaymentBreakdown = {
  total: number;
  workerEarnings: number;
  serviceFee: number;
};

export function roundCurrencyAmount(amount: number) {
  return Math.max(0, Math.round(Number(amount) || 0));
}

export function calculateJobPaymentBreakdown(jobPrice: number): JobPaymentBreakdown {
  const total = roundCurrencyAmount(jobPrice);
  const serviceFee = roundCurrencyAmount(total * PLATFORM_FEE_RATE);
  return {
    total,
    workerEarnings: Math.max(0, total - serviceFee),
    serviceFee
  };
}

export function calculateServiceFee(grossAmount: number) {
  return calculateJobPaymentBreakdown(grossAmount).serviceFee;
}

export function calculateWorkerNet(grossAmount: number) {
  return calculateJobPaymentBreakdown(grossAmount).workerEarnings;
}

export function addPlatformFee(amount: number) {
  return roundCurrencyAmount(amount * (1 + PLATFORM_FEE_RATE));
}

export function kes(amount: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(amount);
}
