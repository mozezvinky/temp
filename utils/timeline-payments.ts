import { calculateJobPaymentBreakdown, PLATFORM_FEE_RATE } from "@/utils/money";

export const TIMELINE_PLATFORM_FEE_RATE = PLATFORM_FEE_RATE;

export function isPayPerTimeline(payType?: string | null) {
  return payType === "pay_per_timeline" || payType === "timeline";
}

export function timelinePaymentSummary(clientPayPerTimeline: number, timelineCount: number) {
  const count = Math.max(1, Math.trunc(Number(timelineCount) || 1));
  const breakdown = calculateJobPaymentBreakdown(clientPayPerTimeline);
  return {
    timelineCount: count,
    clientPayPerTimeline: breakdown.total,
    workerPayPerTimeline: breakdown.workerEarnings,
    totalClientAmount: breakdown.total * count,
    totalWorkerAmount: breakdown.workerEarnings * count,
    totalPlatformFee: breakdown.serviceFee * count
  };
}
