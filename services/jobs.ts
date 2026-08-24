"use client";

import { requireAuth, requireDb } from "@/lib/firebase";
import type { Application, Job, UserProfile } from "@/types";
import { workerCanApplyToJob } from "@/utils/jobRules";
import { jobSchema } from "@/utils/validation";
import {
  collection,
  getDocs
} from "firebase/firestore";

function timestampMillis(value: unknown) {
  if (typeof value === "string") return Date.parse(value) || 0;
  if (typeof value !== "object" || !value) return 0;
  if ("toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if ("seconds" in value && typeof (value as { seconds?: unknown }).seconds === "number") return Number((value as { seconds: number }).seconds) * 1000;
  if ("_seconds" in value && typeof (value as { _seconds?: unknown })._seconds === "number") return Number((value as { _seconds: number })._seconds) * 1000;
  return 0;
}

function sortJobs(items: Job[]) {
  return [...items].sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
}

function isVisibleJob(item: Job) {
  return !item.rehireOfJobId;
}

function isVisibleApplication(item: Application) {
  return item.coverNote !== "Rehire request";
}

function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

function offlineError() {
  return new Error("offline");
}

function quotaPausedUntil() {
  if (typeof window === "undefined") return 0;
  if (process.env.NEXT_PUBLIC_DATA_BACKEND === "local-sqlite") {
    window.localStorage.removeItem("temp.dataQuotaPausedUntil");
    return 0;
  }
  return Number(window.localStorage.getItem("temp.dataQuotaPausedUntil") ?? 0);
}

function isQuotaMessage(message: string) {
  return message.includes("RESOURCE_EXHAUSTED") || message.includes("Quota exceeded") || message.includes("quota-paused");
}

function pauseForQuota() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("temp.dataQuotaPausedUntil", String(Date.now() + 300_000));
}

function quotaError() {
  return new Error("Firestore quota is exhausted right now. Please wait a few minutes before trying again.");
}

function activeRoleHeaders(userId: string, preferredRole?: "client" | "worker" | "admin"): Record<string, string> {
  if (typeof window === "undefined") return {};
  if (preferredRole) return { "X-Temp-Role": preferredRole };
  const role = window.sessionStorage.getItem("temp.profile.role") ?? window.localStorage.getItem(`temp.profile.role.${userId}`) ?? "";
  return role === "client" || role === "worker" || role === "admin" ? { "X-Temp-Role": role } : {};
}

function usesOneShotDevFetch() {
  return process.env.NODE_ENV === "development";
}

