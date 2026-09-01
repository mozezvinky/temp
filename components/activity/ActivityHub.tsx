"use client";

import { markNotificationRead, subscribeNotifications } from "@/services/notifications";
import { respondDirectHireRequest, subscribeApplications } from "@/services/jobs";
import type { AppNotification, Application, Role } from "@/types";
import { isLiveJob, isPendingDirectHireRequest } from "@/utils/activity";
import { jobLocationLabel } from "@/utils/location-display";
import { kes } from "@/utils/money";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

type ActivityHubProps = {
  userId: string;
  role: Exclude<Role, "admin">;
};

export function ActivityHub({ userId, role }: ActivityHubProps) {
  const [open, setOpen] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [error, setError] = useState("");
  const [viewedNotificationIds, setViewedNotificationIds] = useState<string[]>([]);
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
  const panelNotifications = useMemo(() => {
    const keepVisible = new Set(viewedNotificationIds);
    return notifications.filter(item => !item.read || keepVisible.has(item.id)).slice(0, 8);
  }, [notifications, viewedNotificationIds]);
  const unreadCount = unreadNotifications.length;
  const isLoading = loadingApplications || loadingNotifications;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node) || buttonRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
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
    setViewedNotificationIds(ids => [...new Set([...ids, ...visibleUnreadIds])]);
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
        <div ref={panelRef} className="copic-activity-panel" role="dialog" aria-modal="false" aria-label="Activity">
          <div className="copic-activity-panel-head">
            <div>
              <p>Activity</p>
              <h2>{role === "client" ? "Client center" : "Worker center"}</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close activity"><X size={18} /></button>
          </div>

          <div className="copic-activity-tabs" role="tablist" aria-label="Activity summary">
            <span>Requests ({pendingRequests.length})</span>
            <span>Live ({liveJobs.length})</span>
            <span>Alerts ({unreadCount})</span>
          </div>

          {isLoading ? <p className="copic-activity-empty">Loading activity...</p> : error ? (
            <div className="copic-activity-empty">
              <p>Activity could not refresh.</p>
              <button type="button" onClick={() => window.dispatchEvent(new Event("copic:applications-changed"))}>Retry</button>
            </div>
          ) : pendingRequests.length === 0 && liveJobs.length === 0 && panelNotifications.length === 0 ? (
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
                  <LiveJobCard key={application.id} application={application} role={role} onOpen={() => setOpen(false)} />
                ))}
              </ActivitySection>
              <NotificationSection notifications={panelNotifications} onOpen={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationSection({ notifications, onOpen }: { notifications: AppNotification[]; onOpen: () => void }) {
  if (!notifications.length) return null;
  return (
    <section className="copic-activity-section">
      <h3>Notifications</h3>
      <div className="copic-activity-card-list">
        {notifications.map(notification => {
          const content = (
            <>
              <p className="copic-activity-title">{notification.title}</p>
              <p className="copic-activity-meta">{notification.body}</p>
            </>
          );
          return notification.href ? (
            <Link key={notification.id} href={notification.href} className="copic-activity-card" onClick={onOpen}>{content}</Link>
          ) : (
            <article key={notification.id} className="copic-activity-card">{content}</article>
          );
        })}
      </div>
    </section>
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

function LiveJobCard({ application, role, onOpen }: { application: Application; role: Exclude<Role, "admin">; onOpen: () => void }) {
  const href = role === "worker" ? `/applications?status=live&application=${application.id}` : `/applications?status=live&application=${application.id}`;
  const counterpartName = role === "client" ? application.workerName ?? "Worker" : application.clientName ?? "Client";
  return (
    <Link href={href} className="copic-activity-card copic-activity-live-card" onClick={onOpen}>
      <ProfileLine name={counterpartName} photoURL={role === "client" ? application.workerPhotoURL : application.clientPhotoURL} />
      <p className="copic-activity-title">{application.jobTitle ?? "Live job"}</p>
      <p className="copic-activity-meta">Status: {application.status.replace("_", " ")}</p>
      <p className="copic-activity-meta">Open live job</p>
    </Link>
  );
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
