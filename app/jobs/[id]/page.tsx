"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { applyToJob, subscribeApplications, subscribeJob } from "@/services/jobs";
import type { Application, Job } from "@/types";
import { kes } from "@/utils/money";
import { workerVisiblePay } from "@/utils/pricing";
import { displayJobQuantity } from "@/utils/jobUnits";
import { isPayPerTimeline } from "@/utils/timeline-payments";
import { perDurationUnit } from "@/utils/duration";
import { workerCanApplyToJob } from "@/utils/jobRules";
import { Clock, MapPin } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

export default function JobDetailsPage() {
  const router = useRouter();
  const { profile, loading: authLoading, isAuthorized } = useProtectedRoute(["worker", "admin"]);
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);

  useEffect(() => {
    if (authLoading || !isAuthorized || !id) return;
    return subscribeJob(id, item => {
      setJob(item);
      setLoading(false);
    }, () => {
      setError("Unable to load this job right now.");
      setLoading(false);
    });
  }, [authLoading, id, isAuthorized]);

  useEffect(() => {
    if (!profile || profile.role !== "worker") return;
    return subscribeApplications(profile.id, "worker", setApplications, () => setApplications([]));
  }, [profile]);

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !job || profile.role !== "worker") return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setApplying(true);
    try {
      await applyToJob(job, profile, String(form.get("coverNote") ?? "").trim());
      toast.success("Application submitted.");
      formElement.reset();
      router.replace("/jobs");
    } catch (submissionError) {
      toast.error(submissionError instanceof Error ? submissionError.message : "Unable to apply right now.");
    } finally {
      setApplying(false);
    }
  }

  if (authLoading || !isAuthorized || loading) return <LoadingSpinner label="Opening job" />;
  if (error) return <EmptyState title="Job unavailable" body={error} />;
  if (!job) return <EmptyState title="Job unavailable" body="This job no longer exists." />;
  const alreadyApplied = applications.some(application => application.jobId === job.id);
  const quantityLabel = displayJobQuantity(job.quantity, job.unit, job.customUnit);
  const timelinePay = isPayPerTimeline(job.payType);
  const workerPay = timelinePay ? Number(job.workerPayPerTimeline ?? workerVisiblePay(job.payAmount ?? job.rateAmount ?? 0)) : workerVisiblePay(job.payAmount ?? job.rateAmount ?? 0);
  const timelineCount = Number(job.timelineCount ?? 1);
  const timelineUnitLabel = perDurationUnit(job.durationUnit);
  const timelineUnitTitle = timelineUnitLabel.charAt(0).toUpperCase() + timelineUnitLabel.slice(1);
  const applyStatus = profile?.role === "worker" ? workerCanApplyToJob(profile, job) : { ok: false, reason: "Use a worker account to apply." };

  return (
    <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <Card>
        <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">{job.category}</p>
        <h1 className="mt-2 text-3xl font-black text-[#FFFBFF]">{job.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#CCC6BB]">{job.description}</p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-[#D3C4B3]">
          <span>{kes(workerPay)} / {timelinePay ? timelineUnitLabel : "job"}</span>
          <span className="inline-flex items-center gap-1"><Clock size={16} /> {job.duration ?? `${job.durationHours}h`}</span>
          <span className="inline-flex items-center gap-1"><MapPin size={16} /> {job.location}, {job.county}</span>
        </div>
        {timelinePay && (
          <div className="mt-4 rounded-xl border border-bone/15 bg-bone/[.05] p-4 text-sm font-bold text-[#D3C4B3]">
            <p>{timelineCount} {timelineUnitLabel}{timelineCount === 1 ? "" : "s"}</p>
            <p className="mt-1">Total possible earning: {kes(Number(job.totalWorkerAmount ?? workerPay * timelineCount))}</p>
            <p className="mt-1">{timelineUnitTitle} payments: {job.paidTimelineCount ?? 0}/{timelineCount} paid</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
          {quantityLabel && <span className="design-chip px-3 py-1">{quantityLabel}</span>}
          <span className="design-chip px-3 py-1">{job.acceptedCount ?? 0}/{job.workersNeeded ?? 1} hired</span>
        </div>
        <p className="mt-5 text-sm text-[#959087]">Posted by {job.clientName}</p>
      </Card>
      {profile?.role === "worker" && job.status === "open" && !alreadyApplied && applyStatus.ok ? (
        <Card>
          <h2 className="text-xl font-black text-[#FFFBFF]">Apply for this job</h2>
          <form onSubmit={submitApplication} className="mt-4 grid gap-3">
            <textarea name="coverNote" placeholder="Optional message to the client" className="temp-input min-h-28 rounded-xl p-3 outline-none" />
            <Button type="submit" disabled={applying} className="temp-success-button">{applying ? "Submitting..." : "Submit application"}</Button>
          </form>
        </Card>
      ) : profile?.role === "worker" && job.status === "open" && !alreadyApplied ? (
        <EmptyState title="Verification required" body={applyStatus.reason} />
      ) : alreadyApplied ? (
        <EmptyState title="Applied" body="You have already applied for this job. Track its status from your dashboard." />
      ) : (
        <EmptyState title="Applications closed" body="This job is no longer accepting applications." />
      )}
    </div>
  );
}
