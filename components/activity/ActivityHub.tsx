"use client";

import { markNotificationRead, subscribeNotifications } from "@/services/notifications";
import { cancelLiveApplication, confirmWorkerPaymentReceived, requestApplicationCompletion, respondDirectHireRequest, subscribeApplications } from "@/services/jobs";
import type { AppNotification, Application, Role } from "@/types";
import { applicationTimelinePay } from "@/utils/application-timeline-pay";
import { isLiveJob, isPendingDirectHireRequest } from "@/utils/activity";
import { perDurationUnit } from "@/utils/duration";
import { jobLocationLabel } from "@/utils/location-display";
import { kes, resolveJobPaymentBreakdown } from "@/utils/money";
import { isPayPerTimeline } from "@/utils/timeline-payments";
import { MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

type ActivityHubProps = {
  userId: string;
  role: Exclude<Role, "admin">;
  pathname?: string;
};

const ACTIVITY_RETREAT_MS = 160;

export function ActivityHub({ userId, role, pathname }: ActivityHubProps) {
  const [open, setOpen] = useState(false);
  const [retreating, setRetreating] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setLoadingApplications(true);
    setError("");
    return subscribeApplications(userId, role, items => {
      setApplications(items);
      setLoadingApplications(false);
      setError("");
    }, error => {
      setLoadingApplications(false);
      setError(error.message);
    });
  }, [role, userId]);

  useEffect(() => {
    setLoadingNotifications(true);
    return subscribeNotifications(userId, items => {
      setNotifications(items);
      setLoadingNotifications(false);
    }, () => {
      setLoadingNotifications(false);
    });
  }, [userId]);

  const pendingRequests = useMemo(() => applications.filter(isPendingDirectHireRequest), [applications]);
  const liveJobs = useMemo(() => applications.filter(isLiveJob), [applications]);
  const unreadNotifications = useMemo(() => notifications.filter(item => !item.read), [notifications]);
  const unreadCount = unreadNotifications.length;
  const isLoading = loadingApplications || loadingNotifications;

  function closeActivity(afterClose?: () => void) {
    if (typeof window === "undefined") {
      setOpen(false);
      afterClose?.();
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setOpen(false);
      setRetreating(false);
      afterClose?.();
      return;
    }
    setRetreating(true);
    window.setTimeout(() => {
      setOpen(false);
      setRetreating(false);
      afterClose?.();
    }, ACTIVITY_RETREAT_MS);
  }

  function openPostedJobsPayment(application: Application) {
    closeActivity(() => {
      const applicationId = encodeURIComponent(application.id);
      if (pathname === "/find-work") {
        window.dispatchEvent(new CustomEvent("copic:open-posted-job-payment", {
          detail: { jobId: application.jobId, applicationId: application.id }
        }));
        return;
      }
      window.location.assign(`/find-work?payApplication=${applicationId}`);
    });
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node) || buttonRef.current?.contains(event.target as Node)) return;
      closeActivity();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeActivity();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || loadingNotifications) return;
    const visibleUnreadIds = unreadNotifications.map(item => item.id);
    if (!visibleUnreadIds.length) return;
    setNotifications(items => items.map(item => visibleUnreadIds.includes(item.id) ? { ...item, read: true } : item));
    visibleUnreadIds.forEach(id => void markNotificationRead(id).catch(() => undefined));
  }, [loadingNotifications, open, unreadNotifications]);

  async function answerRequest(application: Application, response: "accept" | "reject") {
    setApplications(items => response === "accept"
      ? items.map(item => item.id === application.id ? { ...item, status: "accepted", jobStatus: "live" } : item)
      : items.map(item => item.id === application.id ? { ...item, status: "rejected", jobStatus: "cancelled" } : item)
    );
    try {
      const updated = await respondDirectHireRequest(application, response);
      setApplications(items => items.map(item => item.id === application.id ? { ...item, ...updated } : item));
      toast.success(response === "accept" ? "Request accepted. Live job created." : "Request declined.");
    } catch (error) {
      setApplications(items => items.map(item => item.id === application.id ? application : item));
      toast.error(error instanceof Error ? error.message : "Unable to update request.");
    }
  }

  return (
    <div className="copic-activity-hub" data-unread={unreadCount > 0 ? "true" : "false"}>
      <button
        ref={buttonRef}
        type="button"
        className={`copic-activity-button ${unreadCount > 0 ? "has-unread" : ""}`}
        aria-label={unreadCount > 0 ? `Open activity, ${unreadCount} unread notifications` : "Open activity"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        {unreadCount > 0 && <span className="copic-activity-badge" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        <span aria-hidden="true">•••</span>
      </button>

      {open && (
        <div ref={panelRef} className={`copic-activity-panel ${retreating ? "is-retreating" : ""}`} role="dialog" aria-modal="false" aria-label="Activity">
          <div className="copic-activity-panel-head">
            <div>
              <p>Activity</p>
              <h2>{role === "client" ? "Client Center" : "Worker Center"}</h2>
            </div>
            <button type="button" onClick={() => closeActivity()} aria-label="Close activity"><X size={18} /></button>
          </div>

          <div className="copic-activity-tabs" role="tablist" aria-label="Activity summary">
            <span className={pendingRequests.length > 0 ? "is-active" : ""}>Requests ({pendingRequests.length})</span>
            <span className={liveJobs.length > 0 ? "is-active" : ""}>Live ({liveJobs.length})</span>
          </div>

          {isLoading ? <p className="copic-activity-empty">Loading activity...</p> : error ? (
            <div className="copic-activity-empty">
              <p>Activity could not refresh.</p>
              <button type="button" onClick={() => window.dispatchEvent(new Event("copic:applications-changed"))}>Retry</button>
            </div>
          ) : pendingRequests.length === 0 && liveJobs.length === 0 ? (
            <p className="copic-activity-empty">No active requests or jobs.</p>
          ) : (
            <div className="copic-activity-content">
              <ActivitySection title={role === "client" ? "Sent Requests" : "Received Requests"} items={pendingRequests}>
                {pendingRequests.map(application => (
                  <RequestCard key={application.id} application={application} role={role} onAnswer={answerRequest} />
                ))}
              </ActivitySection>
              <ActivitySection title="Live Jobs" items={liveJobs}>
                {liveJobs.map(application => (
                  <LiveJobCard key={application.id} application={application} role={role} onConfirmPay={openPostedJobsPayment} onChanged={updated => {
                    setApplications(items => items.map(item => item.id === application.id ? { ...item, ...updated } : item));
                  }} onOpen={() => closeActivity()} />
                ))}
              </ActivitySection>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivitySection({ title, items, children }: { title: string; items: Application[]; children: ReactNode }) {
  if (!items.length) return null;
  return (
    <section className="copic-activity-section">
      <h3>{title}</h3>
      <div className="copic-activity-card-list">{children}</div>
    </section>
  );
}

function RequestCard({ application, role, onAnswer }: { application: Application; role: Exclude<Role, "admin">; onAnswer: (application: Application, response: "accept" | "reject") => Promise<void> }) {
  const counterpartName = role === "client" ? application.workerName ?? "Worker" : application.clientName ?? "Client";
  return (
    <article className="copic-activity-card">
      <ProfileLine name={counterpartName} photoURL={role === "client" ? application.workerPhotoURL : application.clientPhotoURL} />
      <p className="copic-activity-title">{application.requestSkillName ?? application.jobTitle ?? "Direct hire request"}</p>
      <p className="copic-activity-meta">Status: Pending</p>
      {application.requestStartDate && <p className="copic-activity-meta">Sent: {application.requestStartDate}</p>}
      {role === "worker" && (
        <div className="copic-activity-detail">
          {Number(application.jobAmount ?? 0) > 0 && <p>Pay: {kes(Number(application.jobAmount))}</p>}
          <p>Location: {requestLocation(application)}</p>
          {application.requestDescription && <p>{application.requestDescription}</p>}
        </div>
      )}
      {role === "worker" && (
        <div className="copic-activity-actions">
          <button type="button" onClick={() => void onAnswer(application, "accept")}>Accept</button>
          <button type="button" onClick={() => void onAnswer(application, "reject")}>Decline</button>
        </div>
      )}
    </article>
  );
}

function LiveJobCard({ application, role, onConfirmPay, onChanged, onOpen }: { application: Application; role: Exclude<Role, "admin">; onConfirmPay: (application: Application) => void; onChanged: (application: Application) => void; onOpen: () => void }) {
  const [busyAction, setBusyAction] = useState("");
  const [pendingWorkerTimeline, setPendingWorkerTimeline] = useState<Application | null>(null);
  const [pendingWorkerCancel, setPendingWorkerCancel] = useState<Application | null>(null);
  const counterpartName = role === "client" ? application.workerName ?? "Worker" : application.clientName ?? "Client";
  const chatHref = `/chat?conversation=${encodeURIComponent(`${application.jobId}_${application.workerId}`)}`;
  const timelinePay = applicationTimelinePay(application);
  const unit = perDurationUnit(application.jobDurationUnit);
  const unitTitle = unit.charAt(0).toUpperCase() + unit.slice(1);
  const fixedPay = resolveJobPaymentBreakdown(application);

  async function workerMarkComplete(target: Application, timelineCount?: number) {
    setBusyAction(`worker-complete-${target.id}`);
    try {
      const updated = await requestApplicationCompletion(target, timelineCount);
      onChanged({ ...target, ...updated });
      toast.success("Completion sent to the client for confirmation.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to mark work complete.");
    } finally {
      setBusyAction("");
    }
  }

  async function workerCancel(target: Application) {
    setBusyAction(`worker-cancel-${target.id}`);
    try {
      const updated = await cancelLiveApplication(target);
      onChanged({ ...target, ...updated });
      toast.success("Live job cancelled with no pay.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel live job.");
    } finally {
      setBusyAction("");
    }
  }

  async function workerConfirmPayment(target: Application) {
    setBusyAction(`worker-payment-${target.id}`);
    try {
      const updated = await confirmWorkerPaymentReceived(target);
      onChanged({ ...target, ...updated });
      const fee = Number((updated as Application & { outstandingServiceFee?: number }).outstandingServiceFee ?? 0);
      if (fee > 0 && typeof window !== "undefined") window.sessionStorage.setItem("temp.forceServiceFee", String(fee));
      toast.success("Payment received confirmed. Your account is now locked until the service fee is paid.");
      window.location.assign("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to confirm payment received.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <article className="copic-activity-card copic-activity-live-card">
      <ProfileLine name={counterpartName} photoURL={role === "client" ? application.workerPhotoURL : application.clientPhotoURL} />
      <p className="copic-activity-title">{application.jobTitle ?? "Live job"}</p>
      <p className="copic-activity-meta">Status: {liveStatusLabel(application)}</p>
      {role === "worker" && isPayPerTimeline(application.jobPayType) && (
        <div className="copic-activity-detail">
          <p>{unitTitle} payments: {timelinePay.paidTimelineCount}/{timelinePay.timelineCount} paid</p>
          <p>Remaining worker amount: {kes(timelinePay.remainingWorkerAmount)}</p>
        </div>
      )}
      {role === "client" && Number(application.jobAmount ?? 0) > 0 && (
        <div className="copic-activity-detail">
          <p>Worker payment: {kes(pendingPaymentAmount(application))}</p>
        </div>
      )}
      {role === "worker" && !isPayPerTimeline(application.jobPayType) && Number(application.jobAmount ?? 0) > 0 && (
        <div className="copic-activity-detail">
          <p>You should receive: {kes(fixedPay.total)}</p>
          <p>Your earnings: {kes(fixedPay.workerEarnings)}</p>
          <p>COPIC fee: {kes(fixedPay.serviceFee)}</p>
        </div>
      )}
      <div className="copic-activity-actions">
        <Link href={chatHref} aria-label="Open chat" onClick={onOpen} className="copic-activity-icon-action">
          <MessageCircle size={17} aria-hidden="true" />
          <span>Chat</span>
        </Link>
        {role === "client" && application.status === "completion_requested" && (
          <button type="button" className="copic-activity-success-action" onClick={() => onConfirmPay(application)}>
            Confirm & Pay
          </button>
        )}
        {role === "client" && application.status === "accepted" && (
          <span className="copic-activity-state-note">Worker must mark complete first</span>
        )}
        {role === "client" && application.status === "payment_sent" && (
          <span className="copic-activity-state-note">Waiting for worker payment confirmation</span>
        )}
        {role === "worker" && application.status === "accepted" && (
          <>
            <button type="button" disabled={busyAction === `worker-complete-${application.id}`} onClick={() => isPayPerTimeline(application.jobPayType) ? setPendingWorkerTimeline(application) : void workerMarkComplete(application)}>
              {busyAction === `worker-complete-${application.id}` ? "Sending..." : isPayPerTimeline(application.jobPayType) ? `Mark ${unit} complete` : "Mark Complete"}
            </button>
            <button type="button" className="copic-activity-danger-action" disabled={busyAction === `worker-cancel-${application.id}`} onClick={() => setPendingWorkerCancel(application)}>
              {busyAction === `worker-cancel-${application.id}` ? "Cancelling..." : "Cancel"}
            </button>
          </>
        )}
        {role === "worker" && application.status === "completion_requested" && (
          <span className="copic-activity-state-note">Waiting for client confirmation/payment</span>
        )}
        {role === "worker" && application.status === "payment_sent" && (
          <button type="button" className="copic-activity-success-action" disabled={busyAction === `worker-payment-${application.id}`} onClick={() => void workerConfirmPayment(application)}>
            {busyAction === `worker-payment-${application.id}` ? "Confirming..." : "I Received Payment"}
          </button>
        )}
      </div>
      {pendingWorkerCancel && <ConfirmModal title="Cancel live job?" body="If you cancel after accepting, the job will be cancelled with no pay." busy={busyAction === `worker-cancel-${pendingWorkerCancel.id}`} cancelLabel="Keep job" confirmLabel="Yes, cancel" onClose={() => setPendingWorkerCancel(null)} onConfirm={() => {
        const target = pendingWorkerCancel;
        setPendingWorkerCancel(null);
        void workerCancel(target);
      }} />}
      {pendingWorkerTimeline && <WorkerTimelineModal application={pendingWorkerTimeline} busy={busyAction === `worker-complete-${pendingWorkerTimeline.id}`} onClose={() => setPendingWorkerTimeline(null)} onSubmit={count => {
        const target = pendingWorkerTimeline;
        setPendingWorkerTimeline(null);
        void workerMarkComplete(target, count);
      }} />}
    </article>
  );
}

function WorkerTimelineModal({ application, busy, onClose, onSubmit }: { application: Application; busy: boolean; onClose: () => void; onSubmit: (timelineCount: number) => void }) {
  const timelinePay = applicationTimelinePay(application);
  const unit = perDurationUnit(application.jobDurationUnit);
  const submittedCount = Math.max(0, Number(application.submittedTimelineCount ?? 0));
  const maxCount = Math.max(1, timelinePay.timelineCount - timelinePay.paidTimelineCount - submittedCount);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const count = Math.max(1, Math.min(maxCount, Math.trunc(Number(form.get("timelineCount")) || 1)));
    onSubmit(count);
  }

  return (
    <div className="copic-activity-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="copic-activity-modal" role="dialog" aria-modal="true" aria-label={`Mark ${unit}s complete`}>
        <h3>Mark {unit}s complete</h3>
        <p>Choose how many {unit}s you finished. The client will pay only the submitted {unit}s.</p>
        <form onSubmit={submit} className="copic-activity-modal-form">
          <label>{unit.charAt(0).toUpperCase() + unit.slice(1)}s to mark complete
            <input name="timelineCount" type="number" min={1} max={maxCount} defaultValue={1} />
          </label>
          <p className="copic-activity-state-note">Available now: {maxCount} of {timelinePay.timelineCount} {unit}s.</p>
          <div className="copic-activity-modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={busy}>{busy ? "Sending..." : `Submit ${unit}s`}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({ title, body, busy, cancelLabel, confirmLabel, onClose, onConfirm }: { title: string; body: string; busy: boolean; cancelLabel: string; confirmLabel: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="copic-activity-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="copic-activity-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="copic-activity-modal-actions">
          <button type="button" onClick={onClose}>{cancelLabel}</button>
          <button type="button" className="copic-activity-danger-action" disabled={busy} onClick={onConfirm}>{busy ? "Working..." : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function pendingPaymentAmount(application: Application) {
  if (!isPayPerTimeline(application.jobPayType)) return resolveJobPaymentBreakdown(application).clientTotal;
  return applicationTimelinePay(application).submittedWorkerAmount;
}

function liveStatusLabel(application: Application) {
  if (application.status === "accepted") return "Ongoing job";
  if (application.status === "completion_requested") return "Completion requested";
  if (application.status === "payment_sent") return "Payment sent";
  return application.status.replace("_", " ");
}

function ProfileLine({ name, photoURL }: { name: string; photoURL?: string }) {
  return (
    <div className="copic-activity-profile">
      <span>{photoURL ? <img src={photoURL} alt="" /> : name.charAt(0).toUpperCase()}</span>
      <strong>{name}</strong>
    </div>
  );
}

function requestLocation(application: Application) {
  return jobLocationLabel({
    location: application.requestLocation ?? "",
    county: application.requestLocationDetails?.county ?? "",
    locationDetails: application.requestLocationDetails
  });
}
