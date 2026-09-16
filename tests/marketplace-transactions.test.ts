import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryFirestore } from "./memory-firestore";
import { syncMarketplaceUser,recordFunnel } from "../functions/src/marketplace-projections";
import { reconcileCompletedApplication } from "../functions/src/marketplace-completions";

function fixture(){return new MemoryFirestore()
.seed("users/worker",{role:"worker",skillProfiles:[{id:"laundry",name:"Laundry"},{id:"barber",name:"Barber"}],verificationStatus:"approved"})
.seed("users/agent",{agentEnabled:true})
.seed("jobs/job",{title:"Laundry",status:"completed",payType:"fixed"})
.seed("applications/application",{jobId:"job",workerId:"worker",requestSkillName:"Laundry",status:"completed",paymentConfirmedAt:"2026-09-25",createdAt:"2026-09-20",workerEarnings:1000})
.seed("agentReferrals/worker",{agentId:"agent",referredAt:"2026-09-19"})
.seed("verifications/worker",{status:"approved",nationalIdHash:"unique-hash"})
.seed("identityClaims/unique-hash",{userId:"worker"});}

test("duplicate and reordered user events keep service and map counts exact",async()=>{
 const memory=new MemoryFirestore().seed("users/u",{role:"worker",roles:["worker","client"],verificationStatus:"pending",location:{latitude:-1.2,longitude:36.8},skillProfiles:[{name:"Laundry",category:"services_trades",verificationStatus:"pending"}]});const db=memory.asFirestore();
 await syncMarketplaceUser(db,"u");await syncMarketplaceUser(db,"u");assert.equal(memory.records.get("marketplaceMetrics/overview")?.users,1);assert.equal(memory.records.get("marketplaceServices/laundry")?.workers,1);
 memory.records.get("users/u")!.verificationStatus="approved";await syncMarketplaceUser(db,"u");await syncMarketplaceUser(db,"u");assert.equal(memory.records.get("marketplaceServices/laundry")?.verifiedWorkers,1);assert.equal(memory.records.get("marketplaceServices/laundry")?.unverifiedWorkers,0);
 memory.records.delete("users/u");await syncMarketplaceUser(db,"u");assert.equal(memory.records.get("marketplaceMetrics/overview")?.users,0);assert.equal(memory.records.get("marketplaceServices/laundry")?.workers,0);
});
test("financial delivery replay creates one immutable commission and one service completion",async()=>{
 const memory=fixture(),db=memory.asFirestore();await reconcileCompletedApplication(db,"application");await reconcileCompletedApplication(db,"application");
 assert.equal(memory.records.get("commissionLedger/job_worker")?.commissionAmount,10);assert.equal(memory.records.get("agentMetrics/agent")?.pendingCommission,10);assert.equal(memory.records.get("workerServiceProgress/worker_laundry")?.completedJobs,1);assert.equal(memory.records.has("workerServiceProgress/worker_barber"),false);
 memory.seed("marketplaceConfig/agents",{commissionRate:0.5});await reconcileCompletedApplication(db,"application");assert.equal(memory.records.get("commissionLedger/job_worker")?.commissionAmount,10);
});
test("refund reverses balances and progression once, preserving original ledger amounts",async()=>{
 const memory=fixture(),db=memory.asFirestore();await reconcileCompletedApplication(db,"application");memory.records.get("jobs/job")!.refunded=true;await reconcileCompletedApplication(db,"application");await reconcileCompletedApplication(db,"application");assert.equal(memory.records.get("commissionStates/job_worker")?.status,"reversed");assert.equal(memory.records.get("commissionLedger/job_worker")?.commissionAmount,10);assert.equal(memory.records.get("agentMetrics/agent")?.pendingCommission,0);assert.equal(memory.records.get("workerServiceProgress/worker_laundry")?.completedJobs,0);
});
test("self-referrals, agent workers, duplicate identity and unconfirmed earnings generate no commission",async()=>{
 for(const scenario of ["self","agent-worker","duplicate-id","unconfirmed","cancelled"]){const memory=fixture();if(scenario==="self")memory.records.get("agentReferrals/worker")!.agentId="worker";if(scenario==="agent-worker")memory.records.get("users/worker")!.agentEnabled=true;if(scenario==="duplicate-id")memory.records.get("identityClaims/unique-hash")!.userId="other";if(scenario==="unconfirmed")memory.records.get("applications/application")!.paymentConfirmedAt=null;if(scenario==="cancelled")memory.records.get("jobs/job")!.status="cancelled";await reconcileCompletedApplication(memory.asFirestore(),"application");assert.equal(memory.records.has("commissionLedger/job_worker"),false,scenario);}
});
test("timeline commission sums every paid worker timeline instead of the last payment batch",async()=>{
 const memory=fixture();memory.records.get("jobs/job")!.payType="pay_per_timeline";memory.seed("jobTimelines/one",{jobId:"job",workerId:"worker",status:"paid",workerAmount:1000});memory.seed("jobTimelines/two",{jobId:"job",workerId:"worker",status:"paid",workerAmount:2000});await reconcileCompletedApplication(memory.asFirestore(),"application");assert.equal(memory.records.get("commissionLedger/job_worker")?.eligibleWorkerAmount,3000);assert.equal(memory.records.get("commissionLedger/job_worker")?.commissionAmount,30);
});
test("a second application cannot reverse a legitimate completion for the same job and worker",async()=>{const memory=fixture();await reconcileCompletedApplication(memory.asFirestore(),"application");memory.seed("applications/other",{jobId:"job",workerId:"worker",status:"pending"});await reconcileCompletedApplication(memory.asFirestore(),"other");assert.equal(memory.records.get("commissionStates/job_worker")?.status,"pending");assert.equal(memory.records.get("workerServiceProgress/worker_laundry")?.completedJobs,1);});
test("funnel transitions are durable, source-specific and idempotent",async()=>{const memory=new MemoryFirestore().seed("acquisitionAttributions/u",{sourceType:"agent_referral",sourceId:"link",agentId:"agent"});await recordFunnel(memory.asFirestore(),"u","id_verified");await recordFunnel(memory.asFirestore(),"u","id_verified");assert.equal(memory.records.get("acquisitionFunnels/agent_referral_link")?.id_verified,1);assert.equal(memory.records.get("agentMetrics/agent")?.id_verified,1);assert.equal(memory.records.has("acquisitionFunnels/admin_campaign_link"),false);});

test("unpaid timelines do not advance service pricing or commission",async()=>{
 const memory=fixture();memory.records.get("jobs/job")!.payType="pay_per_timeline";
 memory.seed("jobTimelines/one",{jobId:"job",workerId:"worker",status:"paid",workerAmount:1000});
 memory.seed("jobTimelines/two",{jobId:"job",workerId:"worker",status:"pending",workerAmount:2000});
 await reconcileCompletedApplication(memory.asFirestore(),"application");
 assert.equal(memory.records.has("workerServiceProgress/worker_laundry"),false);
 assert.equal(memory.records.has("commissionLedger/job_worker"),false);
});
