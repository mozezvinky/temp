"use client";

import { AppModal } from "@/components/ui/AppModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import type { Application, Job } from "@/types";
import { perDurationUnit } from "@/utils/duration";
import { jobLocationLabel } from "@/utils/location-display";
import { kes } from "@/utils/money";
import { isPayPerTimeline } from "@/utils/timeline-payments";
import { BriefcaseBusiness, Search } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type JobsPayload = { jobs?: Job[]; applications?: Application[]; error?: string };
type AdminTimeline = {
  id: string;
  jobId: string;
  workerId?: string;
  workerUsername?: string;
  workerName?: string;
  timelineNumber?: number;
  status?: string;
};
type AdminJob = Job & { unpaidCompletedTimelines?: AdminTimeline[] };

const jobStatuses: Job["status"][] = ["draft", "open", "pending", "live", "assigned", "active", "in_progress", "completed", "disputed", "cancelled", "moderated"];

export default function AdminJobsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [saving, setSaving] = useState(false);

  const loadJobs = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const response = await fetch("/api/admin/jobs", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
      const payload = await response.json() as JobsPayload;
      if (!response.ok) throw new Error(payload.error ?? "Unable to load jobs.");
      setJobs(payload.jobs ?? []);
      setApplications(payload.applications ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load jobs.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const filteredJobs = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return jobs;
    return jobs.filter(job => [job.title, job.category, jobLocationLabel(job), job.county, job.clientName, job.clientId, job.status].join(" ").toLowerCase().includes(value));
  }, [jobs, search]);

  function jobApplications(jobId: string) {
    return applications.filter(application => application.jobId === jobId);
  }

  async function submitJobEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !editingJob) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    if (!reason) {
      toast.error("Add a reason for the audit log.");
      return;
    }
    setSaving(true);
    try {
      const patch = {
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        category: String(form.get("category") ?? ""),
        location: String(form.get("location") ?? ""),
        county: String(form.get("county") ?? ""),
        payAmount: Number(form.get("payAmount") ?? 0),
        payType: String(form.get("payType") ?? "fixed"),
        duration: String(form.get("duration") ?? ""),
        durationHours: Number(form.get("durationHours") ?? 0),
        workersNeeded: Number(form.get("workersNeeded") ?? 1),
        status: String(form.get("status") ?? "open")
      };
      const response = await fetch("/api/admin/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ jobId: editingJob.id, patch, reason })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update job.");
      toast.success("Job updated.");
      setEditingJob(null);
      await loadJobs();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Unable to update job.");
    } finally {
      setSaving(false);
    }
  }

  async function sendPaymentWall(job: AdminJob, timeline: AdminTimeline) {
    if (!user) return;
    try {
      const response = await fetch("/api/admin/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ action: "send_payment_wall", timelineId: timeline.id, reason: `Payment wall sent for ${job.title} timeline ${timeline.timelineNumber ?? ""}.` })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to send payment wall.");
      toast.success("Payment wall sent to client.");
    } catch (wallError) {
      toast.error(wallError instanceof Error ? wallError.message : "Unable to send payment wall.");
    }
  }

  if (loading) return <LoadingSpinner label="Loading jobs" />;
  if (error) return <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[.2em] text-[#959087]">Operations</p>
          <h1 className="mt-2 text-3xl font-black">Posted jobs</h1>
        </div>
        <label className="temp-input flex min-h-11 min-w-72 items-center gap-2 rounded-xl px-3"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search jobs, clients, status" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
      </div>
      <Card>
        <BriefcaseBusiness />
        <p className="mt-4 text-sm text-[#959087]">All posted jobs</p>
        <p className="text-3xl font-black">{jobs.length}</p>
      </Card>
      <div className="grid gap-3">
        {filteredJobs.length ? filteredJobs.map(job => {
          const related = jobApplications(job.id);
          const live = related.filter(application => ["accepted", "completion_requested", "payment_sent"].includes(application.status));
          const requests = related.filter(application => application.status === "completion_requested");
          const timelinePay = isPayPerTimeline(job.payType);
          const paidTimelines = Number(job.paidTimelineCount ?? 0);
          const timelineCount = Number(job.timelineCount ?? 1);
          const unpaidCompletedTimelines = job.unpaidCompletedTimelines ?? [];
          return (
            <Card key={job.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-[#FFFBFF]">{job.title}</p>
                  <p className="mt-1 text-sm text-[#959087]">{job.category} | {jobLocationLabel(job)}</p>
                  <p className="mt-1 text-sm capitalize text-[#CCC6BB]">Status: {job.status} | Client: {job.clientName || job.clientId}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-lg bg-[#2A2A2B] px-3 py-1 text-[#D8CFBC]">Applied {related.length}</span>
                    <span className="rounded-lg bg-[#2A2A2B] px-3 py-1 text-[#D8CFBC]">Live {live.length}</span>
                    <span className="rounded-lg bg-emerald-100 px-3 py-1 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100">Complete requests {requests.length}</span>
                    {timelinePay && <span className="rounded-lg bg-sky-100 px-3 py-1 text-sky-950 dark:bg-sky-400/15 dark:text-sky-100">Timelines {paidTimelines}/{timelineCount} paid</span>}
                  </div>
                  {timelinePay && (
                    <div className="mt-3 grid gap-1 text-sm font-bold text-[#CCC6BB]">
                      <p>Total client amount: {kes(Number(job.totalClientAmount ?? 0))}</p>
                      <p>Worker amount: {kes(Number(job.totalWorkerAmount ?? 0))}</p>
                      <p>Platform fee: {kes(Number(job.totalPlatformFee ?? 0))}</p>
                      <p>Unpaid timelines: {Number(job.unpaidTimelineCount ?? Math.max(0, timelineCount - paidTimelines))}</p>
                      <p>Payment status: {paidTimelines >= timelineCount ? "paid" : paidTimelines > 0 ? "partially paid" : "unpaid"}</p>
                    </div>
                  )}
                  {!!unpaidCompletedTimelines.length && (
                    <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
                      <p className="font-black">Completed timelines not paid: {unpaidCompletedTimelines.length}</p>
                      <div className="mt-3 grid gap-2">
                        {unpaidCompletedTimelines.map(timeline => (
                          <div key={timeline.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 p-2 dark:bg-black/20">
                            <span>Timeline {timeline.timelineNumber ?? ""} - {timeline.workerUsername ?? timeline.workerName ?? timeline.workerId ?? "Worker"}</span>
                            <Button type="button" className="min-h-9 px-3 py-1.5 text-xs" onClick={() => void sendPaymentWall(job, timeline)}>Send payment wall</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-black">{timelinePay ? kes(Number(job.totalClientAmount ?? job.payAmount ?? 0)) : kes(Number(job.payAmount ?? job.rateAmount ?? 0))}</p>
                  <Button type="button" variant="secondary" className="mt-3" onClick={() => setEditingJob(job)}>Edit anything</Button>
                </div>
              </div>
              {!!related.length && (
                <div className="mt-4 grid gap-2">
                  {related.slice(0, 4).map(application => (
                    <div key={application.id} className="rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-3 text-sm text-[#CCC6BB]">
                      <strong className="text-[#FFFBFF]">{application.workerName ?? application.workerId}</strong> - {application.status} - {application.coverNote || "No cover note"}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        }) : <EmptyState title="No jobs found" body="Posted work will appear here after clients create jobs." />}
      </div>
      {editingJob && (
        <AppModal title={`Edit job: ${editingJob.title}`} eyebrow="Admin job control" onClose={() => setEditingJob(null)} maxWidth="max-w-3xl">
          <form onSubmit={submitJobEdit} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="temp-label">Title<input name="title" defaultValue={editingJob.title} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Category<input name="category" defaultValue={editingJob.category} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Location<input name="location" defaultValue={editingJob.location} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">County<input name="county" defaultValue={editingJob.county ?? ""} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Pay amount<input name="payAmount" type="number" min={0} defaultValue={editingJob.payAmount ?? editingJob.rateAmount ?? 0} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Pay type<select name="payType" defaultValue={editingJob.payType ?? "fixed"} className="temp-input p-3 outline-none"><option value="fixed">Fixed pay</option><option value="pay_per_timeline">Pay per {perDurationUnit(editingJob.durationUnit)}</option></select></label>
              <label className="temp-label">Duration<input name="duration" defaultValue={editingJob.duration ?? ""} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Duration hours<input name="durationHours" type="number" min={0} defaultValue={editingJob.durationHours ?? 0} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Workers needed<input name="workersNeeded" type="number" min={1} defaultValue={editingJob.workersNeeded ?? 1} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Status<select name="status" defaultValue={editingJob.status} className="temp-input p-3 outline-none">{jobStatuses.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
            </div>
            <label className="temp-label">Description<textarea name="description" defaultValue={editingJob.description} className="temp-input min-h-28 p-3 outline-none" /></label>
            <label className="temp-label">Reason<textarea name="reason" required className="temp-input min-h-20 p-3 outline-none" placeholder="Explain why this admin edit is needed." /></label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditingJob(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save admin changes"}</Button>
            </div>
          </form>
        </AppModal>
      )}
    </div>
  );
}
