import { profile } from "./auth";
export const campaign={id:"campaign-demo",name:"Nairobi Laundry TikTok September",service:"Laundry helper",rate:700,unit:"basket",targetLocation:"Nairobi",active:true,adSpend:12000};
export const funnel={link_clicked:12420,signup_started:3840,account_created:2910,skill_added:2507,id_verification_submitted:1834,id_verified:1521,first_job:473,first_completed_job:311};
export const fixtures:Record<string,unknown>={
 "/api/agent/program":{commissionRate:0.01},
 "/api/admin/sessions":{sessions:[]},
 "/api/admin/tickets":{tickets:[]},
 "/api/admin/service-fee-payments":{payments:[]},
 "/api/admin/stats":{users:12600,activeJobs:426,revenue:190000,reports:3,auditLogs:789,pendingVerifications:53,projectionReady:true,workers:8900,clients:5200,agents:400,verifiedUsers:7400,unverifiedUsers:5200,workersWithSkills:8100,workersWithoutSkills:800,totalSkills:19200,verifiedSkills:11000,unverifiedSkills:8200,applications:6000,liveJobs:1100,completedJobs:12840,jobsToday:31,approvedVerifications:7400,rejectedVerifications:30},
 "/api/admin/marketplace":{services:[{id:"laundry",name:"Laundry helper",category:"services_trades",workers:426,verifiedWorkers:291,unverifiedWorkers:135,availableWorkers:208,completedJobs:834},{id:"braiding",name:"House-call braiding and hair styling",category:"services_trades",workers:201,verifiedWorkers:110,unverifiedWorkers:91,availableWorkers:134}],nextCursor:"next-page"},
 "/api/admin/recruitment":{campaigns:[campaign],campaign,funnel,nextCursor:null},
 "/api/acquisition":{link:campaign},
 "/api/agent":{enabled:true,metrics:{...funnel,peopleReferred:2910,earnedCommission:24190.5,pendingCommission:4320,availableCommission:14900.5,paidCommission:4970},links:[{id:"agent-link",name:"Join COPIC as a Laundry worker"}],records:[{id:"commission-1",referredWorkerId:"demo-referred-worker",serviceId:"laundry",jobId:"job-demo",commissionAmount:10,status:"available"}],nextCursor:null},
 "/api/admin/agents":{records:[{id:"commission-1",displayName:"Demo Agent",agentId:"agent-demo",commissionAmount:10,earnedCommission:24190.5,status:"pending"}],nextCursor:null},
 "/api/admin/skills":{skills:[],nextCursor:"next-reviews"},
 "/api/admin/users":{users:[profile],nextCursor:"next-users"},
 "/api/admin/jobs":{jobs:[],applications:[],nextCursor:"next-jobs"},
 "/api/admin/verifications":{verifications:[{id:"demo-worker",userId:"demo-worker",kind:"identity",fullName:"Demo Worker",email:"demo@example.invalid",username:"demo-worker",role:"worker",phoneNumber:"Not shown in fixtures",status:"pending",skills:["Laundry helper"],createdAt:"2026-09-16T12:00:00Z",idFrontUrl:"",idBackUrl:"",selfieWithIdUrl:""},{id:"driver-license-demo",userId:"demo-driver",kind:"driver_license",fullName:"Demo Driver",username:"demo-driver",role:"worker",status:"pending",licenseNumber:"EXAMPLE ONLY",expiryDate:"2028-12-01T00:00:00Z",createdAt:"2026-09-16T13:00:00Z"}],nextCursor:null},
 "/api/admin/pricing":{policies:[]},
 "/api/profile/pricing":{completed:4,level:1,initial:{rate:700,unit:"basket"},policy:{recommendedRate:700,unit:"basket",newWorkerMin:700,newWorkerMax:700,establishedMin:525,establishedMax:875,widerPricingUnlockJobs:5,fullPricingUnlockJobs:15}},
 "/api/kyc/start":{verification:{status:"not_submitted"}}
};
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url,location.origin);if(!url.pathname.startsWith("/api/"))return originalFetch(input,init);const mode=new URLSearchParams(location.search).get("state");if(url.pathname==="/api/acquisition" && (!init?.method || init.method==="GET")){if(mode==="invalid")return new Response(JSON.stringify({error:"internal diagnostic must not appear"}),{status:410}); const agent=url.searchParams.get("type")==="agent_referral"; return new Response(JSON.stringify({link:{...campaign,service:mode==="general"?null:mode==="long"?"Professional household cleaning and housekeeping assistance":campaign.service,rate:agent?null:campaign.rate,unit:agent?null:campaign.unit,targetLocation:agent?null:campaign.targetLocation}}));}if(url.pathname==="/api/auth/admin-login")return new Response(JSON.stringify({error:"Invalid admin username or password."}),{status:401});if(mode==="error")return new Response(JSON.stringify({error:"Unable to load data. Check your connection and try again."}),{status:503});return new Response(JSON.stringify(init?.method&&init.method!=="GET"?{success:true,id:"fixture-link"}:fixtures[url.pathname]??{}),{headers:{"Content-Type":"application/json"}});};
