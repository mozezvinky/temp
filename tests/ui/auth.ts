import type { UserProfile } from "@/types";
export const profile:UserProfile={id:"demo-worker",uid:"demo-worker",role:location.pathname.startsWith("/admin")?"admin":"worker",roles:["worker","client"],agentEnabled:true,displayName:"Demo Worker",email:"demo@example.invalid",emailVerified:true,skills:["Laundry helper"],skillProfiles:[],certificates:[],workHistory:[],ratingAverage:4.8,ratingCount:20,completedJobs:15,verificationStatus:"pending",profileCompleted:true,isLocked:false,outstandingServiceFee:0,badges:[],createdAt:null,updatedAt:null};
export const user={uid:profile.uid,displayName:profile.displayName,email:profile.email,emailVerified:new URLSearchParams(location.search).get("state")!=="unverified",reload:async()=>undefined,getIdToken:async()=>"local-ui-fixture"};
export const refreshProfile=async()=>undefined;
export function useAuth(){return {user:new URLSearchParams(location.search).get("state")==="guest"?null:user,profile,refreshProfile,loading:false,homePath:"/dashboard"};}
