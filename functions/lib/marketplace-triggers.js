"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketplaceJobChanged = exports.marketplaceApplicationChanged = exports.marketplaceVerificationChanged = exports.marketplaceUserChanged = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const marketplace_projections_1 = require("./marketplace-projections");
const marketplace_completions_1 = require("./marketplace-completions");
exports.marketplaceUserChanged = (0, firestore_1.onDocumentWritten)("users/{uid}", async (event) => {
    const db = (0, firestore_2.getFirestore)(), uid = event.params.uid;
    await (0, marketplace_projections_1.syncMarketplaceUser)(db, uid);
    const user = (await db.doc(`users/${uid}`).get()).data();
    if (user?.skillProfiles?.length || user?.skills?.length)
        await (0, marketplace_projections_1.recordFunnel)(db, uid, "skill_added");
});
exports.marketplaceVerificationChanged = (0, firestore_1.onDocumentWritten)("verifications/{id}", async (event) => {
    const db = (0, firestore_2.getFirestore)(), record = (await db.doc(`verifications/${event.params.id}`).get()).data();
    if (!record?.userId || record.kind === "driver_license" || event.params.id.startsWith("driver-license-"))
        return;
    await (0, marketplace_projections_1.recordFunnel)(db, record.userId, "id_verification_submitted");
    if (record.status === "approved")
        await (0, marketplace_projections_1.recordFunnel)(db, record.userId, "id_verified");
});
exports.marketplaceApplicationChanged = (0, firestore_1.onDocumentWritten)("applications/{id}", async (event) => {
    const db = (0, firestore_2.getFirestore)(), app = (await db.doc(`applications/${event.params.id}`).get()).data();
    if (!app?.workerId)
        return;
    if (app.source !== "direct_hire")
        await (0, marketplace_projections_1.recordFunnel)(db, app.workerId, "first_application");
    if (["accepted", "completion_requested", "payment_sent", "completed"].includes(app.status))
        await (0, marketplace_projections_1.recordFunnel)(db, app.workerId, "first_job");
    if (app.status === "completed" && app.paymentConfirmedAt && !app.refunded && !app.fraudulent && !app.invalid) {
        const job = (await db.doc(`jobs/${app.jobId}`).get()).data();
        if (job?.status === "completed" && job.recurrenceStatus !== "cancelled" && !job.refunded && !job.fraudulent && !job.invalid)
            await (0, marketplace_projections_1.recordFunnel)(db, app.workerId, "first_completed_job");
    }
    await (0, marketplace_completions_1.reconcileCompletedApplication)(db, event.params.id);
});
exports.marketplaceJobChanged = (0, firestore_1.onDocumentWritten)("jobs/{id}", async (event) => {
    const db = (0, firestore_2.getFirestore)();
    const before = event.data?.before.data(), after = event.data?.after.data();
    if (before?.status === after?.status && before?.refunded === after?.refunded && before?.fraudulent === after?.fraudulent && before?.invalid === after?.invalid && before?.recurrenceStatus === after?.recurrenceStatus)
        return;
    // Job creation has no completed applications to reconcile.
    if (!before)
        return;
    const applications = await db.collection("applications").where("jobId", "==", event.params.id).get();
    for (const application of applications.docs) {
        await (0, marketplace_completions_1.reconcileCompletedApplication)(db, application.id);
        const app = application.data();
        if (app.workerId && app.status === "completed" && app.paymentConfirmedAt && !app.refunded && !app.fraudulent && !app.invalid && after?.status === "completed" && after.recurrenceStatus !== "cancelled" && !after.refunded && !after.fraudulent && !after.invalid)
            await (0, marketplace_projections_1.recordFunnel)(db, app.workerId, "first_completed_job");
    }
});
//# sourceMappingURL=marketplace-triggers.js.map