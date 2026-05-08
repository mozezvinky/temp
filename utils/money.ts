export const PLATFORM_FEE_RATE = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_RATE ?? 0.142857);

export function calculateServiceFee(grossAmount: number) {
  return Math.round(grossAmount * PLATFORM_FEE_RATE);
}

export function calculateWorkerNet(grossAmount: number) {
  return Math.max(0, grossAmount - calculateServiceFee(grossAmount));
}

export function kes(amount: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(amount);
}
