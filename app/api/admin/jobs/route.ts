import { adminErrorStatus, requireAdmin, writeAdminAuditLog } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { adminDb } from "@/lib/firebase-admin";
import { localDb } from "@/lib/local-sql";
import { notifyUser } from "@/lib/notifications-server";
import type { JobStatus } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type AdminTimelineRecord = Record<string, unknown> & {
  id: string;
  jobId?: string;
  workerId?: string;
  timelineNumber?: number;
  status?: string;
};

function dateMillis(value: unknown) {
  if (typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "jobs:write");
    if (isSqlBackend()) {
      const jobs = localDb().prepare(`
        SELECT jobs.*,
          (SELECT COUNT(*) FROM job_timelines WHERE job_timelines.jobId = jobs.id AND job_timelines.status = 'paid') as paidTimelineCount,
          (SELECT COUNT(*) FROM job_timelines WHERE job_timelines.jobId = jobs.id AND job_timelines.status != 'paid') as unpaidTimelineCount,
          (SELECT COUNT(*) FROM job_timelines WHERE job_timelines.jobId = jobs.id AND job_timelines.status = 'submitted') as submittedTimelineCount
        FROM jobs
        ORDER BY createdAt DESC
        LIMIT 120
      `).all();
      const applications = localDb().prepare("SELECT * FROM applications ORDER BY createdAt DESC LIMIT 500").all();
      const unpaidTimelines = localDb().prepare(`
        SELECT job_timelines.*, applications.workerName, applications.jobTitle, users.displayName as workerUsername, users.email as workerEmail
        FROM job_timelines
        LEFT JOIN applications ON applications.id = job_timelines.applicationId
        LEFT JOIN users ON users.uid = job_timelines.workerId
        WHERE job_timelines.status IN ('submitted', 'approved')
        ORDER BY job_timelines.updatedAt DESC
      `).all();
      const jobsWithTimelines = jobs.map(job => ({
        ...job,
        unpaidCompletedTimelines: unpaidTimelines.filter(timeline => timeline.jobId === job.id)
      }));
      return NextResponse.json({ jobs: jobsWithTimelines, applications });
    }
    const [jobSnapshot, applicationSnapshot, timelineSnapshot] = await Promise.all([
      adminDb().collection("jobs").limit(150).get(),
      adminDb().collection("applications").limit(500).get(),
      adminDb().collection("jobTimelines").limit(1000).get()
    ]);
    const timelines = timelineSnapshot.docs.map<AdminTimelineRecord>(doc => ({ id: doc.id, ...doc.data() }));
    const workerIds = [...new Set(timelines.map(item => String(item.workerId ?? "")).filter(Boolean))];
    const workerSnaps = await Promise.all(workerIds.map(id => adminDb().collection("users").doc(id).get()));
    const workers = new Map(workerSnaps.map(snap => [snap.id, snap.data() ?? {}]));
    const jobs = jobSnapshot.docs
      .map<Record<string, unknown>>(doc => {
        const data = { id: doc.id, ...doc.data() };
        const related = timelines.filter(item => item.jobId === doc.id);
        const unpaidCompletedTimelines = related
          .filter(item => item.status === "submitted" || item.status === "approved")
          .map(item => {
            const worker = workers.get(String(item.workerId ?? ""));
            return {
              ...item,
              workerUsername: worker?.displayName ?? worker?.email ?? item.workerId
            };
          });
        return {
          ...data,
          paidTimelineCount: related.filter(item => item.status === "paid").length,
          unpaidTimelineCount: related.filter(item => item.status !== "paid").length,
          submittedTimelineCount: related.filter(item => item.status === "submitted").length,
          unpaidCompletedTimelines
        };
      })
      .sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt))
      .slice(0, 120);
    const applications = applicationSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ jobs, applications });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load admin jobs." }, { status: adminErrorStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, "jobs:write");
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "update");
    if (action === "send_payment_wall") return sendPaymentWall(request, admin, body);
    const jobId = String(body.jobId ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    if (!jobId) return NextResponse.json({ error: "Choose a job to update." }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Add a reason for the audit log." }, { status: 400 });
    const patch = normalizeJobPatch(body.patch);
    if (!Object.keys(patch).length) return NextResponse.json({ error: "No job fields were provided." }, { status: 400 });

    const oldValue = isSqlBackend()
      ? localDb().prepare("SELECT * FROM jobs WHERE id = ?").get(jobId)
      : await adminDb().collection("jobs").doc(jobId).get().then(snapshot => snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as Record<string, unknown>) : null);
    if (!oldValue) return NextResponse.json({ error: "Job was not found." }, { status: 404 });

    if (isSqlBackend()) {
      const now = new Date().toISOString();
      const allowed = Object.entries(patch);
      for (const [key, value] of allowed) {
        localDb().prepare(`UPDATE jobs SET ${key} = ?, updatedAt = ? WHERE id = ?`).run(value == null ? null : value as string | number, now, jobId);
      }
    } else {
      await adminDb().collection("jobs").doc(jobId).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await writeAdminAuditLog(request, { admin, targetUserId: String(oldValue.clientId ?? ""), actionType: "job.admin_update", oldValue, newValue: patch, reason });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update this job." }, { status: adminErrorStatus(error) });
  }
}

