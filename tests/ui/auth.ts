import type { UserProfile } from "@/types";
export const profile:UserProfile={id:"demo-worker",uid:"demo-worker",role:location.pathname.startsWith("/admin")?"admin":new URLSearchParams(location.search).get("state")==="client"?"client":"worker",roles:["worker","client"],agentEnabled:new URLSearchParams(location.search).get("state")==="existing-agent" || location.pathname.startsWith("/agent"),displayName:"Demo Worker",email:"demo@example.invalid",emailVerified:true,skills:["Laundry helper"],skillProfiles:[],certificates:[],workHistory:[],ratingAverage:4.8,ratingCount:20,completedJobs:15,verificationStatus:"pending",profileCompleted:true,isLocked:false,outstandingServiceFee:0,badges:[],createdAt:null,updatedAt:null};
const fixtureState=new URLSearchParams(location.search).get("state");
if(fixtureState==="unverified")sessionStorage.setItem("fixture.verification","pending");
else if(fixtureState)sessionStorage.removeItem("fixture.verification");
let verificationChecks=0;
export const user={uid:profile.uid,displayName:profile.displayName,email:profile.email,emailVerified:sessionStorage.getItem("fixture.verification")!=="pending",reload:async()=>{if(location.pathname==="/verify-email" && new URLSearchParams(location.search).get("verification")!=="pending" && ++verificationChecks>1){user.emailVerified=true;sessionStorage.removeItem("fixture.verification");}},getIdToken:async()=>"local-ui-fixture"};
export const refreshProfile=async()=>undefined;
export function useAuth(){return {user:new URLSearchParams(location.search).get("state")==="guest"?null:user,profile:new URLSearchParams(location.search).get("state")==="guest"?null:profile,refreshProfile,loading:false,homePath:"/dashboard"};}
