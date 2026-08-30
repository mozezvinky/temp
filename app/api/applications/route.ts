import { isSqlBackend, logDataMode } from "@/lib/data-backend";
import { CurrentUserProfileError, getCurrentUserProfile } from "@/lib/current-user-profile";
import { sendAppEmail } from "@/lib/app-email";
import { adminDb } from "@/lib/firebase-admin";
import { acceptLocalApplication, cancelLocalApplication, cancelLocalLiveApplication, completeLocalApplication, confirmLocalWorkerPaid, countLocalAcceptedApplications, countLocalActiveAcceptedApplications, createLocalApplication, getLocalJob, getLocalUser, listLocalApplications, requestLocalApplicationCompletion } from "@/lib/local-sql";
import { type CopicNotificationInput, sendNotificationEmailsAfterCommit, setNotification } from "@/lib/notifications-server";
import { serverDebug } from "@/lib/server-debug";
import { getWorkerEligibilityFromVerification, getWorkerJobEligibility, getWorkerVerificationStatus, getWorkerVerificationStatusFromRecords, getWorkerWorkEligibility, logApplyEligibilityCheck } from "@/lib/worker-verification";
import type { Role } from "@/types";
import { calculateJobPaymentBreakdown, calculateServiceFee } from "@/utils/money";
import { normalizeVerificationStatus } from "@/utils/verification";
import { isPayPerTimeline, timelinePaymentSummary } from "@/utils/timeline-payments";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") === "client" ? "client" : "worker";
  logDataMode();
  try {
    const currentUser = await getCurrentUserProfile(request, role);

    if (isSqlBackend()) {
      const profile = currentUser.profile;
      if (!profile || (profile.role !== role && profile.role !== "admin")) return NextResponse.json({ applications: [] });
      const applications = listLocalApplications(currentUser.uid, role).filter(application => application.coverNote !== "Rehire request");
      if (role === "worker") await logApplicationsPageCheck(currentUser.uid, applications);
      return NextResponse.json({ applications });
    }

    const db = adminDb();
    const profileRole = currentUser.profile?.role as Role | undefined;
    if (profileRole !== role && profileRole !== "admin") return NextResponse.json({ applications: [] });
    const field = role === "client" ? "clientId" : "workerId";
    const snapshot = await db.collection("applications").where(field, "==", currentUser.uid).limit(80).get();
    const applications = await enrichApplicationsWithWorkers(
      snapshot.docs.map<Record<string, unknown>>(doc => ({ id: doc.id, ...doc.data() })).filter(application => application.coverNote !== "Rehire request"),
      role
    );
    if (role === "worker") await logApplicationsPageCheck(currentUser.uid, applications);
    return NextResponse.json({ applications });
  } catch (error) {
    if (error instanceof CurrentUserProfileError) return NextResponse.json({ error: error.message }, { status: error.status });
    const status = error instanceof AuthRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to load applications.";
    console.error("[api/applications] load failed", error);
    if (isQuotaError(message)) {
      return NextResponse.json({ applications: [], degraded: true, reason: "quota", error: "Firestore quota is exhausted right now. Showing cached data where available." });
    }
    return NextResponse.json({ success: false, message: "Unable to load applications.", error: status === 500 ? "Unable to load applications." : message }, { status });
  }
}

