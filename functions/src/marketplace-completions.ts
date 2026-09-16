import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { commissionAmount, serviceKey, timestampMillis } from "./marketplace-policy";

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
async function reconcileCommission(db:Firestore,applicationId:string) {
  await db.runTransaction(async tx=>{
    const app=(await tx.get(db.doc(`applications/${applicationId}`))).data();if(!app?.jobId||!app.workerId)return;
    const key=`${app.jobId}_${app.workerId}`;
    const [jobSnap,workerSnap,referralSnap,identitySnap,configSnap,ledgerSnap,stateSnap]=await Promise.all([tx.get(db.doc(`jobs/${app.jobId}`)),tx.get(db.doc(`users/${app.workerId}`)),tx.get(db.doc(`agentReferrals/${app.workerId}`)),tx.get(db.doc(`verifications/${app.workerId}`)),tx.get(db.doc("marketplaceConfig/agents")),tx.get(db.doc(`commissionLedger/${key}`)),tx.get(db.doc(`commissionStates/${key}`))]);
    const job=jobSnap.data(),worker=workerSnap.data(),referral=referralSnap.data(),identity=identitySnap.data();if(!job||!worker)return;
    const valid=app.status==="completed"&&!!app.paymentConfirmedAt&&job.status==="completed"&&!app.fraudulent&&!app.refunded&&!app.invalid&&!job.fraudulent&&!job.refunded&&!job.invalid&&job.recurrenceStatus!=="cancelled";
    if(ledgerSnap.exists){
      if(ledgerSnap.data()?.applicationId!==applicationId)return;
      if(!valid&&stateSnap.data()?.status!=="reversed"){
        const ledger=ledgerSnap.data()!,previous=String(stateSnap.data()?.status??"pending");
        tx.set(db.doc(`commissionStates/${key}`),{status:"reversed",reversedAt:FieldValue.serverTimestamp()},{merge:true});
        tx.create(db.doc(`commissionEvents/${key}_reversed`),{commissionId:key,status:"reversed",reason:"Source job invalidated",createdAt:FieldValue.serverTimestamp()});
        tx.set(db.doc(`agentMetrics/${ledger.agentId}`),{[`${previous}Commission`]:FieldValue.increment(-Number(ledger.commissionAmount)),reversedCommission:FieldValue.increment(Number(ledger.commissionAmount)),earnedCommission:FieldValue.increment(-Number(ledger.commissionAmount))},{merge:true});
      }return;
    }
    if(!valid||!referral||timestampMillis(app.createdAt)<timestampMillis(referral.referredAt)||referral.agentId===app.workerId||worker.agentEnabled||identity?.status!=="approved"||!identity.nationalIdHash)return;
    const [agent,claim]=await Promise.all([tx.get(db.doc(`users/${referral.agentId}`)),tx.get(db.doc(`identityClaims/${identity.nationalIdHash}`))]);
    if(!agent.data()?.agentEnabled||agent.data()?.isLocked||claim.data()?.userId!==app.workerId)return;
    let earnings=Number(app.workerEarnings??0);
    if(["timeline","pay_per_timeline"].includes(String(job.payType))){
      const timelines=await tx.get(db.collection("jobTimelines").where("jobId","==",app.jobId));
      const relevant=timelines.docs.map(doc=>doc.data()).filter(item=>item.workerId===app.workerId || item.applicationId===applicationId);
      if(!relevant.length||relevant.some(item=>item.status!=="paid"))return;
      earnings=relevant.reduce((sum,item)=>sum+Number(item.workerAmount??0),0);
    }
    const rate=Number(configSnap.data()?.commissionRate??0.01),amount=commissionAmount(earnings,rate);if(!amount)return;
    tx.create(db.doc(`commissionLedger/${key}`),{commissionId:key,jobId:app.jobId,applicationId,workerId:app.workerId,agentId:referral.agentId,eligibleWorkerAmount:earnings,commissionRate:rate,commissionAmount:amount,status:"pending",createdAt:FieldValue.serverTimestamp()});
    tx.create(db.doc(`commissionStates/${key}`),{status:"pending",createdAt:FieldValue.serverTimestamp()});
    tx.create(db.doc(`commissionEvents/${key}_pending`),{commissionId:key,status:"pending",createdAt:FieldValue.serverTimestamp()});
    tx.set(db.doc(`agentMetrics/${referral.agentId}`),{pendingCommission:FieldValue.increment(amount),earnedCommission:FieldValue.increment(amount)},{merge:true});
  });
}
