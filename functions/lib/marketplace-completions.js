"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileCompletedApplication = reconcileCompletedApplication;
const dual_agent_commissions_1 = require("./dual-agent-commissions");
const firestore_1 = require("firebase-admin/firestore");
const marketplace_policy_1 = require("./marketplace-policy");
/** Reconcile from authoritative records; one earned entry per job+worker, never per delivery. */
async function reconcileCompletedApplication(db, applicationId) {
    await db.runTransaction(async (tx) => {
        const applicationSnap = await tx.get(db.doc(`applications/${applicationId}`));
        const app = applicationSnap.data();
        if (!app?.jobId || !app.workerId)
            return;
        const workerId = String(app.workerId), jobId = String(app.jobId), key = `${jobId}_${workerId}`;
        const [jobSnap, workerSnap, completionSnap] = await Promise.all([
            tx.get(db.doc(`jobs/${jobId}`)), tx.get(db.doc(`users/${workerId}`)), tx.get(db.doc(`serviceCompletions/${key}`))
        ]);
        const job = jobSnap.data(), worker = workerSnap.data();
        if (!job || !worker)
            return;
        let valid = app.status === "completed" && !!app.paymentConfirmedAt && job.status === "completed" && !app.fraudulent && !app.refunded && !app.invalid && !job.fraudulent && !job.refunded && !job.invalid && job.recurrenceStatus !== "cancelled";
        if (valid && ["timeline", "pay_per_timeline"].includes(String(job.payType))) {
            const timelines = await tx.get(db.collection("jobTimelines").where("jobId", "==", jobId));
            const relevant = timelines.docs.map(doc => doc.data()).filter(item => item.workerId === workerId || item.applicationId === applicationId);
            valid = relevant.length > 0 && relevant.every(item => item.status === "paid");
        }
        const skills = (worker.skillProfiles ?? []);
        const names = [app.requestSkillName, job.serviceName, ...(Array.isArray(job.requiredSkills) ? job.requiredSkills : []), job.title].filter((value) => typeof value === "string");
        const matching = skills.filter(skill => names.some(name => (0, marketplace_policy_1.serviceKey)(name) === (0, marketplace_policy_1.serviceKey)(skill.name)) || job.serviceId === (0, marketplace_policy_1.serviceKey)(skill.name));
        const serviceId = app.requestSkillName ? (0, marketplace_policy_1.serviceKey)(String(app.requestSkillName)) : matching.length === 1 ? (0, marketplace_policy_1.serviceKey)(matching[0].name) : null;
        const previous = completionSnap.data();
        if (previous?.applicationId && previous.applicationId !== applicationId)
            return;
        const active = !!previous?.eligible;
        // Existing ambiguous legacy jobs are not credited to an unrelated service.
        if ((valid && serviceId && !active) || (!valid && active)) {
            const id = String(previous?.serviceId ?? serviceId), amount = valid ? 1 : -1;
            tx.set(db.doc(`workerServiceProgress/${workerId}_${id}`), { workerId, serviceId: id, completedJobs: firestore_1.FieldValue.increment(amount), updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
            tx.set(db.doc(`marketplaceServices/${id}`), { completedJobs: firestore_1.FieldValue.increment(amount) }, { merge: true });
            tx.set(db.doc(`serviceCompletions/${key}`), { workerId, jobId, serviceId: id, applicationId, eligible: valid, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
        }
    });
    await (0, dual_agent_commissions_1.reconcileCommission)(db, applicationId);
}
//# sourceMappingURL=marketplace-completions.js.map