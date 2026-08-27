import type { Application } from "@/types";
import { timelinePaymentSummary } from "@/utils/timeline-payments";

export function applicationTimelinePay(application: Application) {
  const timelineCount = Math.max(1, Math.trunc(Number(application.timelineCount ?? 1) || 1));
  const paidTimelineCount = Math.min(timelineCount, Math.max(0, Math.trunc(Number(application.paidTimelineCount ?? 0) || 0)));
  const submittedTimelineCount = Math.min(timelineCount, Math.max(0, Math.trunc(Number(application.submittedTimelineCount ?? 0) || 0)));
  const clientPayPerTimeline = Number(application.clientPayPerTimeline ?? application.jobAmount ?? 0);
  const fallbackSummary = timelinePaymentSummary(clientPayPerTimeline, timelineCount);
  const workerPayPerTimeline = fallbackSummary.workerPayPerTimeline;
  const paidWorkerAmount = workerPayPerTimeline * paidTimelineCount;
  const submittedWorkerAmount = workerPayPerTimeline * submittedTimelineCount;
  const remainingWorkerAmount = workerPayPerTimeline * Math.max(0, timelineCount - paidTimelineCount);

  return {
    timelineCount,
    paidTimelineCount,
    submittedTimelineCount,
    workerPayPerTimeline,
    paidWorkerAmount,
    submittedWorkerAmount,
    remainingWorkerAmount
  };
}