async function sendPaymentWall(request: NextRequest, admin: Awaited<ReturnType<typeof requireAdmin>>, body: Record<string, unknown>) {
  const timelineId = String(body.timelineId ?? "").trim();
  if (!timelineId) return NextResponse.json({ error: "Choose a completed timeline to send." }, { status: 400 });
  const reason = String(body.reason ?? "Admin sent client payment wall.").trim() || "Admin sent client payment wall.";
  if (isSqlBackend()) {
    const timeline = localDb().prepare("SELECT * FROM job_timelines WHERE id = ?").get(timelineId);
    if (!timeline) return NextResponse.json({ error: "Timeline was not found." }, { status: 404 });
    const job = localDb().prepare("SELECT * FROM jobs WHERE id = ?").get(String(timeline.jobId));
    if (!job) return NextResponse.json({ error: "Job was not found." }, { status: 404 });
    const now = new Date().toISOString();
    localDb().prepare(`
      INSERT OR REPLACE INTO notifications (id, userId, title, body, read, href, createdAt)
      VALUES (?, ?, 'Payment required', ?, 0, '/find-work', ?)
    `).run(`notification-payment-wall-${timelineId}`, String(job.clientId), `Pay timeline ${timeline.timelineNumber} for ${job.title ?? "your job"}. Worker: ${timeline.workerId}.`, now);
    await writeAdminAuditLog(request, { admin, targetUserId: String(job.clientId ?? ""), actionType: "timeline.payment_wall", oldValue: timeline, newValue: { timelineId }, reason });
    return NextResponse.json({ success: true });
  }
  const db = adminDb();
  const timelineSnap = await db.collection("jobTimelines").doc(timelineId).get();
  if (!timelineSnap.exists) return NextResponse.json({ error: "Timeline was not found." }, { status: 404 });
  const timeline = { id: timelineSnap.id, ...timelineSnap.data() } as AdminTimelineRecord;
  const jobSnap = await db.collection("jobs").doc(String(timeline.jobId)).get();
  if (!jobSnap.exists) return NextResponse.json({ error: "Job was not found." }, { status: 404 });
  const job = jobSnap.data() ?? {};
  await notifyUser(db, {
    userId: String(job.clientId),
    type: "payment_required",
    title: "Payment required",
    message: `Pay timeline ${timeline.timelineNumber ?? ""} for ${job.title ?? "your job"}. Worker: ${timeline.workerId ?? "worker"}.`,
    link: "/find-work",
    emailSubject: "Payment required on COPIC",
    eventId: `timeline:${timelineId}:payment-required`
  });
  await writeAdminAuditLog(request, { admin, targetUserId: String(job.clientId ?? ""), actionType: "timeline.payment_wall", oldValue: timeline, newValue: { timelineId }, reason });
  return NextResponse.json({ success: true });
}

function normalizeJobPatch(input: unknown) {
  const body = typeof input === "object" && input ? input as Record<string, unknown> : {};
  const patch: Record<string, string | number | null> = {};
  for (const key of ["title", "description", "category", "location", "county", "duration", "payType", "paymentMethod"] as const) {
    if (typeof body[key] === "string") patch[key] = body[key].trim();
  }
  if (typeof body.status === "string" && ["draft", "open", "pending", "live", "assigned", "active", "in_progress", "completed", "disputed", "cancelled", "moderated"].includes(body.status)) patch.status = body.status as JobStatus;
  for (const key of ["payAmount", "durationHours", "durationValue", "workersNeeded", "quantity"] as const) {
    if (key in body) {
      const value = Number(body[key]);
      if (Number.isFinite(value)) patch[key] = value;
    }
  }
  return patch;
}
