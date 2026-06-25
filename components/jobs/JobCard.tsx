"use client";

import type { Job } from "@/types";
import { kes } from "@/utils/money";
import { workerVisiblePay } from "@/utils/pricing";
import { displayJobQuantity } from "@/utils/jobUnits";
import { Clock, MapPin, UsersRound } from "lucide-react";
import type { ReactNode } from "react";

export function JobCard({ job, workerView = false, menuSlot, infoActionSlot }: { job: Job; workerView?: boolean; menuSlot?: ReactNode; infoActionSlot?: ReactNode }) {
  const remainingWorkers = Math.max(0, (job.workersNeeded ?? 1) - (job.acceptedCount ?? 0));
  const visiblePay = workerView ? workerVisiblePay(job.payAmount ?? job.rateAmount ?? 0) : job.payAmount ?? job.rateAmount ?? 0;
  const quantityLabel = displayJobQuantity(job.quantity, job.unit, job.customUnit);
  const payTypeLabel = job.payType === "timeline" ? "Per timeline" : "Fixed pay";
  return (
    <article className="reference-job-card">
      <div className="reference-job-card-top">
        <p className="reference-job-category">{job.category}</p>
        <div className="reference-job-badges">
          {quantityLabel && <span className="reference-job-badge is-accent">{quantityLabel}</span>}
          <span className="reference-job-badge">{payTypeLabel}</span>
          {menuSlot}
        </div>
      </div>
      <h3>{job.title}</h3>
      <p className="reference-job-location"><MapPin size={16} /> {job.location}</p>
      <div className="reference-job-divider" />
      <div className="reference-job-facts">
        <div><small>{payTypeLabel}</small><strong>{kes(visiblePay)}</strong></div>
        <div><small>Est. duration</small><strong><Clock size={15} /> {job.duration ?? `${job.durationHours}h`}</strong></div>
      </div>
      <div className="reference-job-footer">
        <span><UsersRound size={16} /> {remainingWorkers} left · {job.acceptedCount ?? 0}/{job.workersNeeded ?? 1} hired</span>
        {infoActionSlot}
      </div>
    </article>
  );
}
