"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileCommission = reconcileCommission;
const firestore_1 = require("firebase-admin/firestore");
const agent_policy_1 = require("./agent-policy");
const marketplace_policy_1 = require("./marketplace-policy");
/** Existing worker ledger identities are preserved. Multi-worker jobs settle per assignment. */
async function reconcileCommission(db, applicationId) {
    await db.runTransaction(async (tx) => {
        const app = (await tx.get(db.doc(`applications/${applicationId}`))).data();
        if (!app?.jobId || !app.workerId)
            return;
        const base = `${app.jobId}_${app.workerId}`;
        const [jobSnap, workerSnap, referralSnap, identitySnap, timelines, disputes, reports] = await Promise.all([
            tx.get(db.doc(`jobs/${app.jobId}`)), tx.get(db.doc(`users/${app.workerId}`)),
            tx.get(db.doc(`agentReferrals/${app.workerId}`)), tx.get(db.doc(`verifications/${app.workerId}`)),
            tx.get(db.collection("jobTimelines").where("jobId", "==", app.jobId)),
            tx.get(db.collection("disputes").where("jobId", "==", app.jobId)),
            tx.get(db.collection("reports").where("relatedJobId", "==", app.jobId))
        ]);
        const job = jobSnap.data(), worker = workerSnap.data(), referral = referralSnap.data(), identity = identitySnap.data();
        if (!job || !worker)
            return;
        const relevant = timelines.docs.map(doc => doc.data()).filter(item => item.workerId === app.workerId || item.applicationId === applicationId);
        const timeline = ["timeline", "pay_per_timeline"].includes(String(job.payType));
        let valid = (0, agent_policy_1.settled)(app) && !!app.paymentConfirmedAt && (0, agent_policy_1.settled)(job)
            && !disputes.docs.some(doc => (0, agent_policy_1.unresolvedIssue)(doc.data(), job.clientId, app.workerId, "createdBy"))
            && !reports.docs.some(doc => (0, agent_policy_1.unresolvedIssue)(doc.data(), job.clientId, app.workerId, "userId"))
            && (!timeline || relevant.length > 0 && relevant.every(item => item.status === "paid"));
        // Financial values are finalized by the existing two-party payment workflow.
        const earnings = timeline ? relevant.reduce((sum, item) => sum + Number(item.workerAmount ?? 0), 0) : Number(app.workerEarnings ?? 0);
        const gross = timeline ? relevant.reduce((sum, item) => sum + Number(item.clientAmount ?? Number(item.workerAmount ?? 0) + Number(item.platformFee ?? 0)), 0) : Number(app.grossAmount ?? earnings + Number(app.serviceFeeAmount ?? 0));
        const fee = timeline ? relevant.reduce((sum, item) => sum + Number(item.platformFee ?? Number(item.clientAmount ?? item.workerAmount ?? 0) - Number(item.workerAmount ?? 0)), 0) : Number(app.serviceFeeAmount ?? 0);
        let money = { netMinor: 0, commissionMinor: 0, commissionAmount: 0 };
        try {
            money = (0, agent_policy_1.agentMoney)(earnings);
        }
        catch {
            valid = false;
        }
        valid = valid && Number.isFinite(gross) && gross >= 0 && Number.isFinite(fee) && fee >= 0;
        const roles = [
            { role: "WORKER_AGENT", key: base, agentId: String(referral?.agentId ?? ""), reference: `agentReferrals/${app.workerId}`,
                eligible: !!referral && (0, marketplace_policy_1.timestampMillis)(app.createdAt) >= (0, marketplace_policy_1.timestampMillis)(referral.referredAt) && !worker.agentEnabled },
            { role: "CLIENT_AGENT", key: `${base}_CLIENT_AGENT`, agentId: String(job.clientAgent?.agentId ?? ""), reference: String(job.clientAgent?.reference ?? ""),
                eligible: job.clientAgent?.status === "approved" && job.clientAgent?.clientUid === job.clientId }
        ];
        const claim = identity?.nationalIdHash ? (await tx.get(db.doc(`identityClaims/${identity.nationalIdHash}`))).data() : null;
        // Read every role before writing either role (Firestore transactions require this).
        const records = await Promise.all(roles.map(async (role) => {
            const [ledger, state, agent] = await Promise.all([
                tx.get(db.doc(`commissionLedger/${role.key}`)), tx.get(db.doc(`commissionStates/${role.key}`)),
                role.agentId ? tx.get(db.doc(`users/${role.agentId}`)) : Promise.resolve(null)
            ]);
            return { ...role, ledger: ledger.data(), state: state.data(), agent: agent?.data() };
        }));
        for (const record of records) {
            const { key, role, agentId, ledger, state } = record;
            if (ledger?.applicationId && ledger.applicationId !== applicationId)
                continue;
            const eligible = valid && record.eligible && (0, agent_policy_1.activeAgent)(record.agent)
                && agentId !== app.workerId && agentId !== job.clientId && app.workerId !== job.clientId
                && identity?.status === "approved" && claim?.userId === app.workerId;
            const previous = String(state?.status ?? ledger?.status ?? "pending");
            const originalAmount = Number(state?.commissionAmount ?? ledger?.commissionAmount ?? 0);
            if (ledger) {
                // Reversals preserve the original ledger. A changed settled amount needs audited review.
                const changed = ledger.roleType && Number(state?.eligibleWorkerAmount ?? ledger.eligibleWorkerAmount) !== earnings;
                if ((!valid || changed) && previous !== "reversed") {
                    tx.set(db.doc(`commissionStates/${key}`), { status: "reversed", reversedFrom: previous, reversedAt: firestore_1.FieldValue.serverTimestamp(), requiresReview: true, revisedWorkerNetMinor: money.netMinor }, { merge: true });
                    tx.create(db.doc(`commissionEvents/${key}_reversed`), { commissionId: key, agentId: ledger.agentId, roleType: role, status: "reversed", reason: changed ? "Settled value changed; administrative correction required" : "Source payment invalidated", previous, amount: originalAmount, createdAt: firestore_1.FieldValue.serverTimestamp() });
                    tx.set(db.doc(`agentMetrics/${ledger.agentId}`), { [`${previous}Commission`]: firestore_1.FieldValue.increment(-originalAmount), reversedCommission: firestore_1.FieldValue.increment(originalAmount), earnedCommission: firestore_1.FieldValue.increment(-originalAmount) }, { merge: true });
                }
                continue;
            }
            if (!eligible || !money.commissionMinor)
                continue;
            tx.create(db.doc(`commissionLedger/${key}`), {
                commissionId: key, jobId: app.jobId, applicationId, workerId: app.workerId, agentId, roleType: role,
                attributionReference: record.reference, grossJobAmount: gross, copicFeeAmount: fee,
                eligibleWorkerAmount: earnings, eligibleWorkerNetMinor: money.netMinor, commissionMinor: money.commissionMinor,
                commissionRate: 0.01, commissionAmount: money.commissionAmount, rounding: "KES minor units, half-up",
                financialAmountsComplete: timeline ? relevant.every(item => item.clientAmount != null && item.platformFee != null) : app.grossAmount != null && app.serviceFeeAmount != null,
                fundingSource: "copic_fee_revenue", status: "pending", createdAt: firestore_1.FieldValue.serverTimestamp(), eligibleAt: firestore_1.FieldValue.serverTimestamp()
            });
            tx.create(db.doc(`commissionStates/${key}`), { status: "pending", createdAt: firestore_1.FieldValue.serverTimestamp() });
            tx.create(db.doc(`commissionEvents/${key}_pending`), { commissionId: key, agentId, roleType: role, status: "pending", createdAt: firestore_1.FieldValue.serverTimestamp() });
            tx.set(db.doc(`agentMetrics/${agentId}`), { pendingCommission: firestore_1.FieldValue.increment(money.commissionAmount), earnedCommission: firestore_1.FieldValue.increment(money.commissionAmount) }, { merge: true });
        }
    });
}
//# sourceMappingURL=dual-agent-commissions.js.map