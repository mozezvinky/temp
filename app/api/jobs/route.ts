import { isSqlBackend, logDataMode } from "@/lib/data-backend";
import { CurrentUserProfileError, getCurrentUserProfile } from "@/lib/current-user-profile";
import { adminDb } from "@/lib/firebase-admin";
import { cancelLocalNextPeriod, cancelLocalRemainingPeriods, completeLocalJob, countLocalAcceptedApplications, deleteLocalJob, getLocalJob, listLocalClientJobs, listLocalWorkerVisibleJobs, localDb, updateLocalJob } from "@/lib/local-sql";
import type { Job, JobStatus, Role } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const scope = searchParams.get("scope");
  logDataMode();
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const currentUser = await getCurrentUserProfile(request);

    if (isSqlBackend()) {
      const profile = currentUser.profile;
      if (!profile) return NextResponse.json({ jobs: [], job: null });

      if (id) {
        const job = getLocalJob(id);
        if (!job) return NextResponse.json({ job: null });
        if (job.rehireOfJobId) return NextResponse.json({ job: null });
        if (profile.role === "worker" && job.clientId === currentUser.uid) {
          return NextResponse.json({ error: "You cannot apply to a job you posted as a client." }, { status: 403 });
        }
        if (profile.role !== "admin" && profile.role === "client" && job.clientId !== currentUser.uid) {
          return NextResponse.json({ error: "You do not have access to this job." }, { status: 403 });
        }
        return NextResponse.json({ job });
      }

      const jobs = (scope === "client"
        ? listLocalClientJobs(currentUser.uid)
        : scope === "worker-active"
          ? listLocalWorkerActiveJobs(currentUser.uid)
          : listLocalWorkerVisibleJobs().filter(job => job.clientId !== currentUser.uid)
      ).filter(job => !job.rehireOfJobId);
      return NextResponse.json({ jobs });
    }

    const db = adminDb();
    const profile = currentUser.profile;
    if (!profile) return NextResponse.json({ jobs: [], job: null });

    if (id) {
      const jobSnap = await db.collection("jobs").doc(id).get();
      if (!jobSnap.exists) return NextResponse.json({ job: null });
      const job = { id: jobSnap.id, ...jobSnap.data() };
      if (jobSnap.data()?.rehireOfJobId) return NextResponse.json({ job: null });
      if (profile?.role === "worker" && jobSnap.data()?.clientId === currentUser.uid) {
        return NextResponse.json({ error: "You cannot apply to a job you posted as a client." }, { status: 403 });
      }
      if (profile?.role !== "admin" && profile?.role === "client" && jobSnap.data()?.clientId !== currentUser.uid) {
        return NextResponse.json({ error: "You do not have access to this job." }, { status: 403 });
      }
      return NextResponse.json({ job: await enrichFirestoreJobClient(db, await enrichFirestoreJobTimelines(db, job as Record<string, unknown>)) });
    }

    const snapshot = await (scope === "client"
      ? db.collection("jobs").where("clientId", "==", currentUser.uid).limit(80).get()
      : scope === "worker-active"
        ? getFirestoreWorkerActiveJobSnapshot(db, currentUser.uid)
        : db.collection("jobs").where("status", "==", "open").limit(80).get()
    );
    const snapshotDocs = Array.isArray(snapshot) ? snapshot : snapshot.docs;
    const jobs = snapshotDocs
      .map<Record<string, unknown>>(doc => ({ id: doc.id, ...doc.data() }))
      .filter(job => !job.rehireOfJobId)
      .filter(job => scope === "client" || scope === "worker-active" || job.clientId !== currentUser.uid)
      .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
    const clientIds = [...new Set(jobs.map(job => typeof job.clientId === "string" ? job.clientId : "").filter(Boolean))];
    const [applicationSnaps, timelineSnaps, clientSnaps] = await Promise.all([
      Promise.all(jobs.map(job => db.collection("applications").where("jobId", "==", job.id).limit(120).get())),
      Promise.all(jobs.map(job => db.collection("jobTimelines").where("jobId", "==", job.id).limit(120).get())),
      Promise.all(clientIds.map(id => db.collection("users").doc(id).get()))
    ]);
    const clients = new Map(clientSnaps.map(snap => [snap.id, snap.data() ?? {}]));
    const responseJobs = jobs.map((job, index) => {
      const timelines = timelineSnaps[index].docs.map(doc => doc.data());
      const paidTimelineCount = timelines.filter(item => item.status === "paid").length;
      const submittedTimelineCount = timelines.filter(item => item.status === "submitted").length;
      return {
      ...job,
      clientVerificationStatus: typeof clients.get(String(job.clientId))?.verificationStatus === "string" ? clients.get(String(job.clientId))?.verificationStatus : undefined,
      acceptedCount: applicationSnaps[index].docs.filter(doc => ["accepted", "completion_requested", "payment_sent"].includes(String(doc.data().status))).length,
      paidTimelineCount,
      submittedTimelineCount,
      unpaidTimelineCount: Math.max(0, Number(job.timelineCount ?? timelines.length) - paidTimelineCount)
    };
    });
    return NextResponse.json({
      jobs: responseJobs
    });
  } catch (error) {
    if (error instanceof CurrentUserProfileError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[api/jobs] load failed", error);
    return NextResponse.json({ success: false, message: "Unable to load jobs.", error: "Unable to load jobs." }, { status: 500 });
  }
}

