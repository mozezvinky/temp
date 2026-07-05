import type { Application } from "@/types";
import { TIMELINE_PLATFORM_FEE } from "@/utils/timeline-payments";

export function applicationTimelinePay(application: Application) {
  const timelineCount = Math.max(1, Math.trunc(Number(application.timelineCount ?? 1) || 1));
  const paidTimelineCount = Math.min(timelineCount, Math.max(0, Math.trunc(Number(application.paidTimelineCount ?? 0) || 0)));
  const submittedTimelineCount = Math.min(timelineCount, Math.max(0, Math.trunc(Number(application.submittedTimelineCount ?? 0) || 0)));
  const clientPayPerTimeline = Number(application.clientPayPerTimeline ?? application.jobAmount ?? 0);
  const workerPayPerTimeline = Number(application.workerPayPerTimeline && application.workerPayPerTimeline > 0
    ? application.workerPayPerTimeline
    : Math.max(0, clientPayPerTimeline - TIMELINE_PLATFORM_FEE));
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
