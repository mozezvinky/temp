import { calculateClientPostedJobPaymentBreakdown, calculateWorkerEarningsFromClientTotal, PLATFORM_FEE_RATE } from "@/utils/money";

export const TIMELINE_PLATFORM_FEE_RATE = PLATFORM_FEE_RATE;

export function isPayPerTimeline(payType?: string | null) {
  return payType === "pay_per_timeline" || payType === "timeline";
}

export function timelinePaymentSummary(clientPayPerTimelineInput: number, timelineCount: number) {
  const count = Math.max(1, Math.trunc(Number(timelineCount) || 1));
  const breakdown = calculateClientPostedJobPaymentBreakdown(clientPayPerTimelineInput);
  return {
    timelineCount: count,
    clientPayPerTimeline: breakdown.total,
    workerPayPerTimeline: breakdown.workerEarnings,
    totalClientAmount: breakdown.total * count,
    totalWorkerAmount: breakdown.workerEarnings * count,
    totalPlatformFee: breakdown.serviceFee * count
  };
}

type TimelinePaymentRecord = {
  payAmount?: number | null;
  rateAmount?: number | null;
  timelineCount?: number | null;
  durationValue?: number | null;
  clientPayPerTimeline?: number | null;
  workerPayPerTimeline?: number | null;
  totalClientAmount?: number | null;
  totalWorkerAmount?: number | null;
  totalPlatformFee?: number | null;
};

export function timelinePaymentSummaryFromRecord(record: TimelinePaymentRecord, fallbackTimelineCount = 1) {
  const count = Math.max(1, Math.trunc(Number(record.timelineCount ?? record.durationValue ?? fallbackTimelineCount) || 1));
  const storedClientPay = positiveNumber(record.clientPayPerTimeline);
  const storedWorkerPay = positiveNumber(record.workerPayPerTimeline);
  const calculated = timelinePaymentSummary(storedClientPay ?? positiveNumber(record.payAmount) ?? positiveNumber(record.rateAmount) ?? 0, count);
  const workerPay = storedWorkerPay ?? (storedClientPay ? calculateWorkerEarningsFromClientTotal(storedClientPay) : calculated.workerPayPerTimeline);
  const clientPay = storedClientPay ?? calculated.clientPayPerTimeline;
  const platformFee = Math.max(0, clientPay - workerPay);
  return {
    timelineCount: count,
    clientPayPerTimeline: clientPay,
    workerPayPerTimeline: workerPay,
    totalClientAmount: positiveNumber(record.totalClientAmount) ?? clientPay * count,
    totalWorkerAmount: positiveNumber(record.totalWorkerAmount) ?? workerPay * count,
    totalPlatformFee: positiveNumber(record.totalPlatformFee) ?? platformFee * count
  };
}

function positiveNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}
