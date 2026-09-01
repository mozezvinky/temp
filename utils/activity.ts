import type { Application, JobStatus } from "@/types";

export const ACTIVE_APPLICATION_STATUSES = ["accepted", "completion_requested", "payment_sent"] as const;
export const LIVE_JOB_STATUSES: JobStatus[] = ["live", "assigned", "active", "in_progress"];
export const CLOSED_JOB_STATUSES: JobStatus[] = ["completed", "cancelled"];

export function isPendingDirectHireRequest(application: Application) {
  return application.source === "direct_hire" && application.status === "pending";
}

export function isActiveHireRequestStatus(status: string) {
  return status === "pending" || ACTIVE_APPLICATION_STATUSES.includes(status as typeof ACTIVE_APPLICATION_STATUSES[number]);
}

export function isLiveJob(application: Application) {
  const jobStatus = String(application.jobStatus ?? "");
  return ACTIVE_APPLICATION_STATUSES.includes(application.status as typeof ACTIVE_APPLICATION_STATUSES[number])
    && LIVE_JOB_STATUSES.includes(jobStatus as JobStatus)
    && !CLOSED_JOB_STATUSES.includes(jobStatus as JobStatus);
}

export function activeActivityApplications(applications: Application[]) {
  return applications.filter(application => isPendingDirectHireRequest(application) || isLiveJob(application));
}