async function fetchSqlJobs(scope?: "client" | "worker-active") {
  if (isOffline()) throw offlineError();
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in to load jobs.");
  const token = await user.getIdToken();
  const preferredRole = scope === "client" ? "client" : "worker";
  const response = await fetch(`/api/jobs${scope ? `?scope=${scope}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache", ...activeRoleHeaders(user.uid, preferredRole) },
    cache: "no-store",
    credentials: "same-origin"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load jobs.");
  return Array.isArray(payload.jobs) ? (payload.jobs as Job[]).filter(isVisibleJob) : [];
}

async function fetchSqlJob(jobId: string) {
  if (isOffline()) throw offlineError();
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in to load this job.");
  const token = await user.getIdToken();
  const response = await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache", ...activeRoleHeaders(user.uid) },
    cache: "no-store",
    credentials: "same-origin"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load this job.");
  const job = (payload.job ?? null) as Job | null;
  return job && isVisibleJob(job) ? job : null;
}

export function subscribeOpenJobs(callback: (jobs: Job[]) => void, onError?: (error: Error) => void) {
  let stopped = false;
  let inFlight = false;
  let timeoutId: number | null = null;
  const load = async () => {
    if (stopped || inFlight) return;
    if (Date.now() < quotaPausedUntil()) return;
    if (isOffline()) {
      onError?.(offlineError());
      return;
    }
    inFlight = true;
    try {
      const [openItems, activeItems] = await Promise.all([fetchSqlJobs(), fetchSqlJobs("worker-active")]);
      const items = [...openItems, ...activeItems].filter((job, index, all) => all.findIndex(item => item.id === job.id) === index);
      if (!stopped) callback(sortJobs(items));
      if (!stopped) schedule(60_000);
    } catch (error) {
      if (!stopped) onError?.(error instanceof Error ? error : new Error("Unable to load jobs."));
    } finally {
      inFlight = false;
    }
  };
  const schedule = (delay: number) => {
    if (stopped) return;
    if (usesOneShotDevFetch()) return;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(load, delay);
  };
  void load();
  if (usesOneShotDevFetch()) return () => {
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
  const resume = () => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    void load();
  };
  window.addEventListener("online", resume);
  window.addEventListener("offline", resume);
  return () => {
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    window.removeEventListener("online", resume);
    window.removeEventListener("offline", resume);
  };
}

export function subscribeClientJobs(clientId: string, callback: (jobs: Job[]) => void, onError?: (error: Error) => void) {
  void clientId;
  let stopped = false;
  let inFlight = false;
  let timeoutId: number | null = null;
  const storageKey = `temp.clientJobs.${clientId}`;
  try {
    const cached = window.sessionStorage.getItem(storageKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) callback(sortJobs((parsed as Job[]).filter(isVisibleJob)));
    }
  } catch {
    window.sessionStorage.removeItem(storageKey);
  }
  const load = async () => {
    if (stopped || inFlight) return;
    if (isOffline()) {
      onError?.(offlineError());
      return;
    }
    inFlight = true;
    try {
      const items = await fetchSqlJobs("client");
      if (!stopped) {
        const sorted = sortJobs(items);
        callback(sorted);
        try { window.sessionStorage.setItem(storageKey, JSON.stringify(sorted)); } catch { /* Storage is optional. */ }
      }
      if (!stopped) schedule(60_000);
    } catch (error) {
      const quotaLimited = error instanceof Error && isQuotaMessage(error.message);
      if (quotaLimited) pauseForQuota();
      if (!stopped && !quotaLimited) onError?.(error instanceof Error ? error : new Error("Unable to load posted work."));
      if (!stopped) schedule(quotaLimited ? 300_000 : 60_000);
    } finally {
      inFlight = false;
    }
  };
  const schedule = (delay: number) => {
    if (stopped) return;
    if (usesOneShotDevFetch()) return;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(load, delay);
  };
  void load();
  if (usesOneShotDevFetch()) return () => {
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
  const resume = () => {
    if (Date.now() < quotaPausedUntil()) return;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    void load();
  };
  const refreshPostedWork = () => resume();
  window.addEventListener("online", resume);
  window.addEventListener("offline", resume);
  window.addEventListener("temp:jobs-changed", refreshPostedWork);
  return () => {
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    window.removeEventListener("online", resume);
    window.removeEventListener("offline", resume);
    window.removeEventListener("temp:jobs-changed", refreshPostedWork);
  };
}

export function subscribeJob(jobId: string, callback: (job: Job | null) => void, onError?: (error: Error) => void) {
  let stopped = false;
  let inFlight = false;
  let timeoutId: number | null = null;
  const load = async () => {
    if (stopped || inFlight) return;
    if (isOffline()) {
      onError?.(offlineError());
      return;
    }
    inFlight = true;
    try {
      const item = await fetchSqlJob(jobId);
      if (!stopped) callback(item);
      if (!stopped) schedule(60_000);
    } catch (error) {
      if (!stopped) onError?.(error instanceof Error ? error : new Error("Unable to load this job."));
    } finally {
      inFlight = false;
    }
  };
  const schedule = (delay: number) => {
    if (stopped) return;
    if (usesOneShotDevFetch()) return;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(load, delay);
  };
  void load();
  if (usesOneShotDevFetch()) return () => {
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
  const resume = () => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    void load();
  };
  window.addEventListener("online", resume);
  window.addEventListener("offline", resume);
  return () => {
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    window.removeEventListener("online", resume);
    window.removeEventListener("offline", resume);
  };
}

export function subscribeApplications(userId: string, role: "client" | "worker", callback: (items: Application[]) => void, onError?: (error: Error) => void) {
  let stopped = false;
  let inFlight = false;
  let timeoutId: number | null = null;
  const storageKey = `temp.applications.${userId}.${role}`;

  try {
    const cached = window.sessionStorage.getItem(storageKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) callback((parsed as Application[]).filter(isVisibleApplication));
    }
  } catch {
    window.sessionStorage.removeItem(storageKey);
  }

  const load = async () => {
    if (inFlight || stopped) return;
    if (Date.now() < quotaPausedUntil()) return;
    if (isOffline()) throw offlineError();
    inFlight = true;
    const user = requireAuth().currentUser;
    try {
      if (!user) throw new Error("Please sign in to load applications.");
      const token = await user.getIdToken();
      const response = await fetch(`/api/applications?role=${role}`, {
        headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache", ...activeRoleHeaders(user.uid, role) },
        cache: "no-store",
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load applications.");
      if (payload.degraded && payload.reason === "quota") {
        pauseForQuota();
        return;
      }
      const items = Array.isArray(payload.applications) ? (payload.applications as Application[]).filter(isVisibleApplication) : [];
      if (!stopped) {
        callback(items);
        try { window.sessionStorage.setItem(storageKey, JSON.stringify(items)); } catch { /* Storage is optional. */ }
      }
    } finally {
      inFlight = false;
    }
  };

  const schedule = (delay: number) => {
    if (stopped) return;
    if (usesOneShotDevFetch()) return;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(run, delay);
  };
  const run = () => {
    if (isOffline()) {
      if (!stopped) onError?.(offlineError());
      return;
    }
    void load()
      .then(() => schedule(60_000))
      .catch(error => {
        const quotaLimited = error instanceof Error && isQuotaMessage(error.message);
        if (quotaLimited) pauseForQuota();
        if (!stopped && !quotaLimited) onError?.(error);
        schedule(quotaLimited ? 300_000 : 60_000);
      });
  };
  const refreshWhenActive = () => {
    if (document.visibilityState === "visible") {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      run();
    }
  };

  run();
  if (usesOneShotDevFetch()) return () => {
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
  window.addEventListener("focus", refreshWhenActive);
  window.addEventListener("online", refreshWhenActive);
  window.addEventListener("offline", run);
  document.addEventListener("visibilitychange", refreshWhenActive);
  return () => {
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    window.removeEventListener("focus", refreshWhenActive);
    window.removeEventListener("online", refreshWhenActive);
    window.removeEventListener("offline", run);
    document.removeEventListener("visibilitychange", refreshWhenActive);
  };
}

export async function createJob(clientId: string, input: unknown) {
  const auth = requireAuth();
  if (!auth.currentUser || auth.currentUser.uid !== clientId) throw new Error("Please sign in before posting work.");
  const validated = jobSchema.safeParse(input);
  if (!validated.success) throw new Error(validated.error.issues[0]?.message ?? "Please check the job details.");
  const token = await auth.currentUser.getIdToken(true);
  const response = await fetch("/api/jobs/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(validated.data)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Unable to post work right now.");
  }
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("temp.dataQuotaPausedUntil");
    window.dispatchEvent(new CustomEvent("temp:jobs-changed"));
  }
  return { id: String(payload.jobId) };
}

export async function updateJob(jobId: string, input: Partial<Pick<Job, "title" | "description" | "category" | "payAmount" | "payType" | "duration" | "durationValue" | "durationUnit" | "durationHours" | "workersNeeded" | "quantity" | "unit" | "customUnit" | "paymentMethod" | "status">>) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before editing posted work.");
  const token = await user.getIdToken(true);
  const response = await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Unable to edit posted work.");
  }
  return payload.job as Job;
}

