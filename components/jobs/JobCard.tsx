"use client";

import type { Job } from "@/types";
import { kes } from "@/utils/money";
import { workerVisiblePay } from "@/utils/pricing";
import { isPayPerTimeline, timelinePaymentSummaryFromRecord } from "@/utils/timeline-payments";
import { displayJobQuantity } from "@/utils/jobUnits";
import { perDurationUnit } from "@/utils/duration";
import { jobLocationLabel } from "@/utils/location-display";
import { Clock, MapPin, UsersRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function JobCard({ job, workerView = false, menuSlot, infoActionSlot }: { job: Job; workerView?: boolean; menuSlot?: ReactNode; infoActionSlot?: ReactNode }) {
  const remainingWorkers = Math.max(0, (job.workersNeeded ?? 1) - (job.acceptedCount ?? 0));
  const timelinePay = isPayPerTimeline(job.payType);
  const timelineCount = Math.max(1, Math.trunc(Number(job.timelineCount ?? job.durationValue ?? 1) || 1));
  const timelineBreakdown = timelinePaymentSummaryFromRecord(job, timelineCount);
  const clientPayPerTimeline = timelineBreakdown.clientPayPerTimeline;
  const workerPayPerTimeline = timelineBreakdown.workerPayPerTimeline;
  const timelineUnitPay = workerView ? workerPayPerTimeline : clientPayPerTimeline;
  const timelineTotalPay = workerView
    ? timelineBreakdown.totalWorkerAmount
    : Number(job.totalClientAmount && job.totalClientAmount > 0 ? job.totalClientAmount : timelineUnitPay * timelineCount);
  const visiblePay = timelinePay
    ? timelineTotalPay
    : workerView ? workerVisiblePay(job.payAmount ?? job.rateAmount ?? 0) : job.payAmount ?? job.rateAmount ?? 0;
  const locationLabel = jobLocationLabel(job);
  const quantityLabel = displayJobQuantity(job.quantity, job.unit, job.customUnit);
  const timelineUnitLabel = perDurationUnit(job.durationUnit);
  const payTypeLabel = timelinePay ? `Pay per ${timelineUnitLabel}` : "Fixed pay";
  const clientVerified = job.clientVerificationStatus === "approved";
  const [postedAgo, setPostedAgo] = useState(() => timeAgo(job.createdAt));
  useEffect(() => {
    setPostedAgo(timeAgo(job.createdAt));
    const intervalId = window.setInterval(() => setPostedAgo(timeAgo(job.createdAt)), 1_000);
    return () => window.clearInterval(intervalId);
  }, [job.createdAt]);
  return (
    <article className="reference-job-card">
      <div className="reference-job-card-top">
        <p className="reference-job-category">{job.category}</p>
        <div className="reference-job-badges">
          {quantityLabel && <span className="reference-job-badge is-accent">{quantityLabel}</span>}
          <span className="reference-job-badge">{payTypeLabel}</span>
          <span className="reference-job-badge border-yellow-300/40 bg-yellow-200/20 text-yellow-100">{postedAgo}</span>
          <span className={`reference-job-badge ${clientVerified ? "is-verified" : "is-warning"}`}>{clientVerified ? "Verified client" : "Unverified client"}</span>
          {menuSlot}
        </div>
      </div>
      <h3>{job.title}</h3>
      <p className="reference-job-location"><MapPin size={16} /> {locationLabel}</p>
      <div className="reference-job-divider" />
      <div className="reference-job-facts">
        {workerView && timelinePay ? (
          <>
            <div><small>{`You earn per ${timelineUnitLabel}`}</small><strong>{kes(timelineUnitPay)}</strong></div>
            <div><small>Duration</small><strong><Clock size={15} /> {job.duration ?? `${timelineCount} ${timelineUnitLabel}${timelineCount === 1 ? "" : "s"}`}</strong></div>
            <div><small>Total earnings</small><strong>{kes(visiblePay)}</strong></div>
          </>
        ) : (
          <>
            <div><small>{workerView ? "You earn" : timelinePay ? "Total job price" : "Job price"}</small><strong>{kes(visiblePay)}</strong></div>
            {timelinePay && <div><small>{`Price per ${timelineUnitLabel}`}</small><strong>{kes(timelineUnitPay)}</strong></div>}
            <div><small>Est. duration</small><strong><Clock size={15} /> {job.duration ?? `${job.durationHours}h`}</strong></div>
          </>
        )}
      </div>
      <div className="reference-job-footer">
        <span><UsersRound size={16} /> {remainingWorkers} left · {job.acceptedCount ?? 0}/{job.workersNeeded ?? 1} hired</span>
        {infoActionSlot}
      </div>
    </article>
  );
}

function timeAgo(value: Job["createdAt"]) {
  const date = timestampDate(value);
  if (!date) return "0 sec ago";
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "sec" : "secs"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

function timestampDate(value: Job["createdAt"]) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && "seconds" in value && typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "object" && "_seconds" in value && typeof value._seconds === "number") return new Date(value._seconds * 1000);
  return null;
}