async function logApplicationsPageCheck(uid: string, applications: Array<Record<string, unknown>>) {
  const currentJob = applications.find(application => ["accepted", "completion_requested", "payment_sent"].includes(String(application.status)) && application.jobStatus !== "completed" && application.jobStatus !== "cancelled");
  const verification = await getWorkerVerificationStatus(uid);
  console.info("[COPIC APPLICATIONS]", {
    uid,
    currentJobId: typeof currentJob?.jobId === "string" ? currentJob.jobId : null,
    currentJobStatus: typeof currentJob?.status === "string" ? currentJob.status : null,
    identityVerified: verification.identityVerified,
    showApplicationVerificationWarning: false
  });
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserProfile(request, "worker");
    const body = await request.json().catch(() => ({}));
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const coverNote = typeof body.coverNote === "string" ? body.coverNote.trim() : "";
    if (!jobId) return NextResponse.json({ error: "Choose a job before applying." }, { status: 400 });

    if (isSqlBackend()) {
      const worker = currentUser.profile;
      const job = getLocalJob(jobId);
      if (!worker || worker.role !== "worker") return NextResponse.json({ error: "Use a worker account to apply." }, { status: 403 });
      if (job?.rehireOfJobId) return NextResponse.json({ error: "This job is no longer available." }, { status: 400 });
      if (job?.clientId === worker.id) return NextResponse.json({ error: "You cannot apply to a job you posted as a client." }, { status: 403 });
      if (countLocalActiveAcceptedApplications(worker.id) > 0) {
        return NextResponse.json({ error: "You already have an accepted active job. Complete it before applying to another job." }, { status: 403 });
      }
      if (!job || job.status !== "open") return NextResponse.json({ error: "This job is no longer accepting applications." }, { status: 400 });
      const allowed = await getWorkerJobEligibility(worker.uid, job);
      logApplyEligibilityCheck(allowed);
      if (allowed.decision === "blocked") return NextResponse.json({ error: allowed.reason }, { status: 403 });
      if (countLocalAcceptedApplications(job.id) >= (job.workersNeeded ?? 1)) {
        return NextResponse.json({ error: "This job already has enough accepted workers." }, { status: 400 });
      }
      const id = crypto.randomUUID();
      const application = createLocalApplication({
        id,
        jobId: job.id,
        workerId: worker.id,
        clientId: job.clientId,
        jobTitle: job.title,
        coverNote
      });
      const client = getLocalUser(job.clientId);
      void sendNewApplicationEmail(client?.email, job.title, worker.displayName).catch(error => console.error("[api/applications] new application email failed", error));
      return NextResponse.json({ success: true, application });
    }

    const db = adminDb();
    const [workerSnap, jobSnap] = await Promise.all([
      db.collection("users").doc(currentUser.uid).get(),
      db.collection("jobs").doc(jobId).get()
    ]);
    const job = jobSnap.data();
    if (!workerSnap.exists || currentUser.profile?.role !== "worker") return NextResponse.json({ error: "Use a worker account to apply." }, { status: 403 });
    if (job?.rehireOfJobId) return NextResponse.json({ error: "This job is no longer available." }, { status: 400 });
    if (job?.clientId === currentUser.uid) return NextResponse.json({ error: "You cannot apply to a job you posted as a client." }, { status: 403 });
    const activeAcceptedSnapshot = await db.collection("applications").where("workerId", "==", currentUser.uid).limit(40).get();
    const activeApplications = activeAcceptedSnapshot.docs.filter(doc => ["accepted", "completion_requested", "payment_sent"].includes(String(doc.data().status)));
    if (activeApplications.length) {
      const jobSnaps = await Promise.all(activeApplications.map(doc => db.collection("jobs").doc(String(doc.data().jobId)).get()));
      const hasActiveJob = jobSnaps.some(snap => snap.exists && ["open", "live", "assigned", "active"].includes(String(snap.data()?.status)));
      if (hasActiveJob) return NextResponse.json({ error: "You already have an accepted active job. Complete it before applying to another job." }, { status: 403 });
    }
    if (!jobSnap.exists || job?.status !== "open") return NextResponse.json({ error: "This job is no longer accepting applications." }, { status: 400 });
    const eligibilityJob = {
      title: String(job?.title ?? ""),
      category: String(job?.category ?? ""),
      requiredSkills: Array.isArray(job?.requiredSkills) ? job.requiredSkills.filter((item: unknown): item is string => typeof item === "string") : []
    };
    const allowed = await getWorkerJobEligibility(currentUser.uid, eligibilityJob);
    logApplyEligibilityCheck(allowed);
    if (allowed.decision === "blocked") return NextResponse.json({ error: allowed.reason }, { status: 403 });
    const acceptedSnapshot = await db.collection("applications").where("jobId", "==", jobId).limit(120).get();
    const acceptedCount = acceptedSnapshot.docs.filter(doc => ["accepted", "completion_requested", "payment_sent"].includes(String(doc.data().status))).length;
    if (acceptedCount >= Number(job?.workersNeeded ?? 1)) return NextResponse.json({ error: "This job already has enough accepted workers." }, { status: 400 });
    const existing = await db.collection("applications").where("jobId", "==", jobId).where("workerId", "==", currentUser.uid).limit(1).get();
    if (!existing.empty) return NextResponse.json({ success: true, application: { id: existing.docs[0].id, ...existing.docs[0].data() } });
    const applicationRef = db.collection("applications").doc();
    const activityRef = db.collection("activities").doc();
    const clientActivityRef = db.collection("activities").doc();
    const payload = {
      id: applicationRef.id,
      jobId,
      workerId: currentUser.uid,
      clientId: String(job?.clientId ?? ""),
      jobTitle: String(job?.title ?? "Job application"),
      coverNote,
      jobCategory: String(job?.category ?? ""),
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    const notification: CopicNotificationInput = {
      userId: payload.clientId,
      type: "application_received",
      title: "New application",
      message: `A worker applied for ${payload.jobTitle}.`,
      link: `/applications?application=${applicationRef.id}`,
      emailSubject: "New application on COPIC",
      eventId: `application:${applicationRef.id}:created`
    };
    const batch = db.batch();
    batch.set(applicationRef, payload);
    batch.set(activityRef, {
      id: activityRef.id,
      userId: currentUser.uid,
      role: "worker",
      type: "application_submitted",
      title: "Application sent",
      description: `You applied for ${payload.jobTitle}.`,
      relatedId: applicationRef.id,
      read: false,
      createdAt: FieldValue.serverTimestamp()
    });
    batch.set(clientActivityRef, {
      id: clientActivityRef.id,
      userId: payload.clientId,
      role: "client",
      type: "application_received",
      title: "New application",
      description: `A worker applied for ${payload.jobTitle}.`,
      relatedId: applicationRef.id,
      read: false,
      createdAt: FieldValue.serverTimestamp()
    });
    setNotification(batch, db, notification);
    await batch.commit();
    await sendNotificationEmailsAfterCommit(db, [notification]);
    return NextResponse.json({ success: true, application: payload });
  } catch (error) {
    if (error instanceof CurrentUserProfileError) return NextResponse.json({ error: error.message }, { status: error.status });
    const status = error instanceof AuthRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to submit application.";
    if (isQuotaError(message)) {
      return NextResponse.json({ error: "Firestore quota is exhausted right now. Please wait a few minutes before trying again." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
    const action = typeof body.action === "string" ? body.action : "";
    const requestedTimelineCount = Math.max(1, Math.trunc(Number(body.timelineCount ?? 1) || 1));
    if (!applicationId || !["accept", "complete", "cancel", "worker_cancel_live", "worker_complete", "worker_confirm_payment"].includes(action)) return NextResponse.json({ error: "Choose an application to update." }, { status: 400 });
    const currentUser = await getCurrentUserProfile(request, ["accept", "complete"].includes(action) ? "client" : "worker");

    if (isSqlBackend()) {
      if (action === "cancel") {
        const worker = currentUser.profile;
        if (!worker || worker.role !== "worker") return NextResponse.json({ error: "Use a worker account to cancel applications." }, { status: 403 });
        const application = cancelLocalApplication(applicationId, currentUser.uid);
        if (!application) return NextResponse.json({ error: "Application was not found." }, { status: 404 });
        return NextResponse.json({ success: true, application });
      }
      if (action === "worker_cancel_live") {
        const worker = currentUser.profile;
        if (!worker || worker.role !== "worker") return NextResponse.json({ error: "Use a worker account to cancel live jobs." }, { status: 403 });
        const application = cancelLocalLiveApplication(applicationId, currentUser.uid);
        if (!application) return NextResponse.json({ error: "Application was not found." }, { status: 404 });
        return NextResponse.json({ success: true, application });
      }
      if (action === "worker_complete") {
        const worker = currentUser.profile;
        if (!worker || worker.role !== "worker") return NextResponse.json({ error: "Use a worker account to mark work complete." }, { status: 403 });
        const allowed = await getWorkerWorkEligibility(currentUser.uid);
        if (allowed.decision === "blocked") return NextResponse.json({ error: allowed.reason }, { status: 403 });
        const application = requestLocalApplicationCompletion(applicationId, currentUser.uid, requestedTimelineCount);
        if (!application) return NextResponse.json({ error: "Application was not found." }, { status: 404 });
        return NextResponse.json({ success: true, application });
      }
      if (action === "worker_confirm_payment") {
        const worker = currentUser.profile;
        if (!worker || worker.role !== "worker") return NextResponse.json({ error: "Use a worker account to confirm payment." }, { status: 403 });
        const allowed = await getWorkerWorkEligibility(currentUser.uid);
        if (allowed.decision === "blocked") return NextResponse.json({ error: allowed.reason }, { status: 403 });
        const application = completeLocalApplication(applicationId, currentUser.uid);
        if (!application) return NextResponse.json({ error: "Application was not found." }, { status: 404 });
        return NextResponse.json({ success: true, application });
      }
      const client = currentUser.profile;
      if (!client || client.role !== "client") return NextResponse.json({ error: "Use a client account to update applications." }, { status: 403 });
      const timelineIds = Array.isArray(body.timelineIds) ? body.timelineIds.filter((item: unknown): item is string => typeof item === "string") : undefined;
      const application = action === "complete"
        ? confirmLocalWorkerPaid(applicationId, currentUser.uid, timelineIds)
        : acceptLocalApplication(applicationId, currentUser.uid);
      if (!application) return NextResponse.json({ error: "Application was not found." }, { status: 404 });
      if (action === "accept") {
        const worker = getLocalUser(application.workerId);
        void sendApplicationAcceptedEmail(worker?.email, application.jobTitle ?? "your job").catch(error => console.error("[api/applications] accepted application email failed", error));
      }
      return NextResponse.json({ success: true, application });
    }

    const db = adminDb();
    const applicationRef = db.collection("applications").doc(applicationId);
    if (action === "cancel") {
      let notification: CopicNotificationInput | null = null;
      const result = await db.runTransaction(async transaction => {
        const today = new Date().toISOString().slice(0, 10);
        const cancellationRef = db.collection("workerCancellationDays").doc(`${currentUser.uid}_${today}`);
        const applicationSnap = await transaction.get(applicationRef);
        const cancellationSnap = await transaction.get(cancellationRef);
        if (!applicationSnap.exists) throw new AuthRouteError("Application was not found.", 404);
        const application = applicationSnap.data() ?? {};
        if (application.workerId !== currentUser.uid) throw new AuthRouteError("You can only cancel your own applications.", 403);
        if (application.status !== "pending") throw new AuthRouteError("Only pending applications can be cancelled.", 400);
        if (Number(cancellationSnap.data()?.count ?? 0) >= 2) {
          throw new AuthRouteError("You have reached today's cancellation limit. You can only cancel twice per day.", 429);
        }
        transaction.set(applicationRef, { status: "withdrawn", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(cancellationRef, {
          id: cancellationRef.id,
          workerId: currentUser.uid,
          day: today,
          count: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        notification = {
          userId: String(application.clientId),
          type: "application_cancelled",
          title: "Application cancelled",
          message: `A worker cancelled an application for ${application.jobTitle ?? "your job"}.`,
          link: `/applications?application=${applicationRef.id}`,
          emailSubject: "Application cancelled on COPIC",
          eventId: `application:${applicationSnap.id}:cancelled`
        };
        setNotification(transaction, db, notification);
        return { id: applicationSnap.id, ...application, status: "withdrawn" };
      });
      if (notification) await sendNotificationEmailsAfterCommit(db, [notification]);
      return NextResponse.json({ success: true, application: result });
    }
    if (action === "worker_cancel_live") {
      const result = await db.runTransaction(async transaction => {
        const applicationSnap = await transaction.get(applicationRef);
        if (!applicationSnap.exists) throw new AuthRouteError("Application was not found.", 404);
        const application = applicationSnap.data() ?? {};
        if (application.workerId !== currentUser.uid) throw new AuthRouteError("You can only cancel your own live jobs.", 403);
        if (["completion_requested", "payment_sent", "completed"].includes(String(application.status))) {
          throw new AuthRouteError("This job has already been marked complete and can no longer be cancelled.", 400);
        }
        if (application.status !== "accepted") {
          throw new AuthRouteError("Only live jobs can be cancelled with the no-pay warning.", 400);
        }
        const jobRef = db.collection("jobs").doc(String(application.jobId));
        const conversationRef = db.collection("messages").doc(`${application.jobId}_${application.workerId}`);
        const jobSnap = await transaction.get(jobRef);
        if (!jobSnap.exists) throw new AuthRouteError("Job was not found.", 404);
        transaction.set(applicationRef, { status: "cancelled", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(jobRef, { status: "cancelled", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(conversationRef, { locked: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        setNotification(transaction, db, {
          userId: String(application.clientId),
          type: "live_job_cancelled",
          title: "Live job cancelled",
          message: `${application.workerName ?? "A worker"} cancelled ${application.jobTitle ?? "your live job"} with no pay due.`,
          link: `/applications?application=${applicationSnap.id}`,
          emailSubject: "Live job cancelled on COPIC",
          eventId: `application:${applicationSnap.id}:live-cancelled`
        });
        const workerActivityRef = db.collection("activities").doc();
        transaction.set(workerActivityRef, {
          id: workerActivityRef.id,
          userId: currentUser.uid,
          role: "worker",
          type: "live_job_cancelled",
          title: "Live job cancelled",
          description: `${application.jobTitle ?? "Live job"} was cancelled with no pay.`,
          relatedId: applicationSnap.id,
          read: false,
          createdAt: FieldValue.serverTimestamp()
        });
        return { id: applicationSnap.id, ...application, status: "cancelled", jobStatus: "cancelled" };
      });
      await sendNotificationEmailsAfterCommit(db, [{
        userId: String((result as Record<string, unknown>).clientId ?? ""),
        type: "live_job_cancelled",
        title: "Live job cancelled",
        message: `${String((result as Record<string, unknown>).workerName ?? "A worker")} cancelled ${String((result as Record<string, unknown>).jobTitle ?? "your live job")} with no pay due.`,
        link: `/applications?application=${applicationId}`,
        emailSubject: "Live job cancelled on COPIC",
        eventId: `application:${applicationId}:live-cancelled`
      }]);
      return NextResponse.json({ success: true, application: result });
    }
    if (action === "worker_complete") {
      const result = await db.runTransaction(async transaction => {
        const applicationSnap = await transaction.get(applicationRef);
        if (!applicationSnap.exists) throw new AuthRouteError("Application was not found.", 404);
        const application = applicationSnap.data() ?? {};
        if (application.workerId !== currentUser.uid) throw new AuthRouteError("You can only mark your own work complete.", 403);
        const [workerUserSnap, identityVerificationSnap] = await Promise.all([
          transaction.get(db.collection("users").doc(currentUser.uid)),
          transaction.get(db.collection("verifications").doc(currentUser.uid))
        ]);
        const workerStatus = getWorkerEligibilityFromVerification(getWorkerVerificationStatusFromRecords(
          currentUser.uid,
          workerUserSnap.exists ? workerUserSnap.data() : null,
          identityVerificationSnap.exists ? identityVerificationSnap.data() : null,
          null
        ));
        if (workerStatus.decision === "blocked") throw new AuthRouteError(workerStatus.reason, 403);
        const jobRef = db.collection("jobs").doc(String(application.jobId));
        const jobSnap = await transaction.get(jobRef);
        const job = jobSnap.data() ?? {};
        if (isPayPerTimeline(String(job.payType))) {
          const timelineSnap = await transaction.get(db.collection("jobTimelines").where("jobId", "==", application.jobId).limit(120));
          const usableTimelineDocs = timelineSnap.docs.filter(doc => {
            const timeline = doc.data();
            return !timeline.applicationId || String(timeline.applicationId) === applicationSnap.id;
          });
          const blockingTimeline = usableTimelineDocs.find(doc => ["submitted", "approved"].includes(String(doc.data().status)));
          if (blockingTimeline) throw new AuthRouteError("The previous submitted timeline must be paid before submitting the next timeline.", 400);
          const pendingTimelineDocs = usableTimelineDocs
            .filter(doc => doc.data().status === "pending")
            .sort((a, b) => Number(a.data().timelineNumber ?? 0) - Number(b.data().timelineNumber ?? 0));
          const timelineCount = Math.max(1, Math.trunc(Number(job.timelineCount ?? 1) || 1));
          const clientPayPerTimeline = Number(job.clientPayPerTimeline ?? job.payAmount ?? job.rateAmount ?? 0);
          const timelineSummary = timelinePaymentSummary(clientPayPerTimeline, timelineCount);
          const workerPayPerTimeline = timelineSummary.workerPayPerTimeline;
          const submitCount = Math.max(1, Math.min(requestedTimelineCount, timelineSnap.empty ? timelineCount : pendingTimelineDocs.length));
          const submittedTimelineNumbers: number[] = [];
          if (!timelineSnap.empty && pendingTimelineDocs.length === 0) throw new AuthRouteError("All timelines have already been submitted or paid.", 400);
          if (timelineSnap.empty) {
            for (let timelineNumber = 1; timelineNumber <= timelineCount; timelineNumber += 1) {
              const ref = db.collection("jobTimelines").doc();
              const shouldSubmit = timelineNumber <= submitCount;
              if (shouldSubmit) submittedTimelineNumbers.push(timelineNumber);
              transaction.set(ref, {
                id: ref.id,
                jobId: application.jobId,
                applicationId: applicationSnap.id,
                workerId: application.workerId,
                clientId: application.clientId,
                timelineNumber,
                status: shouldSubmit ? "submitted" : "pending",
                submittedAt: shouldSubmit ? FieldValue.serverTimestamp() : null,
                workerAmount: workerPayPerTimeline,
                clientAmount: clientPayPerTimeline,
                platformFee: timelineSummary.clientPayPerTimeline - timelineSummary.workerPayPerTimeline,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
              });
            }
          } else {
            pendingTimelineDocs.slice(0, submitCount).forEach(doc => {
              submittedTimelineNumbers.push(Number(doc.data().timelineNumber ?? 0));
              transaction.set(doc.ref, {
                applicationId: applicationSnap.id,
                workerId: application.workerId,
                status: "submitted",
                submittedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
              }, { merge: true });
            });
          }
          transaction.set(applicationRef, { status: "completion_requested", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          transaction.set(jobRef, { status: "live", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          const paymentUnit = String(job.durationUnit ?? "timeline").replace(/s$/, "") || "timeline";
          setNotification(transaction, db, {
            userId: String(application.clientId),
            type: "timeline_completion_requested",
            title: "Pending payment",
            message: `Pending payment: ${submittedTimelineNumbers.length} ${paymentUnit}${submittedTimelineNumbers.length === 1 ? "" : "s"} for ${application.jobTitle ?? "your job"}.`,
            link: "/find-work",
            emailSubject: "Job completion requested on COPIC",
            eventId: `application:${applicationSnap.id}:timeline-completion-requested:${submittedTimelineNumbers.join("-")}`
          });
          return { id: applicationSnap.id, ...application, status: "completion_requested" };
        }
        if (application.status === "completion_requested") return { id: applicationSnap.id, ...application, status: "completion_requested" };
        if (application.status !== "accepted") throw new AuthRouteError("Only accepted jobs can be marked complete.", 400);
        transaction.set(applicationRef, { status: "completion_requested", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        setNotification(transaction, db, {
          userId: String(application.clientId),
          type: "completion_requested",
          title: "Completion requested",
          message: `${application.workerName ?? "A worker"} marked ${application.jobTitle ?? "your job"} as complete. Please confirm that the job has been completed and payment has been made directly to the worker.`,
          link: `/completed-requests?application=${applicationRef.id}`,
          emailSubject: "Job completion requested on COPIC",
          eventId: `application:${applicationSnap.id}:completion-requested`
        });
        return { id: applicationSnap.id, ...application, status: "completion_requested" };
      });
      await sendNotificationEmailsAfterCommit(db, [{
        userId: String((result as Record<string, unknown>).clientId ?? ""),
        type: "completion_requested",
        title: "Completion requested",
        message: `${String((result as Record<string, unknown>).workerName ?? "A worker")} marked ${String((result as Record<string, unknown>).jobTitle ?? "your job")} as complete. Please confirm that the job has been completed and payment has been made directly to the worker.`,
        link: `/completed-requests?application=${applicationId}`,
        emailSubject: "Job completion requested on COPIC",
        eventId: `application:${applicationId}:completion-requested`
      }]);
      return NextResponse.json({ success: true, application: result });
    }
    if (action === "worker_confirm_payment") {
      const result = await db.runTransaction(async transaction => {
        const applicationSnap = await transaction.get(applicationRef);
        if (!applicationSnap.exists) throw new AuthRouteError("Application was not found.", 404);
        const application = applicationSnap.data() ?? {};
        if (application.workerId !== currentUser.uid) throw new AuthRouteError("You can only confirm payment for your own job.", 403);
        if (application.status !== "payment_sent") throw new AuthRouteError("Confirm payment only after the client has marked the direct payment as sent.", 400);
        const jobRef = db.collection("jobs").doc(String(application.jobId));
        const conversationRef = db.collection("messages").doc(`${application.jobId}_${application.workerId}`);
        const clientUserRef = db.collection("users").doc(String(application.clientId));
        const workerUserRef = db.collection("users").doc(currentUser.uid);
        const jobSnap = await transaction.get(jobRef);
        if (!jobSnap.exists) throw new AuthRouteError("Job was not found.", 404);
        const [workerUserSnap, identityVerificationSnap] = await Promise.all([
          transaction.get(workerUserRef),
          transaction.get(db.collection("verifications").doc(currentUser.uid))
        ]);
        const workerStatus = getWorkerEligibilityFromVerification(getWorkerVerificationStatusFromRecords(
          currentUser.uid,
          workerUserSnap.exists ? workerUserSnap.data() : null,
          identityVerificationSnap.exists ? identityVerificationSnap.data() : null,
          null
        ));
        if (workerStatus.decision === "blocked") throw new AuthRouteError(workerStatus.reason, 403);
        transaction.set(applicationRef, { status: "completed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(jobRef, { status: "completed", completedPeriods: 1, recurrenceStatus: "completed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(conversationRef, {
          id: conversationRef.id,
          jobId: application.jobId,
          clientId: application.clientId,
          workerId: application.workerId,
          locked: true,
          participants: [application.clientId, application.workerId],
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        const grossAmount = Number(jobSnap.data()?.payAmount ?? jobSnap.data()?.rateAmount ?? application.jobAmount ?? 0);
        const breakdown = calculateJobPaymentBreakdown(grossAmount);
        const serviceFee = breakdown.serviceFee;
        transaction.set(applicationRef, {
          status: "completed",
          paymentConfirmedAt: FieldValue.serverTimestamp(),
          grossAmount: breakdown.total,
          workerEarnings: breakdown.workerEarnings,
          serviceFeeAmount: serviceFee,
          serviceFeeStatus: serviceFee > 0 ? "due" : "paid",
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        transaction.set(workerUserRef, { completedJobs: FieldValue.increment(1), isLocked: serviceFee > 0, outstandingServiceFee: FieldValue.increment(serviceFee), lockReason: serviceFee > 0 ? "Service Fee Payment Required" : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(clientUserRef, { completedJobs: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        setNotification(transaction, db, {
          userId: String(application.workerId),
          type: "service_fee_due",
          title: "Account action required",
          message: `${application.jobTitle ?? "Your job"} is complete because you confirmed receiving direct payment. COPIC service fee due: KES ${serviceFee.toLocaleString()}. Pay this service fee to unlock your worker account and continue applying for and accepting jobs.`,
          link: "/dashboard",
          emailSubject: "COPIC service fee due",
          eventId: `application:${applicationSnap.id}:service-fee-due`
        });
        setNotification(transaction, db, {
          userId: String(application.clientId),
          type: "worker_confirmed_payment",
          title: "Worker confirmed payment",
          message: `${application.workerName ?? "The worker"} confirmed receiving payment for ${application.jobTitle ?? "your job"}. The job is now complete.`,
          link: `/applications?application=${applicationRef.id}`,
          emailSubject: "Worker confirmed payment on COPIC",
          eventId: `application:${applicationSnap.id}:worker-confirmed-payment`
        });
        serverDebug("Worker confirmed direct payment received", { applicationId, workerId: currentUser.uid });
        return { id: applicationSnap.id, ...application, status: "completed", grossAmount: breakdown.total, workerEarnings: breakdown.workerEarnings, serviceFeeAmount: serviceFee, serviceFeeStatus: serviceFee > 0 ? "due" : "paid", workerLocked: serviceFee > 0, outstandingServiceFee: serviceFee };
      });
      await sendNotificationEmailsAfterCommit(db, [
        {
          userId: String((result as Record<string, unknown>).workerId ?? ""),
          type: "service_fee_due",
          title: "Account action required",
          message: `${String((result as Record<string, unknown>).jobTitle ?? "Your job")} is complete because you confirmed receiving direct payment. COPIC service fee due: KES ${Number((result as Record<string, unknown>).outstandingServiceFee ?? 0).toLocaleString()}. Pay this service fee to unlock your worker account and continue applying for and accepting jobs.`,
          link: "/dashboard",
          emailSubject: "COPIC service fee due",
          eventId: `application:${applicationId}:service-fee-due`
        },
        {
          userId: String((result as Record<string, unknown>).clientId ?? ""),
          type: "worker_confirmed_payment",
          title: "Worker confirmed payment",
          message: `${String((result as Record<string, unknown>).workerName ?? "The worker")} confirmed receiving payment for ${String((result as Record<string, unknown>).jobTitle ?? "your job")}. The job is now complete.`,
          link: `/applications?application=${applicationId}`,
          emailSubject: "Worker confirmed payment on COPIC",
          eventId: `application:${applicationId}:worker-confirmed-payment`
        }
      ]);
      return NextResponse.json({ success: true, application: result });
    }
    if (action === "complete") {
      const result = await db.runTransaction(async transaction => {
        const applicationSnap = await transaction.get(applicationRef);
        if (!applicationSnap.exists) throw new AuthRouteError("Application was not found.", 404);
        const application = applicationSnap.data() ?? {};
        if (application.clientId !== currentUser.uid) throw new AuthRouteError("You can only complete applications for your own jobs.", 403);
        const jobRef = db.collection("jobs").doc(String(application.jobId));
        const jobSnap = await transaction.get(jobRef);
        const job = jobSnap.data() ?? {};
        if (isPayPerTimeline(String(job.payType))) {
          const selectedTimelineIds = Array.isArray(body.timelineIds) ? body.timelineIds.filter((item: unknown): item is string => typeof item === "string") : [];
          const payableSnap = selectedTimelineIds.length
            ? await transaction.get(db.collection("jobTimelines").where("applicationId", "==", applicationSnap.id).where("status", "in", ["submitted", "approved"]).limit(80))
            : await transaction.get(db.collection("jobTimelines").where("applicationId", "==", applicationSnap.id).where("status", "in", ["submitted", "approved"]).limit(80));
          const payableDocs = selectedTimelineIds.length
            ? payableSnap.docs.filter(doc => selectedTimelineIds.includes(doc.id))
            : payableSnap.docs;
          const allTimelinesSnap = await transaction.get(db.collection("jobTimelines").where("jobId", "==", application.jobId).limit(120));
          if (!payableDocs.length) throw new AuthRouteError("Choose submitted timelines to pay.", 400);
          if (selectedTimelineIds.length && payableDocs.length !== selectedTimelineIds.length) throw new AuthRouteError("One or more selected timelines cannot be paid.", 400);
          const paidIds = new Set(payableDocs.map(doc => doc.id));
          const paidTimelineNumbers = payableDocs.map(doc => Number(doc.data().timelineNumber ?? 0)).filter(Number.isFinite);
          const paidTimelineRatingScopeId = `timeline:${applicationSnap.id}:${payableDocs.map(doc => doc.id).sort().join("-")}`;
          const allPaid = allTimelinesSnap.docs.every(doc => doc.data().status === "paid" || paidIds.has(doc.id));
          const grossAmount = payableDocs.reduce((sum, doc) => sum + Number(doc.data().clientAmount ?? 0), 0);
          const serviceFee = payableDocs.reduce((sum, doc) => sum + calculateServiceFee(Number(doc.data().clientAmount ?? 0)), 0);
          const workerEarnings = Math.max(0, grossAmount - serviceFee);
          const workerUserRef = db.collection("users").doc(String(application.workerId));
          payableDocs.forEach(doc => transaction.set(doc.ref, { status: "paid", approvedAt: FieldValue.serverTimestamp(), paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
          transaction.set(applicationRef, {
            status: allPaid ? "completed" : "accepted",
            paymentConfirmedAt: FieldValue.serverTimestamp(),
            grossAmount,
            workerEarnings,
            serviceFeeAmount: serviceFee,
            serviceFeeStatus: serviceFee > 0 ? "due" : "paid",
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          transaction.set(jobRef, { status: allPaid ? "completed" : "live", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          if (serviceFee > 0) {
            transaction.set(workerUserRef, {
              isLocked: true,
              outstandingServiceFee: FieldValue.increment(serviceFee),
              lockReason: "Service Fee Payment Required",
              updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
          }
          if (allPaid) {
            transaction.set(workerUserRef, { completedJobs: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            transaction.set(db.collection("users").doc(String(application.clientId)), { completedJobs: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          }
          const paymentUnit = String(job.durationUnit ?? "timeline").replace(/s$/, "") || "timeline";
          const paymentUnitTitle = paymentUnit.charAt(0).toUpperCase() + paymentUnit.slice(1);
          setNotification(transaction, db, {
            userId: String(application.workerId),
            type: "timeline_paid",
            title: `${paymentUnitTitle} paid`,
            message: `${payableDocs.length} ${paymentUnit} payment${payableDocs.length === 1 ? "" : "s"} marked paid for ${application.jobTitle ?? "your job"}. Service fee due: KES ${serviceFee.toLocaleString()}.`,
            link: "/dashboard",
            emailSubject: "Payment confirmed on COPIC",
            eventId: `application:${applicationSnap.id}:timeline-paid:${paidTimelineRatingScopeId}`
          });
          if (serviceFee > 0) {
            setNotification(transaction, db, {
              userId: String(application.workerId),
              type: "service_fee_due",
              title: "Account action required",
              message: `A ${paymentUnit} payment was marked paid. Pay the KES ${serviceFee.toLocaleString()} COPIC service fee to unlock your worker account and continue using COPIC.`,
              link: "/dashboard",
              emailSubject: "COPIC service fee due",
              eventId: `application:${applicationSnap.id}:timeline-service-fee-due:${paidTimelineRatingScopeId}`
            });
          }
          return { id: applicationSnap.id, ...application, status: allPaid ? "completed" : "accepted", workerLocked: serviceFee > 0, outstandingServiceFee: serviceFee, paidTimelineNumbers, paidTimelineRatingScopeId };
        }
        if (application.status !== "completion_requested") throw new AuthRouteError("The worker must request completion before you can mark payment as sent.", 400);
        const amount = Number(jobSnap.data()?.payAmount ?? jobSnap.data()?.rateAmount ?? application.jobAmount ?? 0);
        transaction.set(applicationRef, { status: "payment_sent", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (jobSnap.exists) transaction.set(jobRef, { status: "live", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        setNotification(transaction, db, {
          userId: String(application.workerId),
          type: "payment_sent",
          title: "Payment sent",
          message: `${application.jobTitle ?? "Your job"} has been paid directly by the client. Confirm only after the money has reached you.`,
          link: `/applications?application=${applicationRef.id}`,
          emailSubject: "Payment confirmation needed on COPIC",
          eventId: `application:${applicationSnap.id}:payment-sent`
        });
        serverDebug("Client marked direct worker payment sent", { applicationId, clientId: currentUser.uid, amount });
        return { id: applicationSnap.id, ...application, status: "payment_sent" };
      });
      await sendNotificationEmailsAfterCommit(db, [{
        userId: String((result as Record<string, unknown>).workerId ?? ""),
        type: "payment_sent",
        title: "Payment sent",
        message: `${String((result as Record<string, unknown>).jobTitle ?? "Your job")} has been paid directly by the client. Confirm only after the money has reached you.`,
        link: `/applications?application=${applicationId}`,
        emailSubject: "Payment confirmation needed on COPIC",
        eventId: `application:${applicationId}:payment-sent`
      }]);
      serverDebug("Application payment sent", { applicationId, clientId: currentUser.uid, status: result.status });
      return NextResponse.json({ success: true, application: result });
    }

    const result = await db.runTransaction(async transaction => {
      const applicationSnap = await transaction.get(applicationRef);
      if (!applicationSnap.exists) throw new AuthRouteError("Application was not found.", 404);
      const application = applicationSnap.data() ?? {};
      if (application.clientId !== currentUser.uid) throw new AuthRouteError("You can only accept applications for your own jobs.", 403);
      const jobRef = db.collection("jobs").doc(String(application.jobId));
      const jobSnap = await transaction.get(jobRef);
      if (!jobSnap.exists) throw new AuthRouteError("Job was not found.", 404);
      const job = jobSnap.data() ?? {};
      const workerId = String(application.workerId);
      const [workerSnap, identityVerificationSnap, driverLicenseVerificationSnap] = await Promise.all([
        transaction.get(db.collection("users").doc(workerId)),
        transaction.get(db.collection("verifications").doc(workerId)),
        transaction.get(db.collection("verifications").doc(`driver-license-${workerId}`))
      ]);
      const allowedWorker = getWorkerEligibilityFromVerification(getWorkerVerificationStatusFromRecords(
        workerId,
        workerSnap.exists ? workerSnap.data() : null,
        identityVerificationSnap.exists ? identityVerificationSnap.data() : null,
        driverLicenseVerificationSnap.exists ? driverLicenseVerificationSnap.data() : null
      ), {
        title: String(job.title ?? ""),
        category: String(job.category ?? ""),
        requiredSkills: Array.isArray(job.requiredSkills) ? job.requiredSkills.filter((item: unknown): item is string => typeof item === "string") : []
      });
      if (allowedWorker.decision === "blocked") throw new AuthRouteError(allowedWorker.reason, 403);
      const acceptedSnapshot = await transaction.get(db.collection("applications").where("jobId", "==", application.jobId).limit(120));
      const timelineSnap = isPayPerTimeline(String(job.payType))
        ? await transaction.get(db.collection("jobTimelines").where("jobId", "==", application.jobId).limit(120))
        : null;
      const alreadyAccepted = application.status === "accepted";
      const acceptedCount = acceptedSnapshot.docs.filter(doc => ["accepted", "completion_requested", "payment_sent"].includes(String(doc.data().status))).length;
      if (!alreadyAccepted && acceptedCount >= Number(job.workersNeeded ?? 1)) {
        throw new AuthRouteError("This job already has enough accepted workers.", 400);
      }
      transaction.set(applicationRef, { status: "accepted", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (timelineSnap) {
        timelineSnap.docs.forEach(doc => {
          if (!doc.data().applicationId) transaction.set(doc.ref, { applicationId: applicationSnap.id, workerId: application.workerId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
      }
      const conversationRef = db.collection("messages").doc(`${application.jobId}_${application.workerId}`);
      transaction.set(conversationRef, {
        id: conversationRef.id,
        jobId: application.jobId,
        clientId: application.clientId,
        workerId: application.workerId,
        locked: false,
        participants: [application.clientId, application.workerId],
        lastMessage: null,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      const nextAcceptedCount = acceptedCount + (alreadyAccepted ? 0 : 1);
      if (nextAcceptedCount >= Number(job.workersNeeded ?? 1)) {
        transaction.set(jobRef, { status: "live", assignedWorkerId: application.workerId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (Number(job.workersNeeded ?? 1) <= 1) {
          acceptedSnapshot.docs.forEach(doc => {
            if (doc.id !== applicationSnap.id && doc.data().status === "pending") {
              transaction.set(doc.ref, { status: "rejected", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
              setNotification(transaction, db, {
                userId: String(doc.data().workerId),
                type: "application_rejected",
                title: "Application rejected",
                message: `${application.jobTitle ?? "This job"} has already been filled.`,
                link: "/applications",
                emailSubject: "Application update on COPIC",
                eventId: `application:${doc.id}:rejected`
              });
            }
          });
        }
      }
      setNotification(transaction, db, {
        userId: String(application.workerId),
        type: "application_accepted",
        title: "Application accepted",
        message: `Your application for ${application.jobTitle ?? "a job"} was accepted.`,
        link: "/applications",
        emailSubject: "Your COPIC application was accepted",
        eventId: `application:${applicationSnap.id}:accepted`
      });
      return { id: applicationSnap.id, ...application, status: "accepted" };
    });
    await sendNotificationEmailsAfterCommit(db, [{
      userId: String((result as Record<string, unknown>).workerId ?? ""),
      type: "application_accepted",
      title: "Application accepted",
      message: `Your application for ${String((result as Record<string, unknown>).jobTitle ?? "a job")} was accepted.`,
      link: "/applications",
      emailSubject: "Your COPIC application was accepted",
      eventId: `application:${applicationId}:accepted`
    }]);
    return NextResponse.json({ success: true, application: result });
  } catch (error) {
    if (error instanceof CurrentUserProfileError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Unable to update application.";
    if (isQuotaError(message)) {
      return NextResponse.json({ error: "Firestore quota is exhausted right now. Please wait a few minutes before trying again." }, { status: 503 });
    }
    const status = error instanceof AuthRouteError ? error.status : error instanceof Error && error.message.includes("enough accepted workers") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function isQuotaError(message: string) {
  return message.includes("RESOURCE_EXHAUSTED") || message.includes("Quota exceeded");
}

class AuthRouteError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function timestampMillis(value: unknown) {
  return typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis: () => number }).toMillis()
    : 0;
}

async function enrichApplicationsWithWorkers(applications: Array<Record<string, unknown>>, role: "client" | "worker") {
  const db = adminDb();
  const workerIds = role === "client" ? [...new Set(applications.map(item => typeof item.workerId === "string" ? item.workerId : "").filter(Boolean))] : [];
  const clientIds: string[] = [];
  const jobIds = [...new Set(applications.map(item => typeof item.jobId === "string" ? item.jobId : "").filter(Boolean))];
  const workerSnaps = await Promise.all(workerIds.map(id => db.collection("users").doc(id).get()));
  const clientSnaps = await Promise.all(clientIds.map(id => db.collection("users").doc(id).get()));
  const jobSnaps = await Promise.all(jobIds.map(id => db.collection("jobs").doc(id).get()));
  const workers = new Map(workerSnaps.map(snap => [snap.id, snap.data() ?? {}]));
  const clients = new Map(clientSnaps.map(snap => [snap.id, snap.data() ?? {}]));
  const jobs = new Map(jobSnaps.map(snap => [snap.id, snap.data() ?? {}]));
  const timelineJobIds = jobIds.filter(id => isPayPerTimeline(String(jobs.get(id)?.payType ?? "")));
  const timelineSnaps = await Promise.all(timelineJobIds.map(id => db.collection("jobTimelines").where("jobId", "==", id).limit(120).get()));
  const timelines = new Map<string, Array<Record<string, unknown>>>(timelineSnaps.map((snap, index) => [timelineJobIds[index], snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))]));
  return applications
    .map<Record<string, unknown>>(application => {
      const worker = typeof application.workerId === "string" ? workers.get(application.workerId) : undefined;
      const client = typeof application.clientId === "string" ? clients.get(application.clientId) : undefined;
      const job = typeof application.jobId === "string" ? jobs.get(application.jobId) : undefined;
      const jobTimelines = typeof application.jobId === "string" ? timelines.get(application.jobId) ?? [] : [];
      const timelineCount = Math.max(1, Math.trunc(Number(job?.timelineCount ?? 1) || 1));
      const clientPayPerTimeline = Number(job?.clientPayPerTimeline ?? job?.payAmount ?? job?.rateAmount ?? 0);
      const timelineSummary = timelinePaymentSummary(clientPayPerTimeline, timelineCount);
      const workerPayPerTimeline = timelineSummary.workerPayPerTimeline;
      const paidTimelineCount = jobTimelines.filter(item => item.status === "paid").length;
      const submittedTimelineCount = jobTimelines.filter(item => item.status === "submitted").length;
      const pendingTimelineNumbers = jobTimelines.filter(item => item.status === "pending").map(item => Number(item.timelineNumber)).filter(Number.isFinite);
      const payableTimelineNumbers = jobTimelines.filter(item => item.status === "submitted" || item.status === "approved").map(item => Number(item.timelineNumber)).filter(Number.isFinite);
      return {
        ...application,
        jobCategory: typeof job?.category === "string" ? job.category : undefined,
        jobStatus: typeof job?.status === "string" ? job.status : undefined,
        jobAmount: Number(job?.payAmount ?? job?.rateAmount ?? 0),
        jobPayType: typeof job?.payType === "string" ? job.payType : undefined,
        jobDurationUnit: typeof job?.durationUnit === "string" ? job.durationUnit : undefined,
        timelineCount,
        clientPayPerTimeline,
        workerPayPerTimeline,
        totalClientAmount: Number(job?.totalClientAmount && Number(job.totalClientAmount) > 0 ? job.totalClientAmount : clientPayPerTimeline * timelineCount),
        totalWorkerAmount: timelineSummary.totalWorkerAmount,
        totalPlatformFee: timelineSummary.totalPlatformFee,
        paidTimelineCount,
        submittedTimelineCount,
        unpaidTimelineCount: Math.max(0, timelineCount - paidTimelineCount),
        nextTimelineNumber: pendingTimelineNumbers.length ? Math.min(...pendingTimelineNumbers) : undefined,
        nextPayableTimelineNumber: payableTimelineNumbers.length ? Math.min(...payableTimelineNumbers) : undefined,
        workerName: typeof worker?.displayName === "string" ? worker.displayName : undefined,
        workerEmail: typeof worker?.email === "string" ? worker.email : undefined,
        workerPhoneNumber: typeof worker?.phoneNumber === "string" ? worker.phoneNumber : undefined,
        workerSkills: Array.isArray(worker?.skills) ? worker.skills : [],
        workerCompletedJobs: Number(worker?.completedJobs ?? worker?.ratingCount ?? 0),
        workerRatingAverage: Number(worker?.ratingAverage ?? 0),
        workerRatingCount: Number(worker?.ratingCount ?? 0),
        clientName: typeof client?.displayName === "string" ? client.displayName : undefined,
        clientRatingAverage: Number(client?.ratingAverage ?? 0),
        clientRatingCount: Number(client?.ratingCount ?? 0),
        workerVerificationStatus: normalizeVerificationStatus(worker?.verificationStatus)
      };
    })
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
}

function sendNewApplicationEmail(clientEmail: string | undefined | null, jobTitle: string, workerName: string) {
  return sendAppEmail(clientEmail, "New application on Copic", `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2933;">
      <h1 style="font-size:22px;margin:0 0 12px;">New application</h1>
      <p>${escapeHtml(workerName)} applied for <strong>${escapeHtml(jobTitle)}</strong>.</p>
      <p>Open Copic to review the application and contact the worker.</p>
    </div>
  `);
}

function sendApplicationAcceptedEmail(workerEmail: string | undefined | null, jobTitle: string) {
  return sendAppEmail(workerEmail, "Your Copic application was accepted", `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2933;">
      <h1 style="font-size:22px;margin:0 0 12px;">Application accepted</h1>
      <p>Your application for <strong>${escapeHtml(jobTitle)}</strong> was accepted.</p>
      <p>Open Copic to chat with the employer and manage the job from your applications page.</p>
    </div>
  `);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] ?? char));
}