export async function deleteJob(jobId: string) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before deleting posted work.");
  const token = await user.getIdToken(true);
  const response = await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Unable to delete posted work.");
  }
  return true;
}

export async function completeJob(jobId: string) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before marking work done.");
  const token = await user.getIdToken(true);
  const response = await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "complete" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to mark job done.");
  return payload.job as Job;
}

export async function cancelRemainingPeriods(jobId: string) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before cancelling future periods.");
  const response = await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken(true)}` },
    body: JSON.stringify({ action: "cancel_remaining" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to cancel future periods.");
  return payload.job as Job;
}

export async function cancelNextPeriod(jobId: string) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before cancelling a future period.");
  const response = await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken(true)}` },
    body: JSON.stringify({ action: "cancel_next_period" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to cancel the future month.");
  return payload.job as Job;
}

export async function completeApplication(application: Application, timelineIds?: string[]) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before marking work done.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId: application.id, action: "complete", timelineIds })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to mark this worker paid.");
  return payload.application as Application;
}

export async function confirmWorkerPaymentReceived(application: Application) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before confirming payment.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId: application.id, action: "worker_confirm_payment" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to confirm payment received.");
  return payload.application as Application;
}

export async function requestApplicationCompletion(application: Application, timelineCount?: number) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before marking work complete.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId: application.id, action: "worker_complete", timelineCount })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to request completion.");
  return payload.application as Application;
}

