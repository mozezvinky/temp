"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { completeApplication, subscribeApplications } from "@/services/jobs";
import { rateUser } from "@/services/ratings";
import type { Application } from "@/types";
import { applicationTimelinePay } from "@/utils/application-timeline-pay";
import { perDurationUnit } from "@/utils/duration";
import { kes } from "@/utils/money";
import { isPayPerTimeline } from "@/utils/timeline-payments";
import { ArrowLeft, Mail, Phone, Star } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

export default function CompletedRequestsPage() {
  const { profile, loading: authLoading, isAuthorized } = useProtectedRoute(["client"]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [pendingCompletion, setPendingCompletion] = useState<Application | null>(null);
  const [completingId, setCompletingId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedApplicationId(params.get("application") ?? "");
  }, []);

  useEffect(() => {
    if (!profile) return;
    return subscribeApplications(profile.id, "client", items => {
      setApplications(items);
      setLoading(false);
    }, () => setLoading(false));
  }, [profile]);

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
    if (!isPayPerTimeline(application.jobPayType)) return Number(application.jobAmount ?? 0);
    return applicationTimelinePay(application).submittedWorkerAmount;
  }

  if (authLoading || !isAuthorized || loading || !profile) return <LoadingSpinner label="Opening completed requests" />;

  const requests = applications.filter(application => application.status === "completion_requested");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/find-work" className="applications-back-button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold">
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </Link>
          <p className="mt-5 text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Posted work</p>
          <h1 className="mt-2 text-3xl font-black text-[#111] dark:text-[#FFFBFF]">Completed requests</h1>
        </div>
      </div>

      {requests.length ? (
        <div className="grid gap-4">
          {requests.map(application => (
            <Card key={application.id} id={`completion-request-${application.id}`} className={`!bg-white !text-[#111] dark:!bg-[#1f2021] dark:!text-[#FFFBFF] ${selectedApplicationId === application.id ? "ring-2 ring-bone" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-[#111] dark:text-[#FFFBFF]">{application.jobTitle ?? "Completed job request"}</h2>
                  <span className="mt-3 inline-flex rounded-full border border-sky-500/40 bg-sky-100 px-3 py-1 text-sm font-black !text-sky-950 dark:bg-sky-400/20 dark:!text-sky-100">Completion requested</span>
                  <p className="mt-3 text-sm font-black text-[#111] dark:text-[#FFFBFF]">{pendingPaymentLabel(application)} · Amount to pay: {kes(pendingPaymentAmount(application))}</p>
                </div>
                <Button type="button" className="temp-success-button" disabled={completingId === application.id} onClick={() => setPendingCompletion(application)}>
                  {completingId === application.id ? "Saving..." : "Confirm complete and pay"}
                </Button>
              </div>
              <div className="mt-5 rounded-xl border border-[#d8d8d8] bg-[#f3f4f5] p-4 dark:border-[#4A463F] dark:bg-[#2A2A2B]">
                <p className="text-lg font-black text-[#111] dark:text-[#FFFBFF]">{application.workerName ?? "Worker"}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#4b453e] dark:text-[#CCC6BB]">
                  <span className="inline-flex items-center gap-1"><Star size={15} /> {application.workerRatingAverage ?? 0}</span>
                  {application.workerEmail && <span className="inline-flex items-center gap-1"><Mail size={15} /> {application.workerEmail}</span>}
                  {application.workerPhoneNumber && <span className="inline-flex items-center gap-1"><Phone size={15} /> {application.workerPhoneNumber}</span>}
                </div>
                {!!application.workerSkills?.length && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {application.workerSkills.map((skill, index) => <span key={`${application.id}-${skill}-${index}`} className="rounded-lg bg-[#11120D] px-3 py-1 text-xs font-bold text-[#D8CFBC]">{skill}</span>)}
                  </div>
                )}
                {application.coverNote && <p className="mt-4 text-sm text-[#959087]">{application.coverNote}</p>}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No completed requests" body="Workers who mark accepted jobs complete will appear here for payment confirmation." />
      )}

      {pendingCompletion && (
        <div className="temp-modal-backdrop fixed inset-0 z-[75] grid place-items-center bg-black/70 p-4">
          <Card className="w-full max-w-md">
            <h3 className="text-2xl font-black text-[#111] dark:text-[#FFFBFF]">Confirm completion and pay worker</h3>
            <p className="mt-2 text-sm text-[#4b453e] dark:text-[#CCC6BB]">
              Confirm only if {pendingCompletion.workerName ?? "the worker"} has finished the work. Pay the worker directly outside the platform, then click below. The job will not be completed until the worker confirms they received the money.
            </p>
            <div className="mt-4 rounded-xl border border-[#d8d8d8] bg-[#f3f4f5] p-4 text-sm text-[#4b453e] dark:border-[#4A463F] dark:bg-[#2A2A2B] dark:text-[#CCC6BB]">
              <p><strong className="text-[#111] dark:text-[#FFFBFF]">Worker:</strong> {pendingCompletion.workerName ?? "Worker"}</p>
              <p className="mt-2"><strong className="text-[#111] dark:text-[#FFFBFF]">Phone:</strong> {pendingCompletion.workerPhoneNumber ?? "No phone provided"}</p>
              <p className="mt-2"><strong className="text-[#111] dark:text-[#FFFBFF]">{pendingPaymentLabel(pendingCompletion)}</strong></p>
              <p className="mt-2"><strong className="text-[#111] dark:text-[#FFFBFF]">Amount to pay:</strong> {kes(pendingPaymentAmount(pendingCompletion))}</p>
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
