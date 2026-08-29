"use client";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { acceptApplication, cancelApplication, cancelLiveApplication, completeApplication, confirmWorkerPaymentReceived, requestApplicationCompletion, subscribeApplications } from "@/services/jobs";
import { rateUser } from "@/services/ratings";
import type { Application } from "@/types";
import { applicationTimelinePay } from "@/utils/application-timeline-pay";
import { perDurationUnit } from "@/utils/duration";
import { isPayPerTimeline } from "@/utils/timeline-payments";
import { calculateJobPaymentBreakdown, kes } from "@/utils/money";
import { normalizeVerificationStatus } from "@/utils/verification";
import { ArrowLeft, Mail, MessageCircle, Phone, Star } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

export default function ApplicationsPage() {
  const { profile, loading: authLoading, isAuthorized } = useProtectedRoute(["client", "worker"]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [viewingWorker, setViewingWorker] = useState<Application | null>(null);
  const [acceptingId, setAcceptingId] = useState("");
  const [completingId, setCompletingId] = useState("");
  const [pendingCompletion, setPendingCompletion] = useState<Application | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedApplicationId(params.get("application") ?? "");
    setSelectedJobId(params.get("job") ?? "");
  }, []);

  useEffect(() => {
    if (!profile || profile.role === "admin") return;
    return subscribeApplications(profile.id, profile.role, items => {
      setApplications(items);
      setLoading(false);
    }, () => setLoading(false));
  }, [profile]);

  if (authLoading || !isAuthorized || loading || !profile) return <LoadingSpinner label="Opening applications" />;
  const nonRehireApplications = applications.filter(application => application.coverNote !== "Rehire request");
  const roleScopedApplications = profile.role === "client"
    ? nonRehireApplications.filter(application => application.status !== "completion_requested")
    : nonRehireApplications;
  const visibleApplications = selectedJobId ? roleScopedApplications.filter(application => application.jobId === selectedJobId) : roleScopedApplications;
  const currentJobApplications = visibleApplications.filter(application => ["accepted", "completion_requested", "payment_sent"].includes(application.status) && application.jobStatus !== "completed" && application.jobStatus !== "cancelled");
  const pastOrPendingApplications = visibleApplications.filter(application => !(["accepted", "completion_requested", "payment_sent"].includes(application.status) && application.jobStatus !== "completed" && application.jobStatus !== "cancelled"));

  if (!visibleApplications.length) return (
    <div className="space-y-4">
      <Link href={profile.role === "client" ? "/find-work" : "/dashboard"} className="applications-back-button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold">
        <ArrowLeft size={16} aria-hidden="true" /> Back
      </Link>
      <EmptyState title={profile.role === "client" ? "No applicants yet" : "No applications yet"} body={profile.role === "client" ? "Applications will appear after workers apply to your jobs." : "Applications will appear after you apply for work."} />
    </div>
  );

  async function accept(application: Application) {
    setAcceptingId(application.id);
    try {
      const updated = await acceptApplication(application);
      setApplications(items => items.map(item => item.id === application.id ? { ...item, ...updated, status: "accepted" } : item));
      toast.success("Application accepted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to accept application.");
    } finally {
      setAcceptingId("");
    }
  }

  async function confirmComplete(application: Application, stars = 0, review = "") {
    setCompletingId(application.id);
    try {
      const updated = await completeApplication(application);
      setApplications(items => items.map(item => item.id === application.id ? { ...item, ...updated } : item));
      toast.success("Payment marked as sent. The worker must confirm they received it before the job completes.");
      const canSaveRating = canRateAfterThisPayment(application) || updated.status === "completed" || updated.jobStatus === "completed";
      if (stars > 0 && canSaveRating) {
        try {
          await rateUser(application.jobId, application.workerId, stars, review, updated.paidTimelineRatingScopeId);
          toast.success("Worker rating submitted.");
        } catch {
          toast.warning("Payment was saved, but the rating could not be submitted.");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to confirm completion.");
    } finally {
      setCompletingId("");
    }
  }

  function submitCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingCompletion) return;
    const form = new FormData(event.currentTarget);
    const application = pendingCompletion;
    setPendingCompletion(null);
    void confirmComplete(application, Number(form.get("stars") ?? 0), String(form.get("review") ?? ""));
  }

  function canRateAfterThisPayment(application: Application) {
    return !isPayPerTimeline(application.jobPayType) || Math.max(0, Math.trunc(Number(application.submittedTimelineCount ?? 0) || 0)) > 0;
  }

  function pendingPaymentLabel(application: Application) {
    if (!isPayPerTimeline(application.jobPayType)) return "Pending payment";
    const timelinePay = applicationTimelinePay(application);
    const unit = perDurationUnit(application.jobDurationUnit);
    return `Pending payment: ${timelinePay.submittedTimelineCount} ${unit}${timelinePay.submittedTimelineCount === 1 ? "" : "s"}`;
  }

  function pendingPaymentAmount(application: Application) {
    if (!isPayPerTimeline(application.jobPayType)) return calculateJobPaymentBreakdown(Number(application.jobAmount ?? 0)).workerEarnings;
    return applicationTimelinePay(application).submittedWorkerAmount;
  }

  return (
    <div className="space-y-4">
      <Link href={profile.role === "client" ? "/find-work" : "/dashboard"} className="applications-back-button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold">
        <ArrowLeft size={16} aria-hidden="true" /> Back
      </Link>
      <h1 className="text-3xl font-black">{profile.role === "client" ? "Applicants" : "Applications"}</h1>
      {profile.role === "worker" ? (
        <>
          <ApplicationSection
            title="Current job"
            empty="Accepted jobs will appear here as ongoing work."
            applications={currentJobApplications}
            onCancel={application => {
              setApplications(items => items.map(item => item.id === application.id ? application : item));
            }}
          />
          <ApplicationSection
            title="Applied jobs"
            empty="Pending and past applications will appear here."
            applications={pastOrPendingApplications}
            onCancel={application => {
              setApplications(items => items.map(item => item.id === application.id ? application : item));
            }}
          />
        </>
      ) : visibleApplications.map(application => (
        <Card key={application.id} id={`application-${application.id}`} className={selectedApplicationId === application.id ? "ring-2 ring-bone" : ""}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-[#FFFBFF]">{application.jobTitle ?? "Job application"}</h2>
              <div className="mt-2"><StatusPill status={application.status} /></div>
            </div>
          </div>
          {profile.role === "client" && (
            <div className="mt-4 rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-black text-[#FFFBFF]">{application.workerName ?? "Worker applicant"}</p>
                <WorkerVerificationPill status={application.workerVerificationStatus} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#CCC6BB]">
                <span className="inline-flex items-center gap-1"><Star size={15} /> {application.workerRatingAverage ?? 0}</span>
                <span>{application.workerCompletedJobs ?? 0} completed jobs</span>
                {application.workerEmail && <span className="inline-flex items-center gap-1"><Mail size={15} /> {application.workerEmail}</span>}
                {application.workerPhoneNumber && <span className="inline-flex items-center gap-1"><Phone size={15} /> {application.workerPhoneNumber}</span>}
              </div>
              {!!application.workerSkills?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {application.workerSkills.map((skill, index) => <span key={`${application.id}-${skill}-${index}`} className="rounded-lg bg-[#11120D] px-3 py-1 text-xs font-bold text-[#D8CFBC]">{skill}</span>)}
                </div>
              )}
              {application.coverNote && <p className="mt-4 text-sm text-[#959087]">{application.coverNote}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setViewingWorker(application)}>View worker profile</Button>
                {application.status === "pending" && (
                  <Button type="button" disabled={acceptingId === application.id || normalizeVerificationStatus(application.workerVerificationStatus) !== "approved"} onClick={() => void accept(application)}>
                    {acceptingId === application.id ? "Accepting..." : normalizeVerificationStatus(application.workerVerificationStatus) !== "approved" ? "Worker not verified" : "Accept application"}
                  </Button>
                )}
              {application.status === "completion_requested" && (
                  <Button type="button" className="temp-success-button" disabled={completingId === application.id} onClick={() => setPendingCompletion(application)}>
                    {completingId === application.id ? "Saving..." : "Confirm complete and pay"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      ))}
      {viewingWorker && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <Card className="w-full max-w-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Worker profile</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-black text-[#FFFBFF]">{viewingWorker.workerName ?? "Worker applicant"}</h2>
                  <WorkerVerificationPill status={viewingWorker.workerVerificationStatus} />
                </div>
              </div>
              <Button type="button" variant="ghost" onClick={() => setViewingWorker(null)}>Close</Button>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-[#CCC6BB]">
              <p className="inline-flex items-center gap-2"><Star size={16} /> Rating: {viewingWorker.workerRatingAverage ?? 0}</p>
              <p>{viewingWorker.workerCompletedJobs ?? 0} completed jobs</p>
              {viewingWorker.workerEmail && <p className="inline-flex items-center gap-2"><Mail size={16} /> {viewingWorker.workerEmail}</p>}
              {viewingWorker.workerPhoneNumber && <p className="inline-flex items-center gap-2"><Phone size={16} /> {viewingWorker.workerPhoneNumber}</p>}
            </div>
            {!!viewingWorker.workerSkills?.length && (
              <div className="mt-5 flex flex-wrap gap-2">
                {viewingWorker.workerSkills.map((skill, index) => <span key={`modal-${skill}-${index}`} className="rounded-lg bg-[#11120D] px-3 py-1 text-xs font-bold text-[#D8CFBC]">{skill}</span>)}
              </div>
            )}
            {viewingWorker.coverNote && (
              <div className="mt-5 rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-4">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-[#959087]">Application message</p>
                <p className="mt-2 text-sm text-[#CCC6BB]">{viewingWorker.coverNote}</p>
              </div>
            )}
          </Card>
        </div>
      )}
      {pendingCompletion && (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-black/70 p-4">
          <Card className="w-full max-w-md">
            <h3 className="text-2xl font-black text-[#111] dark:text-[#FFFBFF]">Confirm completion and pay worker</h3>
            <p className="mt-2 text-sm text-[#4b453e] dark:text-[#CCC6BB]">
              Confirm only if {pendingCompletion.workerName ?? "the worker"} has finished the work. Pay the worker directly outside the platform, then click below. The job will not be completed until the worker confirms they received the money.
            </p>
            <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-bold text-amber-900 dark:text-amber-100">
              Payment is for labor only. Does not include materials and transport
            </p>
            <div className="mt-4 rounded-xl border border-[#d8d8d8] bg-[#f3f4f5] p-4 text-sm text-[#4b453e] dark:border-[#4A463F] dark:bg-[#2A2A2B] dark:text-[#CCC6BB]">
              <p><strong className="text-[#111] dark:text-[#FFFBFF]">Worker:</strong> {pendingCompletion.workerName ?? "Worker"}</p>
              <p className="mt-2"><strong className="text-[#111] dark:text-[#FFFBFF]">Phone:</strong> {pendingCompletion.workerPhoneNumber ?? "No phone provided"}</p>
              <p className="mt-2"><strong className="text-[#111] dark:text-[#FFFBFF]">{pendingPaymentLabel(pendingCompletion)}</strong></p>
              <p className="mt-2"><strong className="text-[#111] dark:text-[#FFFBFF]">Worker payment:</strong> {kes(pendingPaymentAmount(pendingCompletion))}</p>
            </div>
            <form onSubmit={submitCompletion} className="mt-5 grid gap-4">
              {canRateAfterThisPayment(pendingCompletion) ? (
                <>
                  <StarRatingInput name="stars" label="Rate worker optional" />
                  <label className="temp-label">Review optional<textarea name="review" placeholder="Optional public review" className="temp-input min-h-20 p-3 outline-none" /></label>
                </>
              ) : <p className="rounded-xl bg-[#2A2A2B] p-3 text-sm text-[#CCC6BB]">Ratings appear when a submitted day/hour is ready to pay.</p>}
              <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => setPendingCompletion(null)}>Review first</Button>
              <Button type="submit" className="temp-success-button" disabled={completingId === pendingCompletion.id}>
                {completingId === pendingCompletion.id ? "Saving..." : "I Have Paid The Worker"}
              </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

function ApplicationSection({ title, empty, applications, onCancel }: { title: string; empty: string; applications: Application[]; onCancel?: (application: Application) => void }) {
  const [cancellingId, setCancellingId] = useState("");
  const [completingId, setCompletingId] = useState("");
  const [confirmingPaymentId, setConfirmingPaymentId] = useState("");
  const [pendingCancel, setPendingCancel] = useState<Application | null>(null);
  const [pendingLiveCancel, setPendingLiveCancel] = useState<Application | null>(null);
  const [pendingTimelineComplete, setPendingTimelineComplete] = useState<Application | null>(null);
  async function cancel(application: Application) {
    setCancellingId(application.id);
    try {
      const updated = await cancelApplication(application);
      onCancel?.({ ...application, ...updated, status: "withdrawn" });
      toast.success("Application cancelled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel application.");
    } finally {
      setCancellingId("");
    }
  }
  async function cancelLive(application: Application) {
    setCancellingId(application.id);
    try {
      const updated = await cancelLiveApplication(application);
      onCancel?.({ ...application, ...updated, status: "cancelled", jobStatus: "cancelled" });
      toast.success("Live job cancelled with no pay.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel live job.");
    } finally {
      setCancellingId("");
    }
  }
  async function requestComplete(application: Application, timelineCount?: number) {
    setCompletingId(application.id);
    try {
      const updated = await requestApplicationCompletion(application, timelineCount);
      onCancel?.({ ...application, ...updated, status: "completion_requested" });
      toast.success("Completion sent to the client for confirmation.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to mark work complete.");
    } finally {
      setCompletingId("");
    }
  }
  async function confirmPayment(application: Application) {
    setConfirmingPaymentId(application.id);
    try {
      const updated = await confirmWorkerPaymentReceived(application);
      onCancel?.({ ...application, ...updated, status: "completed" });
      const fee = Number((updated as Application & { outstandingServiceFee?: number }).outstandingServiceFee ?? 0);
      if (fee > 0 && typeof window !== "undefined") window.sessionStorage.setItem("temp.forceServiceFee", String(fee));
      toast.success("Payment received confirmed. Your account is now locked until the service fee is paid.");
      window.location.assign("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to confirm payment received.");
    } finally {
      setConfirmingPaymentId("");
    }
  }
  const isCurrentJobSection = title === "Current job";
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-black text-[#FFFBFF]">{title}</h2>
      {applications.length ? applications.map(application => (
        <Card key={application.id} data-copic-component={isCurrentJobSection ? "current-job-v2" : undefined}>
          {(() => {
            const timelinePay = applicationTimelinePay(application);
            const fixedPay = calculateJobPaymentBreakdown(Number(application.jobAmount ?? 0));
            const timelineUnitLabel = perDurationUnit(application.jobDurationUnit);
            const timelineUnitTitle = timelineUnitLabel.charAt(0).toUpperCase() + timelineUnitLabel.slice(1);
            return (
            <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-[#FFFBFF]">{application.jobTitle ?? "Job application"}</h3>
              {application.jobCategory && <p className="mt-1 text-xs font-bold uppercase tracking-[.16em] text-[#959087]">{application.jobCategory}</p>}
              <p className="mt-2 text-sm capitalize text-[#CCC6BB]">
                {application.status === "accepted" && application.jobStatus !== "completed" ? (
                  <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-400/20 px-3 py-1 font-black text-emerald-800 dark:text-emerald-100">Ongoing job</span>
                ) : application.status === "completion_requested" ? (
                  <span className="inline-flex rounded-full border border-sky-500/40 bg-sky-400/20 px-3 py-1 font-black text-sky-800 dark:text-sky-100">Waiting for client confirmation</span>
                ) : application.status === "payment_sent" ? (
                  <span className="inline-flex rounded-full border border-purple-500/40 bg-purple-400/20 px-3 py-1 font-black text-purple-800 dark:text-purple-100">Confirm payment received</span>
                ) : <StatusPill status={application.status} />}
              </p>
              {isPayPerTimeline(application.jobPayType) && (
                <div className="mt-3 rounded-xl border border-bone/10 bg-bone/[.04] p-3 text-sm font-bold text-[#CCC6BB]">
                  <p>{timelineUnitTitle} payments: {timelinePay.paidTimelineCount}/{timelinePay.timelineCount} paid</p>
                  <p className="mt-1">Pay per {timelineUnitLabel}: {kes(timelinePay.workerPayPerTimeline)}</p>
                  <p className="mt-1">Paid worker amount: {kes(timelinePay.paidWorkerAmount)}</p>
                  <p className="mt-1">Remaining worker amount: {kes(timelinePay.remainingWorkerAmount)}</p>
                </div>
              )}
              {!isPayPerTimeline(application.jobPayType) && Number(application.jobAmount ?? 0) > 0 && ["accepted", "completion_requested", "payment_sent", "completed"].includes(application.status) && (
                <div className="mt-3 rounded-xl border border-bone/10 bg-bone/[.04] p-3 text-sm font-bold text-[#CCC6BB]">
                  <p className="text-base font-black text-[#FFFBFF]">You should receive: {kes(fixedPay.workerEarnings)}</p>
                </div>
              )}
            </div>
            {application.status === "accepted" && application.jobStatus !== "completed" && (
              <div className="flex flex-wrap gap-2">
                <Link href="/chat" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-bone px-4 py-2 text-sm font-black text-[#1E1B13]">
                  <MessageCircle size={16} /> Chat with employer
                </Link>
                <Button type="button" disabled={completingId === application.id} onClick={() => isPayPerTimeline(application.jobPayType) ? setPendingTimelineComplete(application) : void requestComplete(application)}>
                  {completingId === application.id ? "Sending..." : isPayPerTimeline(application.jobPayType) ? `Mark ${timelineUnitLabel} ${application.nextTimelineNumber ?? ""} complete` : "Mark complete"}
                </Button>
                <Button type="button" variant="secondary" disabled={cancellingId === application.id} onClick={() => setPendingLiveCancel(application)}>
                  {cancellingId === application.id ? "Cancelling..." : "Cancel live job"}
                </Button>
              </div>
            )}
            {application.status === "payment_sent" && (
              <div className="flex flex-wrap gap-2">
                <Link href="/chat" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-bone px-4 py-2 text-sm font-black text-[#1E1B13]">
                  <MessageCircle size={16} /> Chat with employer
                </Link>
                <Button type="button" className="temp-success-button" disabled={confirmingPaymentId === application.id} onClick={() => void confirmPayment(application)}>
                  {confirmingPaymentId === application.id ? "Confirming..." : "I Received Payment"}
                </Button>
                <Button type="button" variant="secondary" disabled={cancellingId === application.id} onClick={() => setPendingLiveCancel(application)}>
                  {cancellingId === application.id ? "Cancelling..." : "Cancel live job"}
                </Button>
              </div>
            )}
            {application.status === "completion_requested" && (
              <Button type="button" variant="secondary" disabled={cancellingId === application.id} onClick={() => setPendingLiveCancel(application)}>
                {cancellingId === application.id ? "Cancelling..." : "Cancel live job"}
              </Button>
            )}
            {application.status === "pending" && (
              <Button type="button" variant="secondary" disabled={cancellingId === application.id} onClick={() => setPendingCancel(application)}>
                {cancellingId === application.id ? "Cancelling..." : "Cancel application"}
              </Button>
            )}
          </div>
          {application.coverNote && <p className="mt-4 text-sm text-[#959087]">{application.coverNote}</p>}
          {application.clientRating && <p className="mt-3 inline-flex items-center gap-1 text-sm font-black text-amber-200"><Star size={16} /> Client rating: {application.clientRating}/5</p>}
            </>
          );
          })()}
        </Card>
      )) : <EmptyState title={`No ${title.toLowerCase()}`} body={empty} />}
      {pendingCancel && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4">
          <Card className="w-full max-w-md">
            <h3 className="text-2xl font-black text-[#FFFBFF]">Cancel application?</h3>
            <p className="mt-2 text-sm text-[#CCC6BB]">Are you sure you want to cancel? You can only cancel twice per day.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => setPendingCancel(null)}>Keep application</Button>
              <Button type="button" disabled={cancellingId === pendingCancel.id} onClick={() => {
                const application = pendingCancel;
                setPendingCancel(null);
                void cancel(application);
              }}>
                {cancellingId === pendingCancel.id ? "Cancelling..." : "Yes, cancel"}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {pendingLiveCancel && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4">
          <Card className="w-full max-w-md">
            <h3 className="text-2xl font-black text-[#FFFBFF]">Cancel live job?</h3>
            <p className="mt-2 text-sm text-[#CCC6BB]">Are you sure you want to cancel this job? If you cancel after accepting, the job will be cancelled with no pay.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => setPendingLiveCancel(null)}>Keep job</Button>
              <Button type="button" disabled={cancellingId === pendingLiveCancel.id} onClick={() => {
                const application = pendingLiveCancel;
                setPendingLiveCancel(null);
                void cancelLive(application);
              }}>
                {cancellingId === pendingLiveCancel.id ? "Cancelling..." : "Yes, cancel live job"}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {pendingTimelineComplete && (() => {
        const timelinePay = applicationTimelinePay(pendingTimelineComplete);
        const unit = perDurationUnit(pendingTimelineComplete.jobDurationUnit);
        const unitTitle = unit.charAt(0).toUpperCase() + unit.slice(1);
        const submittedCount = Math.max(0, Number(pendingTimelineComplete.submittedTimelineCount ?? 0));
        const maxCount = Math.max(1, timelinePay.timelineCount - timelinePay.paidTimelineCount - submittedCount);
        return (
          <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4">
            <Card className="w-full max-w-md">
              <h3 className="text-2xl font-black text-[#FFFBFF]">Mark {unit}s complete</h3>
              <p className="mt-2 text-sm text-[#CCC6BB]">Choose how many {unit}s you finished. The client will pay only the submitted {unit}s.</p>
              <form onSubmit={event => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const count = Math.max(1, Math.min(maxCount, Math.trunc(Number(form.get("timelineCount")) || 1)));
                const application = pendingTimelineComplete;
                setPendingTimelineComplete(null);
                void requestComplete(application, count);
              }} className="mt-5 grid gap-4">
                <label className="temp-label">{unitTitle}s to mark complete
                  <input name="timelineCount" type="number" min={1} max={maxCount} defaultValue={1} className="temp-input mt-2 p-3 outline-none" />
                </label>
                <p className="text-xs font-bold text-[#CCC6BB]">Available now: {maxCount} of {timelinePay.timelineCount} {unit}s.</p>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={() => setPendingTimelineComplete(null)}>Cancel</Button>
                  <Button type="submit" disabled={completingId === pendingTimelineComplete.id}>Submit {unit}s</Button>
                </div>
              </form>
            </Card>
          </div>
        );
      })()}
    </section>
  );
}

function WorkerVerificationPill({ status }: { status?: Application["workerVerificationStatus"] }) {
  const verified = normalizeVerificationStatus(status) === "approved";
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${verified ? "border-emerald-500/40 bg-emerald-400/20 text-emerald-800 dark:text-emerald-100" : "border-amber-400/50 bg-amber-300/20 text-amber-800 dark:text-amber-100"}`}>
      {verified ? "Verified" : "Unverified"}
    </span>
  );
}

function StatusPill({ status }: { status: Application["status"] }) {
  if (status === "accepted") {
    return <span className="inline-flex rounded-full border border-amber-400/50 bg-amber-300/20 px-3 py-1 text-sm font-black text-amber-800 dark:text-amber-100">Accepted</span>;
  }
  if (status === "completed") {
    return <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-400/20 px-3 py-1 text-sm font-black text-emerald-800 dark:text-emerald-100">Done</span>;
  }
  if (status === "completion_requested") {
    return <span className="inline-flex rounded-full border border-sky-500/40 bg-sky-100 px-3 py-1 text-sm font-black !text-sky-950 dark:bg-sky-400/20 dark:!text-sky-100">Completion requested</span>;
  }
  if (status === "payment_sent") {
    return <span className="inline-flex rounded-full border border-purple-500/40 bg-purple-400/20 px-3 py-1 text-sm font-black text-purple-800 dark:text-purple-100">Payment sent</span>;
  }
  return <span className="text-sm capitalize text-[#CCC6BB]">Status: {status}</span>;
}