export async function canWorkerApply(worker: UserProfile) {
  if (worker.isLocked || Number(worker.outstandingServiceFee ?? 0) > 0) return { ok: false, reason: worker.lockReason ?? "Your account is locked. Open your dashboard for the next step." };
  if (worker.verificationStatus !== "approved") return { ok: false, reason: "Verify your identity before applying for or doing jobs." };
  return { ok: true };
}

export async function applyToJob(job: Job, worker: UserProfile, coverNote: string) {
  const allowed = workerCanApplyToJob(worker, job);
  if (!allowed.ok) throw new Error(allowed.reason);
  if (job.clientId === worker.id) throw new Error("You cannot apply to a job you posted as a client.");
  if (job.status !== "open") throw new Error("This job is no longer accepting applications.");
  const user = requireAuth().currentUser;
  if (!user || user.uid !== worker.id) throw new Error("Please sign in again before applying.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jobId: job.id, coverNote })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to submit application.");
}

export async function acceptApplication(application: Application) {
  if (Date.now() < quotaPausedUntil()) throw quotaError();
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before accepting applications.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId: application.id, action: "accept" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Unable to accept application.";
    if (response.status === 503 || isQuotaMessage(message)) {
      pauseForQuota();
      throw quotaError();
    }
    throw new Error(message);
  }
  return payload.application as Application;
}

export async function cancelApplication(application: Application) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before cancelling applications.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId: application.id, action: "cancel" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to cancel application.");
  return payload.application as Application;
}

export async function cancelLiveApplication(application: Application) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before cancelling live jobs.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId: application.id, action: "worker_cancel_live" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to cancel live job.");
  return payload.application as Application;
}

export async function sendDirectHireRequest(input: {
  workerId: string;
  title: string;
  category: string;
  payAmount: number;
  location: string;
  startDate: string;
  duration: string;
  description?: string;
}) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before sending hire requests.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/hire-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to send hire request.");
  return payload.request as Application;
}

export async function respondDirectHireRequest(application: Application, responseValue: "accept" | "reject") {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before updating hire requests.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/hire-requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId: application.id, response: responseValue })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to update hire request.");
  return payload.request as Application;
}

export async function savedJobs(userId: string) {
  const db = requireDb();
  const snap = await getDocs(collection(db, "users", userId, "savedJobs"));
  return snap.docs.map(d => d.id);
}
