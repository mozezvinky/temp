"use client";

import { requireAuth, requireDb } from "@/lib/firebase";
import type { Application, Job, UserProfile } from "@/types";
import { jobSchema } from "@/utils/validation";
import {
  collection,
  getDocs
} from "firebase/firestore";

function timestampMillis(value: unknown) {
  return typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis: () => number }).toMillis()
    : 0;
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

function activeRoleHeaders(userId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  const role = window.sessionStorage.getItem("temp.profile.role") ?? window.localStorage.getItem(`temp.profile.role.${userId}`) ?? "";
  return role === "client" || role === "worker" || role === "admin" ? { "X-Temp-Role": role } : {};
}

function usesOneShotDevFetch() {
  return process.env.NODE_ENV === "development";
}

async function fetchSqlJobs(scope?: "client") {
  if (isOffline()) throw offlineError();
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in to load jobs.");
  const token = await user.getIdToken();
  const response = await fetch(`/api/jobs${scope ? `?scope=${scope}` : ""}`, { headers: { Authorization: `Bearer ${token}`, ...activeRoleHeaders(user.uid) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load jobs.");
  return Array.isArray(payload.jobs) ? (payload.jobs as Job[]).filter(isVisibleJob) : [];
}

async function fetchSqlJob(jobId: string) {
  if (isOffline()) throw offlineError();
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in to load this job.");
  const token = await user.getIdToken();
  const response = await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${token}`, ...activeRoleHeaders(user.uid) } });
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
    if (isOffline()) {
      onError?.(offlineError());
      return;
    }
    inFlight = true;
    try {
      const items = await fetchSqlJobs();
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
  const load = async () => {
    if (stopped || inFlight) return;
    if (isOffline()) {
      onError?.(offlineError());
      return;
    }
    inFlight = true;
    try {
      const items = await fetchSqlJobs("client");
      if (!stopped) callback(sortJobs(items));
      if (!stopped) schedule(60_000);
    } catch (error) {
      if (!stopped) onError?.(error instanceof Error ? error : new Error("Unable to load posted work."));
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
    if (isOffline()) throw offlineError();
    inFlight = true;
    const user = requireAuth().currentUser;
    try {
      if (!user) throw new Error("Please sign in to load applications.");
      const token = await user.getIdToken();
      const response = await fetch(`/api/applications?role=${role}`, {
        headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache", ...activeRoleHeaders(user.uid) },
        cache: "no-store",
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load applications.");
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
        if (!stopped) onError?.(error);
        schedule(error instanceof Error && error.message.includes("RESOURCE_EXHAUSTED") ? 300_000 : 60_000);
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

export async function completeApplication(application: Application) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before marking work done.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId: application.id, action: "complete" })
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

export async function requestApplicationCompletion(application: Application) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before marking work complete.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId: application.id, action: "worker_complete" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to request completion.");
  return payload.application as Application;
}

export async function canWorkerApply(worker: UserProfile) {
  if (worker.isLocked) return { ok: false, reason: "Your account is locked. Open your dashboard for the next step." };
  return { ok: true };
}

export async function applyToJob(job: Job, worker: UserProfile, coverNote: string) {
  const allowed = await canWorkerApply(worker);
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
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before accepting applications.");
  const token = await user.getIdToken(true);
  const response = await fetch("/api/applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId: application.id, action: "accept" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to accept application.");
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
