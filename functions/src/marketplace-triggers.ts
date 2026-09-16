import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { syncMarketplaceUser,recordFunnel } from "./marketplace-projections";
import { reconcileCompletedApplication } from "./marketplace-completions";

export const marketplaceUserChanged=onDocumentWritten("users/{uid}",async event=>{
  const db=getFirestore(),uid=event.params.uid;
  await syncMarketplaceUser(db,uid);
  const user=(await db.doc(`users/${uid}`).get()).data();
  if(user?.skillProfiles?.length||user?.skills?.length)await recordFunnel(db,uid,"skill_added");
});
export const marketplaceVerificationChanged=onDocumentWritten("verifications/{id}",async event=>{
  const db=getFirestore(),record=(await db.doc(`verifications/${event.params.id}`).get()).data();
  if(!record?.userId||record.kind==="driver_license"||event.params.id.startsWith("driver-license-"))return;
  await recordFunnel(db,record.userId,"id_verification_submitted");
  if(record.status==="approved")await recordFunnel(db,record.userId,"id_verified");
});
export const marketplaceApplicationChanged=onDocumentWritten("applications/{id}",async event=>{
  const db=getFirestore(),app=(await db.doc(`applications/${event.params.id}`).get()).data();
  if(!app?.workerId)return;
  if(app.source!=="direct_hire")await recordFunnel(db,app.workerId,"first_application");
  if(["accepted","completion_requested","payment_sent","completed"].includes(app.status))await recordFunnel(db,app.workerId,"first_job");
  if(app.status==="completed"&&app.paymentConfirmedAt&&!app.refunded&&!app.fraudulent&&!app.invalid){const job=(await db.doc(`jobs/${app.jobId}`).get()).data();if(job?.status==="completed"&&job.recurrenceStatus!=="cancelled"&&!job.refunded&&!job.fraudulent&&!job.invalid)await recordFunnel(db,app.workerId,"first_completed_job");}
  await reconcileCompletedApplication(db,event.params.id);
});
export const marketplaceJobChanged=onDocumentWritten("jobs/{id}",async event=>{
  const db=getFirestore();
  const before=event.data?.before.data(),after=event.data?.after.data();
  if(before?.status===after?.status&&before?.refunded===after?.refunded&&before?.fraudulent===after?.fraudulent&&before?.invalid===after?.invalid&&before?.recurrenceStatus===after?.recurrenceStatus)return;
  // Job creation has no completed applications to reconcile.
  if(!before)return;
  const applications=await db.collection("applications").where("jobId","==",event.params.id).get();
  for(const application of applications.docs) {
    await reconcileCompletedApplication(db,application.id);
    const app=application.data();
    if(app.workerId&&app.status==="completed"&&app.paymentConfirmedAt&&!app.refunded&&!app.fraudulent&&!app.invalid&&after?.status==="completed"&&after.recurrenceStatus!=="cancelled"&&!after.refunded&&!after.fraudulent&&!after.invalid)await recordFunnel(db,app.workerId,"first_completed_job");
  }
});