function listLocalWorkerActiveJobs(workerId: string) {
  const rows = localDb().prepare(`
    SELECT DISTINCT jobs.id
    FROM applications
    INNER JOIN jobs ON jobs.id = applications.jobId
    WHERE applications.workerId = ?
      AND applications.status IN ('accepted', 'completion_requested', 'payment_sent')
      AND jobs.status NOT IN ('completed', 'cancelled')
    ORDER BY jobs.updatedAt DESC
    LIMIT 80
  `).all(workerId);
  return rows
    .map(row => getLocalJob(String(row.id ?? "")))
    .filter((job): job is Job => !!job);
}

async function getFirestoreWorkerActiveJobSnapshot(db: FirebaseFirestore.Firestore, workerId: string) {
  const applicationSnap = await db.collection("applications").where("workerId", "==", workerId).limit(80).get();
  const jobIds = [...new Set(applicationSnap.docs
    .filter(doc => ["accepted", "completion_requested", "payment_sent"].includes(String(doc.data().status)))
    .map(doc => String(doc.data().jobId ?? ""))
    .filter(Boolean))];
  const jobSnaps = await Promise.all(jobIds.map(id => db.collection("jobs").doc(id).get()));
  return jobSnaps.filter(snap => snap.exists && !["completed", "cancelled"].includes(String(snap.data()?.status)));
}

