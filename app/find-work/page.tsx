"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import { JobCard } from "@/components/jobs/JobCard";
import { PostWorkWizard } from "@/components/jobs/PostWorkWizard";
import { IdentityVerificationModal } from "@/components/verification/IdentityVerificationModal";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { VerificationReminder } from "@/components/verification/VerificationReminder";
import { useLiveVerificationStatus } from "@/hooks/useLiveVerificationStatus";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { jobCategoryOptions } from "@/lib/jobCategories";
import { completeApplication, deleteJob, subscribeApplications, subscribeClientJobs, updateJob } from "@/services/jobs";
import { rateUser } from "@/services/ratings";
import { reportCompletedJob } from "@/services/reports";
import { CheckCircle2, MoreVertical, Plus } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Application, Job } from "@/types";
import { durationLabel, durationToHours, durationUnits, perDurationUnit, type DurationUnit } from "@/utils/duration";
import { isPayPerTimeline, timelinePaymentSummary } from "@/utils/timeline-payments";
import { calculateJobPaymentBreakdown, kes } from "@/utils/money";
import { completedJobId } from "@/utils/completed-job-id";
import { applicationTimelinePay } from "@/utils/application-timeline-pay";
import { clientCanPost } from "@/utils/jobRules";

export default function FindWorkPage() {
  const { profile, loading, isAuthorized, refreshProfile } = useProtectedRoute(["client", "admin"]);
  const [postedJobs, setPostedJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [postedJobsError, setPostedJobsError] = useState("");
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [progressJob, setProgressJob] = useState<Job | null>(null);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [progressCategory, setProgressCategory] = useState("All");
  const [paymentStep, setPaymentStep] = useState<"progress" | "review" | "complete">("progress");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState("");
  const [jobMenuOpen, setJobMenuOpen] = useState("");
  const [finishingJob, setFinishingJob] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [completedTab, setCompletedTab] = useState<"requests" | "history">("requests");
  const [postWorkOpen, setPostWorkOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [reportingJobId, setReportingJobId] = useState("");
  const { status: liveVerificationStatus, checking: checkingVerification } = useLiveVerificationStatus(profile?.verificationStatus);

  useEffect(() => {
    if (!profile || profile.role !== "client") return;
    return subscribeClientJobs(
      profile.id,
      jobs => {
        setPostedJobs(jobs);
        setPostedJobsError("");
      },
      error => {
        setPostedJobs([]);
        setPostedJobsError(error.message.includes("permission") ? "Posted work is not available right now." : "Unable to load posted work.");
      }
    );
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.role !== "client") return;
    return subscribeApplications(profile.id, "client", setApplications, () => setApplications([]));
  }, [profile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("completed") === "requests") {
      setCompletedTab("requests");
      setCompletedOpen(true);
    }
  }, []);

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingJob) return;
    const form = new FormData(event.currentTarget);
    setSavingEdit(true);
    try {
      const updated = await updateJob(editingJob.id, {
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        category: String(form.get("category") ?? ""),
        payAmount: Number(form.get("budget")),
        payType: String(form.get("payType")) as Job["payType"],
        duration: durationLabel(Number(form.get("timeline")), String(form.get("timelineUnit")) as DurationUnit),
        durationValue: Number(form.get("timeline")),
        durationUnit: String(form.get("timelineUnit")) as DurationUnit,
        durationHours: durationToHours(Number(form.get("timeline")), String(form.get("timelineUnit")) as DurationUnit),
        workersNeeded: Number(form.get("workersNeeded")),
        status: String(form.get("status")) as Job["status"]
      });
      setPostedJobs(items => items.map(item => item.id === updated.id ? updated : item));
      setEditingJob(null);
      toast.success("Posted work updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update posted work.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function removePostedJob(job: Job) {
    if (!window.confirm(`Delete "${job.title}"? This removes it from worker job listings.`)) return;
    setDeletingJobId(job.id);
    try {
      await deleteJob(job.id);
      setPostedJobs(items => items.filter(item => item.id !== job.id));
      toast.success("Posted work deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete posted work.");
    } finally {
      setDeletingJobId("");
    }
  }

  function acceptedCount(jobId: string) {
    return applications.filter(application => application.jobId === jobId && ["accepted", "completion_requested", "payment_sent"].includes(application.status)).length;
  }

  function pendingApplicationsForJob(jobId: string) {
    return applications.filter(application => application.jobId === jobId && application.status === "pending");
  }

  function hasHiringRoom(job: Job) {
    return acceptedCount(job.id) < (job.workersNeeded ?? 1);
  }

  function isJobInProgress(job: Job) {
    return job.status !== "completed" && job.status !== "cancelled" && (acceptedCount(job.id) > 0 || ["live", "assigned", "active", "in_progress"].includes(job.status));
  }

  function acceptedApplicationsForJob(jobId: string) {
    return applications.filter(application => application.jobId === jobId && ["accepted", "completion_requested", "payment_sent"].includes(application.status));
  }

  function payableApplicationsForJob(jobId: string) {
    return applications.filter(application => application.jobId === jobId && application.status === "completion_requested");
  }

  function canRateAfterThisPayment(application: Application) {
    return !isPayPerTimeline(application.jobPayType) || Math.max(0, Math.trunc(Number(application.submittedTimelineCount ?? 0) || 0)) > 0;
  }

  function paymentUnitLabel(application: Application) {
    return perDurationUnit(application.jobDurationUnit);
  }

  function pendingPaymentLabel(application: Application) {
    if (!isPayPerTimeline(application.jobPayType)) return "Pending payment";
    const timelinePay = applicationTimelinePay(application);
    const unit = paymentUnitLabel(application);
    return `Pending payment: ${timelinePay.submittedTimelineCount} ${unit}${timelinePay.submittedTimelineCount === 1 ? "" : "s"}`;
  }

  function pendingPaymentAmount(application: Application) {
    if (!isPayPerTimeline(application.jobPayType)) return calculateJobPaymentBreakdown(Number(application.jobAmount ?? 0)).workerEarnings;
    return applicationTimelinePay(application).submittedWorkerAmount;
  }

  async function finishJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!progressJob || !selectedApplicationIds.length) return;
    const form = new FormData(event.currentTarget);
    setFinishingJob(true);
    try {
      const selected = applications.filter(application => selectedApplicationIds.includes(application.id));
      const completed: Application[] = [];
      let ratingFailed = false;
      for (const application of selected) {
        const updated = await completeApplication(application);
        completed.push(updated);
        const stars = Number(form.get(`stars-${application.id}`) ?? 0);
        const canSaveRating = canRateAfterThisPayment(application) || updated.status === "completed" || updated.jobStatus === "completed";
        if (stars > 0 && canSaveRating) {
          try {
            await rateUser(application.jobId, application.workerId, stars, String(form.get(`review-${application.id}`) ?? ""), updated.paidTimelineRatingScopeId);
          } catch {
            ratingFailed = true;
          }
        }
      }
      setApplications(items => items.map(item => {
        const updated = completed.find(application => application.id === item.id);
        return updated ? { ...item, ...updated, status: isPayPerTimeline(item.jobPayType) ? updated.status : "payment_sent" } : item;
      }));
      if (progressJob && completed.some(application => application.jobStatus === "completed" || application.status === "completed")) {
        setPostedJobs(items => items.map(job => job.id === progressJob.id ? { ...job, status: "completed" } : job));
      }
      setPaymentStep("complete");
      toast.success(isPayPerTimeline(progressJob.payType) ? "Timeline payment marked as paid." : "Payment marked as sent. The worker must confirm they received it.");
      if (ratingFailed) toast.warning("Payment was saved, but one rating could not be submitted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to complete this job.";
      toast.error(message);
    } finally {
      setFinishingJob(false);
    }
  }

  function openPaymentReview(job: Job) {
    setProgressJob(job);
    setSelectedApplicationIds([]);
    setProgressCategory("All");
    setPaymentStep("progress");
  }

  function openPostWork() {
    if (checkingVerification) {
      toast.message("Checking your verification status. Try again in a moment.");
      return;
    }
    if (!clientCanPost({ verificationStatus: liveVerificationStatus })) {
      toast.error("Verify your identity before posting jobs.");
      setVerificationOpen(true);
      return;
    }
    setPostWorkOpen(true);
  }

  function closeProgress() {
    setProgressJob(null);
    setSelectedApplicationIds([]);
    setProgressCategory("All");
    setPaymentStep("progress");
  }

  async function reportCompletedClientJob(job: Job) {
    const id = completedJobId(job.id);
    const reason = window.prompt(`Describe the issue for completed job ${id}`);
    if (!reason?.trim()) return;
    setReportingJobId(job.id);
    try {
      const result = await reportCompletedJob({
        completedJobId: id,
        jobId: job.id,
        title: `Completed job issue: ${job.title ?? id}`,
        reason: reason.trim()
      });
      toast.success(`Report submitted. Ticket ${result.ticketId ?? "created"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit report.");
    } finally {
      setReportingJobId("");
    }
  }

  if (loading || !isAuthorized) return <LoadingSpinner label="Checking client access" />;
  const visiblePostedJobs = postedJobs.filter(job => !job.rehireOfJobId);
  const activeJobs = visiblePostedJobs.filter(job => job.status !== "completed");
  const completedJobs = visiblePostedJobs.filter(job => job.status === "completed");
  const completedRequests = applications.filter(application => application.status === "completion_requested");
  const menuJob = postedJobs.find(job => job.id === jobMenuOpen) ?? null;
  const selectedPaymentApplications = applications.filter(application => selectedApplicationIds.includes(application.id));
  const progressTimelineCount = Math.max(1, Math.trunc(Number(progressJob?.timelineCount ?? 1) || 1));
  const progressPaidTimelineCount = Math.min(progressTimelineCount, Math.max(0, Math.trunc(Number(progressJob?.paidTimelineCount ?? 0) || 0)));
  const progressClientPayPerTimeline = Number(progressJob?.clientPayPerTimeline ?? progressJob?.payAmount ?? progressJob?.rateAmount ?? 0);
  const progressTimelineSummary = timelinePaymentSummary(progressClientPayPerTimeline, progressTimelineCount);
  const progressWorkerPayPerTimeline = progressTimelineSummary.workerPayPerTimeline;
  const progressRemainingWorkerAmount = progressWorkerPayPerTimeline * Math.max(0, progressTimelineCount - progressPaidTimelineCount);
  const progressPaymentUnitLabel = perDurationUnit(progressJob?.durationUnit);
  const progressPaymentUnitTitle = progressPaymentUnitLabel.charAt(0).toUpperCase() + progressPaymentUnitLabel.slice(1);
  const ratingApplications = selectedPaymentApplications.length
    ? selectedPaymentApplications
    : progressJob
      ? payableApplicationsForJob(progressJob.id)
      : [];
  const rateableApplications = ratingApplications.filter(canRateAfterThisPayment);
  const visibleProgressApplications = progressJob
    ? acceptedApplicationsForJob(progressJob.id).filter(application => progressCategory === "All" || (application.jobCategory ?? progressJob.category) === progressCategory)
    : [];
  const visiblePayableApplications = visibleProgressApplications.filter(application => application.status === "completion_requested");
  return (
    <div className="space-y-6">
      {profile?.role === "client" && (
        <div className="grid gap-3">
          <div className="flex flex-wrap justify-end"><VerificationBadge status={profile.verificationStatus} /></div>
          <VerificationReminder profile={profile} onVerify={() => setVerificationOpen(true)} />
        </div>
      )}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Posted work</p>
            <h2 className="mt-2 text-2xl font-black text-[#FFFBFF]">Already posted jobs</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" className="temp-success-button" disabled={checkingVerification} onClick={openPostWork}><Plus size={17} /> {checkingVerification ? "Checking..." : "Post work"}</Button>
            <Button type="button" variant="secondary" className={completedRequests.length ? "completed-request-alert-button" : ""} onClick={() => { setCompletedTab(completedRequests.length ? "requests" : "history"); setCompletedOpen(true); }}><CheckCircle2 size={17} /> Completed ({completedJobs.length + completedRequests.length})</Button>
          </div>
        </div>
        {postedJobsError && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{postedJobsError}</p>}
        {activeJobs.length ? (
          <div className="posted-work-grid grid gap-4">
            {activeJobs.map(job => (
              <div key={job.id} className="space-y-2">
                <JobCard
                  job={job}
                  menuSlot={
                    <>
                      <button type="button" aria-label="Open posted work options" onClick={() => setJobMenuOpen(open => open === job.id ? "" : job.id)} className="job-menu-trigger">
                        <MoreVertical size={18} />
                      </button>
                    </>
                  }
                  infoActionSlot={pendingApplicationsForJob(job.id).length && hasHiringRoom(job) ? (
                    <Link href={`/applications?job=${job.id}`} className="temp-success-button copic-button inline-flex min-h-9 items-center justify-center rounded-lg px-4 py-1.5 text-sm font-bold">
                      Hire
                    </Link>
                  ) : isJobInProgress(job) ? (
                    <Button type="button" className="temp-success-button min-h-9 px-4 py-1.5 text-sm" onClick={() => openPaymentReview(job)}>Pay</Button>
                  ) : <span className="design-chip px-2.5 py-1 text-xs font-bold capitalize">{job.status}</span>}
                />
              </div>
            ))}
          </div>
        ) : <EmptyState title="No active posted work" body="Post new work from this page." />}
      </section>
      {postWorkOpen && profile?.role === "client" && <PostWorkWizard profile={{ ...profile, verificationStatus: liveVerificationStatus }} onClose={() => setPostWorkOpen(false)} />}
      {verificationOpen && profile?.role === "client" && <IdentityVerificationModal profile={profile} onClose={() => setVerificationOpen(false)} onSubmitted={refreshProfile} />}
      {menuJob && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onMouseDown={event => {
          if (event.target === event.currentTarget) setJobMenuOpen("");
        }}>
          <Card className="posted-work-action-popup w-full max-w-md">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.22em] text-[#959087]">Posted work options</p>
                <h2 className="mt-2 text-2xl font-black text-[#FFFBFF]">{menuJob.title}</h2>
                <p className="mt-1 text-sm font-bold text-[#CCC6BB]">{applications.filter(application => application.jobId === menuJob.id).length} application{applications.filter(application => application.jobId === menuJob.id).length === 1 ? "" : "s"}</p>
              </div>
              <Button type="button" variant="ghost" onClick={() => setJobMenuOpen("")}>Close</Button>
            </div>
            <div className="mt-6 grid gap-3">
              {!isJobInProgress(menuJob) && <button type="button" onClick={() => { setJobMenuOpen(""); setEditingJob(menuJob); }} className="posted-job-popup-action">Edit posted work</button>}
              <Link href={`/applications?job=${menuJob.id}`} onClick={() => setJobMenuOpen("")} className="posted-job-popup-action">View applications</Link>
              {!!pendingApplicationsForJob(menuJob.id).length && hasHiringRoom(menuJob) && <Link href={`/applications?job=${menuJob.id}`} onClick={() => setJobMenuOpen("")} className="posted-job-popup-action success">Hire applicants</Link>}
              {isJobInProgress(menuJob) && <button type="button" onClick={() => { setJobMenuOpen(""); openPaymentReview(menuJob); }} className="posted-job-popup-action success">Pay workers</button>}
              {!isJobInProgress(menuJob) && <button type="button" disabled={deletingJobId === menuJob.id} onClick={() => { setJobMenuOpen(""); void removePostedJob(menuJob); }} className="posted-job-popup-action danger">{deletingJobId === menuJob.id ? "Deleting" : "Delete post"}</button>}
            </div>
          </Card>
        </div>
      )}
      {completedOpen && (
        <div className="temp-modal-backdrop fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/70 p-4">
          <Card role="dialog" aria-modal="true" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden">
            <div className="shrink-0 flex items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Posted work</p><h2 className="mt-2 text-2xl font-black text-[#FFFBFF]">Completed work</h2></div><Button type="button" variant="ghost" onClick={() => setCompletedOpen(false)}>Close</Button></div>
            <div className="mt-5 flex shrink-0 flex-wrap gap-2 rounded-xl bg-[#2A2A2B] p-1">
              <button type="button" onClick={() => setCompletedTab("requests")} className={`completed-work-tab ${completedTab === "requests" ? "is-active" : ""}`}>Completed requests ({completedRequests.length})</button>
              <button type="button" onClick={() => setCompletedTab("history")} className={`completed-work-tab ${completedTab === "history" ? "is-active" : ""}`}>Past jobs ({completedJobs.length})</button>
            </div>
            <div className="no-visible-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" style={{ WebkitOverflowScrolling: "touch" }}>
              <div className="grid gap-5">
                {completedTab === "requests" && (
                  <section className="space-y-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.18em] text-[#959087]">Needs action</p>
                    <h3 className="mt-1 text-xl font-black text-[#111] dark:text-[#FFFBFF]">Completed requests</h3>
                  </div>
                  <div className="grid gap-3">
                    {completedRequests.length ? completedRequests.map(application => {
                      const pendingAmount = pendingPaymentAmount(application);
                      return (
                        <div key={`request-${application.id}`} className="rounded-xl border border-[#d8d8d8] !bg-white p-4 !text-[#111] dark:border-[#4A463F] dark:!bg-[#2A2A2B] dark:!text-[#FFFBFF]">
                          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#4b453e] dark:text-[#959087]">{application.jobCategory ?? "Completion requested"}</p>
                          <h4 className="mt-2 text-lg font-black">{application.jobTitle ?? "Completed job request"}</h4>
                          <p className="mt-2 text-sm text-[#4b453e] dark:text-[#CCC6BB]">{application.workerName ?? "A worker"} marked this job as complete. Confirm completion, pay the worker directly, then the worker confirms receiving payment.</p>
                          <div className="mt-3 grid gap-1 text-sm text-[#4b453e] dark:text-[#CCC6BB]">
                            {application.workerEmail && <p><strong className="text-[#111] dark:text-[#FFFBFF]">Email:</strong> {application.workerEmail}</p>}
                            {application.workerPhoneNumber && <p><strong className="text-[#111] dark:text-[#FFFBFF]">Phone:</strong> {application.workerPhoneNumber}</p>}
                            <p><strong className="text-[#111] dark:text-[#FFFBFF]">{pendingPaymentLabel(application)}</strong></p>
                            {pendingAmount > 0 ? <p><strong className="text-[#111] dark:text-[#FFFBFF]">Worker payment:</strong> {kes(pendingAmount)}</p> : null}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Link href={`/completed-requests?application=${application.id}`} onClick={() => setCompletedOpen(false)} className="temp-success-button inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-black">
                              Open completed requests
                            </Link>
                          </div>
                        </div>
                      );
                    }) : <EmptyState title="No completed requests" body="Worker completion requests will appear here before payment is sent." />}
                  </div>
                </section>
                )}
                {completedTab === "history" && (
                <section className="space-y-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.18em] text-[#959087]">History</p>
                    <h3 className="mt-1 text-xl font-black text-[#FFFBFF]">Past jobs</h3>
                  </div>
                  <div className="grid gap-4">
                    {completedJobs.length ? completedJobs.map(job => (
                      <div key={`completed-${job.id}`} className="space-y-2">
                        <JobCard job={job} />
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-100">
                          <span>Completed Job ID: <strong>{completedJobId(job.id)}</strong></span>
                          <Button type="button" variant="secondary" disabled={reportingJobId === job.id} onClick={() => void reportCompletedClientJob(job)}>
                            {reportingJobId === job.id ? "Reporting..." : "Report issue"}
                          </Button>
                        </div>
                        {job.recurrenceStatus === "cancelled" && <p className="rounded-xl border border-amber-500/40 bg-amber-300/15 p-3 text-sm font-bold text-amber-800 dark:text-amber-100">Ended early after {job.cancelledAfterPeriods ?? 0} paid month(s).</p>}
                      </div>
                    )) : <EmptyState title="No past completed jobs" body="Fully completed jobs will appear here after workers confirm payment." />}
                  </div>
                </section>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
      {editingJob && (
        <div className="temp-modal-backdrop fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/70 p-4">
          <Card role="dialog" aria-modal="true" className="no-visible-scrollbar max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Edit posted work</p>
                <h2 className="mt-2 text-2xl font-black text-[#FFFBFF]">{editingJob.title}</h2>
              </div>
              <Button type="button" variant="ghost" onClick={() => setEditingJob(null)}>Close</Button>
            </div>
            <form onSubmit={submitEdit} className="popup-form mt-6 grid gap-4">
              <label className="temp-label">Job title<input name="title" required defaultValue={editingJob.title} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Description<textarea name="description" required defaultValue={editingJob.description} className="temp-input min-h-28 p-3 outline-none" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="temp-label">Job price<input name="budget" required type="number" min={50} defaultValue={editingJob.payAmount} className="temp-input p-3 outline-none" /></label>
                <label className="temp-label">Work timeline<div className="grid grid-cols-[1fr_auto] gap-2"><input name="timeline" required type="number" min={1} defaultValue={editingJob.durationValue ?? editingJob.durationHours ?? 1} className="temp-input min-w-0 p-3 outline-none" /><select name="timelineUnit" defaultValue={editingJob.durationUnit ?? "hours"} className="temp-input p-3 outline-none">{durationUnits.map(unit => <option key={unit}>{unit}</option>)}</select></div></label>
                <label className="temp-label">Workers needed<input name="workersNeeded" required type="number" min={1} max={100} defaultValue={editingJob.workersNeeded ?? 1} className="temp-input p-3 outline-none" /></label>
                <label className="temp-label">Category<select name="category" required defaultValue={editingJob.category} className="temp-input p-3 outline-none">
                  {jobCategoryOptions.map((option, index) => <option key={`edit-${option}-${index}`} value={option}>{option}</option>)}
                </select></label>
                <label className="temp-label">Pay type<select name="payType" defaultValue={editingJob.payType} className="temp-input p-3 outline-none"><option value="fixed">Fixed pay</option><option value="pay_per_timeline">Pay per {perDurationUnit(editingJob.durationUnit)}</option></select></label>
                {!isJobInProgress(editingJob) && <label className="temp-label sm:col-span-2">Status<select name="status" defaultValue={editingJob.status} className="temp-input p-3 outline-none"><option value="open">Open</option><option value="cancelled">Cancelled</option></select></label>}
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setEditingJob(null)}>Cancel</Button>
                <Button type="submit" disabled={savingEdit}>{savingEdit ? "Saving..." : "Save changes"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
      {progressJob && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <Card className="w-full max-w-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-200">Ongoing job</p>
                <h2 className="mt-2 text-2xl font-black text-[#FFFBFF]">{progressJob.title}</h2>
              </div>
              <Button type="button" variant="ghost" onClick={closeProgress}>Close</Button>
            </div>

            {paymentStep === "progress" && (
              <div className="mt-6 space-y-4">
                <div>
                  <h3 className="text-xl font-black text-[#FFFBFF]">Choose workers to pay</h3>
                  <p className="mt-2 text-sm text-[#CCC6BB]">Select one worker, multiple workers, or filter by category before continuing to payment.</p>
                </div>
                <div className="temp-progress-status rounded-xl p-4 text-sm">
                  {isPayPerTimeline(progressJob.payType)
                    ? `${progressPaymentUnitTitle} payments: ${progressPaidTimelineCount}/${progressTimelineCount} paid. Remaining worker amount: ${kes(progressRemainingWorkerAmount)}.`
                    : `${acceptedCount(progressJob.id)} of ${progressJob.workersNeeded ?? 1} workers accepted. This job is in progress.`}
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <label className="temp-label min-w-48">Category<select value={progressCategory} onChange={event => setProgressCategory(event.target.value)} className="temp-input p-3 outline-none">
                    <option value="All">Any category</option>
                    {[...new Set(acceptedApplicationsForJob(progressJob.id).map(application => application.jobCategory ?? progressJob.category))].map(item => <option key={item}>{item}</option>)}
                  </select></label>
                  <Button type="button" variant="secondary" onClick={() => {
                    const visibleIds = visiblePayableApplications.map(application => application.id);
                    setSelectedApplicationIds(visibleIds);
                  }} disabled={!visiblePayableApplications.length}>{isPayPerTimeline(progressJob.payType) ? `Pay all submitted ${progressPaymentUnitLabel}s` : "Select all in category"}</Button>
                </div>
                <div className="grid gap-3">
                  {visibleProgressApplications.length ? visibleProgressApplications.map(application => {
                    const canPay = application.status === "completion_requested";
                    const timelinePay = applicationTimelinePay(application);
                    const submittedAmount = pendingPaymentAmount(application);
                    return (
                    <div key={application.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-4">
                      <label className={`flex items-center gap-3 ${canPay ? "" : "opacity-70"}`}>
                        <input type="checkbox" disabled={!canPay} checked={selectedApplicationIds.includes(application.id)} onChange={event => setSelectedApplicationIds(ids => event.target.checked ? [...new Set([...ids, application.id])] : ids.filter(id => id !== application.id))} />
                        <span>
                        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#959087]">{application.jobCategory ?? progressJob.category}</p>
                        <p className="font-black text-[#FFFBFF]">{application.workerName ?? "Worker applicant"}</p>
                        {isPayPerTimeline(application.jobPayType) && <p className="mt-1 text-xs font-bold text-[#CCC6BB]">Pending payment: {timelinePay.submittedTimelineCount} {progressPaymentUnitLabel}{timelinePay.submittedTimelineCount === 1 ? "" : "s"} · {application.paidTimelineCount ?? 0}/{application.timelineCount ?? 1} paid</p>}
                        {canPay && submittedAmount > 0 && <p className="mt-1 text-xs font-black text-[#FFFBFF]">Worker payment: {kes(submittedAmount)}</p>}
                        </span>
                      </label>
                        {canPay ? (
                          <Button type="button" className="temp-success-button" onClick={() => { setSelectedApplicationIds([application.id]); setPaymentStep("review"); }}>
                            {isPayPerTimeline(application.jobPayType) ? `Pay submitted ${progressPaymentUnitLabel}${timelinePay.submittedTimelineCount === 1 ? "" : "s"}` : "Pay this worker"}
                          </Button>
                      ) : application.status === "payment_sent" ? (
                        <span className="rounded-full border border-purple-500/30 bg-purple-400/10 px-3 py-1 text-xs font-black text-purple-800 dark:text-purple-100">Waiting for worker payment confirmation</span>
                      ) : (
                        <span className="rounded-full border border-amber-500/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-800 dark:text-amber-100">Worker must mark complete first</span>
                      )}
                    </div>
                  );
                }) : <EmptyState title="No workers ready for payment" body="Workers will appear here after they accept the job." />}
                </div>
                <Button type="button" className="temp-success-button w-full" disabled={!selectedApplicationIds.length} onClick={() => setPaymentStep("review")}>Continue to payment</Button>
              </div>
            )}

            {paymentStep === "review" && (
              <form onSubmit={finishJob} className="mt-6 grid gap-4">
                <p className="text-sm text-[#CCC6BB]">Pay each worker directly outside the platform. The job will be completed only after every worker confirms they have received their payment.</p>
                <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-bold text-amber-100">
                  Payment is for labor only. Does not include materials and transport
                </p>
                <div className="grid gap-3">
                  {rateableApplications.length ? rateableApplications.map(application => (
                      <div key={`rating-${application.id}`} className="rounded-xl bg-[#2A2A2B] p-4">
                        <p className="text-sm font-black text-[#FFFBFF]">{application.workerName ?? "Worker"}</p>
                        <p className="mt-1 text-sm font-bold text-[#CCC6BB]">{pendingPaymentLabel(application)} · Worker payment: {kes(pendingPaymentAmount(application))}</p>
                        <StarRatingInput name={`stars-${application.id}`} label="Rate worker optional" />
                        <label className="temp-label mt-3">Review optional<textarea name={`review-${application.id}`} placeholder="Optional public review" className="temp-input min-h-20 p-3 outline-none" /></label>
                      </div>
                  )) : <p className="rounded-xl bg-[#2A2A2B] p-3 text-sm text-[#CCC6BB]">{ratingApplications.length ? "Ratings appear when a submitted day/hour is ready to pay." : "Select a worker first to add a rating."}</p>}
                </div>
                <label className="temp-label">Remarks optional<textarea name="remarks" placeholder="Optional note" className="temp-input min-h-24 p-3 outline-none" /></label>
                <Button type="submit" className="temp-success-button" disabled={finishingJob}>{finishingJob ? "Saving..." : "I Have Paid The Worker"}</Button>
              </form>
            )}

            {paymentStep === "complete" && (
              <div className="mt-6 rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-5 text-center">
                <h3 className="text-xl font-black text-emerald-800 dark:text-emerald-100">Payment marked as sent</h3>
                <p className="mt-2 text-sm text-[#CCC6BB]">The worker has been asked to confirm they received payment. The job will be completed and the service-fee lock will begin only after the worker confirms receipt.</p>
                <p className="mt-4 rounded-xl border border-[#4A463F] bg-[#171718] p-3 text-sm font-black text-[#FFFBFF]">Rating option: use the stars in the payment review step before clicking I Have Paid The Worker.</p>
                <Button type="button" className="temp-success-button mt-5" onClick={closeProgress}>Done</Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
