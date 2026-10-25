import { reconcileCommission } from "./dual-agent-commissions";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { serviceKey } from "./marketplace-policy";

/** Reconcile from authoritative records; one earned entry per job+worker, never per delivery. */
export async function reconcileCompletedApplication(db: Firestore, applicationId: string) {
  await db.runTransaction(async tx => {
    const applicationSnap=await tx.get(db.doc(`applications/${applicationId}`));
    const app=applicationSnap.data(); if(!app?.jobId||!app.workerId)return;
    const workerId=String(app.workerId),jobId=String(app.jobId),key=`${jobId}_${workerId}`;
    const [jobSnap,workerSnap,completionSnap]=await Promise.all([
      tx.get(db.doc(`jobs/${jobId}`)),tx.get(db.doc(`users/${workerId}`)),tx.get(db.doc(`serviceCompletions/${key}`))
    ]);
    const job=jobSnap.data(),worker=workerSnap.data();
    if(!job||!worker)return;
    let valid=app.status==="completed" && !!app.paymentConfirmedAt && job.status==="completed" && !app.fraudulent && !app.refunded && !app.invalid && !job.fraudulent && !job.refunded && !job.invalid && job.recurrenceStatus!=="cancelled";
    if(valid && ["timeline","pay_per_timeline"].includes(String(job.payType))) {
      const timelines=await tx.get(db.collection("jobTimelines").where("jobId","==",jobId));
      const relevant=timelines.docs.map(doc=>doc.data()).filter(item=>item.workerId===workerId || item.applicationId===applicationId);
      valid=relevant.length>0 && relevant.every(item=>item.status==="paid");
    }
    const skills=(worker.skillProfiles??[]) as Array<{id:string;name:string}>;
    const names=[app.requestSkillName,job.serviceName,...(Array.isArray(job.requiredSkills)?job.requiredSkills:[]),job.title].filter((value):value is string=>typeof value==="string");
    const matching=skills.filter(skill=>names.some(name=>serviceKey(name)===serviceKey(skill.name)) || job.serviceId===serviceKey(skill.name));
    const serviceId=app.requestSkillName?serviceKey(String(app.requestSkillName)):matching.length===1?serviceKey(matching[0].name):null;
    const previous=completionSnap.data();
    if(previous?.applicationId && previous.applicationId!==applicationId)return;
    const active=!!previous?.eligible;
    // Existing ambiguous legacy jobs are not credited to an unrelated service.
    if((valid&&serviceId&&!active)||(!valid&&active)) {
      const id=String(previous?.serviceId??serviceId),amount=valid?1:-1;
      tx.set(db.doc(`workerServiceProgress/${workerId}_${id}`),{workerId,serviceId:id,completedJobs:FieldValue.increment(amount),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      tx.set(db.doc(`marketplaceServices/${id}`),{completedJobs:FieldValue.increment(amount)},{merge:true});
      tx.set(db.doc(`serviceCompletions/${key}`),{workerId,jobId,serviceId:id,applicationId,eligible:valid,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    }

  });
  await reconcileCommission(db,applicationId);
}