async function enrichFirestoreJobClient(db: FirebaseFirestore.Firestore, job: Record<string, unknown>) {
  const clientId = typeof job.clientId === "string" ? job.clientId : "";
  if (!clientId) return job;
  const clientSnap = await db.collection("users").doc(clientId).get();
  return {
    ...job,
    clientVerificationStatus: typeof clientSnap.data()?.verificationStatus === "string" ? clientSnap.data()?.verificationStatus : undefined
  };
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserProfile(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Choose posted work to edit." }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const patch = normalizeJobPatch(body);

    if (isSqlBackend()) {
      const profile = currentUser.profile;
      const job = getLocalJob(id);
      if (!profile || !job) return NextResponse.json({ error: "Posted work was not found." }, { status: 404 });
      if (!canManageJob(profile.role, currentUser.uid, job.clientId)) {
        return NextResponse.json({ error: "You can only edit your own posted work." }, { status: 403 });
      }
      if (body?.action === "complete") {
        const completedJob = completeLocalJob(id, job.clientId);
        return NextResponse.json({ success: true, job: completedJob });
      }
      if (body?.action === "cancel_remaining") {
        const cancelledJob = cancelLocalRemainingPeriods(id, job.clientId);
        return NextResponse.json({ success: true, job: cancelledJob });
      }
      if (body?.action === "cancel_next_period") {
        const updatedJob = cancelLocalNextPeriod(id, job.clientId);
        return NextResponse.json({ success: true, job: updatedJob });
      }
      if (patch.status === "cancelled" && countLocalAcceptedApplications(id) > 0) {
        return NextResponse.json({ error: "Clients cannot cancel a job after accepting a worker." }, { status: 400 });
      }
      const updatedJob = updateLocalJob(id, job.clientId, patch);
      return NextResponse.json({ success: true, job: updatedJob });
    }

    const db = adminDb();
    const [userSnap, jobSnap] = await Promise.all([
      db.collection("users").doc(currentUser.uid).get(),
      db.collection("jobs").doc(id).get()
    ]);
    if (!userSnap.exists || !jobSnap.exists) return NextResponse.json({ error: "Posted work was not found." }, { status: 404 });
    const role = userSnap.data()?.role as Role | undefined;
    const jobClientId = String(jobSnap.data()?.clientId ?? "");
    if (!canManageJob(role, currentUser.uid, jobClientId)) {
      return NextResponse.json({ error: "You can only edit your own posted work." }, { status: 403 });
    }
    if (body?.action === "complete") {
      const conversationsSnap = await db.collection("messages").where("jobId", "==", id).where("clientId", "==", jobClientId).limit(120).get();
      const applicationsSnap = await db.collection("applications").where("jobId", "==", id).where("clientId", "==", jobClientId).limit(120).get();
      const batch = db.batch();
      batch.set(jobSnap.ref, { status: "completed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      conversationsSnap.docs.forEach(doc => {
        batch.set(doc.ref, { locked: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      applicationsSnap.docs.forEach(doc => {
        if (doc.data().status === "accepted") {
          batch.set(doc.ref, { status: "completed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      });
      await batch.commit();
    } else if (body?.action === "cancel_remaining") {
      const conversationsSnap = await db.collection("messages").where("jobId", "==", id).where("clientId", "==", jobClientId).limit(120).get();
      const applicationsSnap = await db.collection("applications").where("jobId", "==", id).where("clientId", "==", jobClientId).limit(120).get();
      const batch = db.batch();
      batch.set(jobSnap.ref, { status: "completed", recurrenceStatus: "cancelled", cancelledAfterPeriods: Number(jobSnap.data()?.completedPeriods ?? 0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      conversationsSnap.docs.forEach(doc => batch.set(doc.ref, { locked: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
      applicationsSnap.docs.forEach(doc => {
        if (doc.data().status === "accepted") batch.set(doc.ref, { status: "completed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      await batch.commit();
    } else if (body?.action === "cancel_next_period") {
      const totalPeriods = Number(jobSnap.data()?.totalPeriods ?? 1);
      const completedPeriods = Number(jobSnap.data()?.completedPeriods ?? 0);
      if (totalPeriods <= completedPeriods + 1) {
        const conversationsSnap = await db.collection("messages").where("jobId", "==", id).where("clientId", "==", jobClientId).limit(120).get();
        const applicationsSnap = await db.collection("applications").where("jobId", "==", id).where("clientId", "==", jobClientId).limit(120).get();
        const batch = db.batch();
        batch.set(jobSnap.ref, { status: "completed", recurrenceStatus: "cancelled", cancelledAfterPeriods: completedPeriods, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        conversationsSnap.docs.forEach(doc => batch.set(doc.ref, { locked: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
        applicationsSnap.docs.forEach(doc => {
          if (doc.data().status === "accepted") batch.set(doc.ref, { status: "completed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
        await batch.commit();
      } else {
        await jobSnap.ref.set({ totalPeriods: totalPeriods - 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    } else {
      if (patch.status === "cancelled") {
        const applicationsSnap = await db.collection("applications").where("jobId", "==", id).limit(120).get();
        const hasAcceptedWorker = applicationsSnap.docs.some(doc => ["accepted", "completion_requested", "payment_sent", "completed"].includes(String(doc.data().status)));
        if (hasAcceptedWorker) return NextResponse.json({ error: "Clients cannot cancel a job after accepting a worker." }, { status: 400 });
      }
      await jobSnap.ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const updatedSnap = await jobSnap.ref.get();
    return NextResponse.json({ success: true, job: { id: updatedSnap.id, ...updatedSnap.data() } });
  } catch (error) {
    if (error instanceof CurrentUserProfileError) return NextResponse.json({ error: error.message }, { status: error.status });
    const status = error instanceof AuthRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to edit posted work.";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserProfile(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Choose posted work to delete." }, { status: 400 });

    if (isSqlBackend()) {
      const profile = currentUser.profile;
      const job = getLocalJob(id);
      if (!profile || !job) return NextResponse.json({ error: "Posted work was not found." }, { status: 404 });
      if (!canManageJob(profile.role, currentUser.uid, job.clientId)) {
        return NextResponse.json({ error: "You can only delete your own posted work." }, { status: 403 });
      }
      if (countLocalAcceptedApplications(id) > 0) {
        return NextResponse.json({ error: "You cannot delete posted work after a worker has been accepted." }, { status: 400 });
      }
      deleteLocalJob(id, job.clientId);
      return NextResponse.json({ success: true });
    }

    const db = adminDb();
    const [userSnap, jobSnap] = await Promise.all([
      db.collection("users").doc(currentUser.uid).get(),
      db.collection("jobs").doc(id).get()
    ]);
    if (!userSnap.exists || !jobSnap.exists) return NextResponse.json({ error: "Posted work was not found." }, { status: 404 });
    const role = userSnap.data()?.role as Role | undefined;
    const jobClientId = String(jobSnap.data()?.clientId ?? "");
    if (!canManageJob(role, currentUser.uid, jobClientId)) {
      return NextResponse.json({ error: "You can only delete your own posted work." }, { status: 403 });
    }
    const applicationsSnap = await db.collection("applications").where("jobId", "==", id).limit(120).get();
    const hasAcceptedWorker = applicationsSnap.docs.some(doc => ["accepted", "completion_requested", "payment_sent", "completed"].includes(String(doc.data().status)));
    if (hasAcceptedWorker) {
      return NextResponse.json({ error: "You cannot delete posted work after a worker has been accepted." }, { status: 400 });
    }
    await jobSnap.ref.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CurrentUserProfileError) return NextResponse.json({ error: error.message }, { status: error.status });
    const status = error instanceof AuthRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to delete posted work.";
    return NextResponse.json({ error: message }, { status });
  }
}

function timestampMillis(value: unknown) {
  return typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis: () => number }).toMillis()
    : 0;
}

async function enrichFirestoreJobTimelines(db: FirebaseFirestore.Firestore, job: Record<string, unknown>) {
  const snapshot = await db.collection("jobTimelines").where("jobId", "==", String(job.id)).limit(120).get();
  const timelines = snapshot.docs.map(doc => doc.data());
  const paidTimelineCount = timelines.filter(item => item.status === "paid").length;
  const submittedTimelineCount = timelines.filter(item => item.status === "submitted").length;
  return {
    ...job,
    paidTimelineCount,
    submittedTimelineCount,
    unpaidTimelineCount: Math.max(0, Number(job.timelineCount ?? timelines.length) - paidTimelineCount)
  };
}

class AuthRouteError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function canManageJob(role: Role | undefined, uid: string, clientId: string) {
  return role === "admin" || (role === "client" && clientId === uid);
}

function normalizeJobPatch(body: unknown): Partial<Pick<Job, "title" | "description" | "category" | "payAmount" | "payType" | "duration" | "durationValue" | "durationUnit" | "durationHours" | "workersNeeded" | "quantity" | "unit" | "customUnit" | "paymentMethod" | "status">> {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const patch: Partial<Pick<Job, "title" | "description" | "category" | "payAmount" | "payType" | "duration" | "durationValue" | "durationUnit" | "durationHours" | "workersNeeded" | "quantity" | "unit" | "customUnit" | "paymentMethod" | "status">> = {};
  if (typeof input.title === "string" && input.title.trim()) patch.title = input.title.trim();
  if (typeof input.description === "string" && input.description.trim()) patch.description = input.description.trim();
  if (typeof input.category === "string" && input.category.trim()) patch.category = input.category.trim();
  if (typeof input.payType === "string" && ["fixed", "timeline"].includes(input.payType)) patch.payType = input.payType as Job["payType"];
  const amount = Number(input.payAmount);
  if (Number.isFinite(amount) && amount >= 0) patch.payAmount = amount;
  const durationHours = Number(input.durationHours);
  if (Number.isFinite(durationHours) && durationHours > 0) {
    patch.durationHours = durationHours;
    if (typeof input.duration === "string") patch.duration = input.duration;
    const durationValue = Number(input.durationValue);
    if (Number.isFinite(durationValue) && durationValue > 0) patch.durationValue = durationValue;
    if (typeof input.durationUnit === "string" && ["minutes", "hours", "days", "weeks", "months"].includes(input.durationUnit)) patch.durationUnit = input.durationUnit as Job["durationUnit"];
  }
  const workersNeeded = Number(input.workersNeeded);
  if (Number.isFinite(workersNeeded) && workersNeeded >= 1 && workersNeeded <= 100) patch.workersNeeded = Math.trunc(workersNeeded);
  const quantity = Number(input.quantity);
  if (Number.isFinite(quantity) && quantity > 0) patch.quantity = quantity;
  if (typeof input.unit === "string") patch.unit = input.unit.trim() || null;
  if (typeof input.customUnit === "string") patch.customUnit = input.customUnit.trim() || null;
  if (typeof input.paymentMethod === "string" && ["mpesa", "cash"].includes(input.paymentMethod)) patch.paymentMethod = input.paymentMethod as Job["paymentMethod"];
  if (typeof input.status === "string" && ["open", "live", "assigned", "active", "completed", "cancelled", "pending", "disputed", "moderated"].includes(input.status)) {
    patch.status = input.status as JobStatus;
  }
  return patch;
}
