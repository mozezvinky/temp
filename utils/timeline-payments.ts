export const TIMELINE_PLATFORM_FEE = 100;

export function isPayPerTimeline(payType?: string | null) {
  return payType === "pay_per_timeline" || payType === "timeline";
}

export function timelinePaymentSummary(clientPayPerTimeline: number, timelineCount: number) {
  const count = Math.max(1, Math.trunc(Number(timelineCount) || 1));
  const clientAmount = Math.max(0, Math.round(Number(clientPayPerTimeline) || 0));
  const workerAmount = Math.max(0, clientAmount - TIMELINE_PLATFORM_FEE);
  return {
    timelineCount: count,
    clientPayPerTimeline: clientAmount,
    workerPayPerTimeline: workerAmount,
    totalClientAmount: clientAmount * count,
    totalWorkerAmount: workerAmount * count,
    totalPlatformFee: TIMELINE_PLATFORM_FEE * count
  };
}
