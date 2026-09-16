import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { allowedPrice, pricingLevel, serviceKey, type PricingPolicy } from "@/functions/src/marketplace-policy";
import type { Transaction } from "firebase-admin/firestore";
import type { WorkerSkillProfile } from "@/types";

export async function servicePricing(tx: Transaction, uid: string, name: string) {
  const key=serviceKey(name),db=adminDb();
  const [config,progress,origin]=await Promise.all([tx.get(db.doc(`servicePricing/${key}`)),tx.get(db.doc(`workerServiceProgress/${uid}_${key}`)),tx.get(db.doc(`workerServiceOrigins/${uid}_${key}`))]);
  const initial=origin.exists?{rate:Number(origin.data()!.initialRate),unit:String(origin.data()!.initialUnit)}:undefined;
  const policy=config.exists?config.data() as PricingPolicy:initial?{recommendedRate:initial.rate,unit:initial.unit,newWorkerMin:initial.rate,newWorkerMax:initial.rate,establishedMin:initial.rate*0.75,establishedMax:initial.rate*1.25,widerPricingUnlockJobs:5,fullPricingUnlockJobs:15}:null;
  return {policy,initial,origin:origin.data(),completed:Number(progress.data()?.completedJobs??0)};
}
export async function enforceServicePrice(tx:Transaction,uid:string,profile:Record<string,unknown>,skill:WorkerSkillProfile,existing?:WorkerSkillProfile) {
  if(existing?.sourceType==="recruitment" && serviceKey(existing.name)!==serviceKey(skill.name))throw new Error("A recruitment service cannot be renamed. Add a separate service instead.");
  const state=await servicePricing(tx,uid,skill.name);
  const goodStanding=profile.isLocked!==true && profile.fraudulent!==true && profile.accountStanding!=="restricted";
  if(state.policy && !allowedPrice(Number(skill.chargeAmount),String(skill.chargeUnit??skill.chargeTimelineUnit??""),state.completed,goodStanding,state.policy,state.initial))throw new Error(`Pricing is restricted for ${skill.name}. Complete ${state.completed<state.policy.widerPricingUnlockJobs?state.policy.widerPricingUnlockJobs:state.policy.fullPricingUnlockJobs} eligible jobs for this service to unlock more options.`);
  if(state.initial && state.policy && pricingLevel(state.completed,goodStanding,state.policy)<3 && skill.chargePayType!=="unit")throw new Error("Keep the campaign pricing unit until flexible pricing is unlocked.");
  return state.origin?{sourceType:"recruitment" as const,campaignId:String(state.origin.campaignId),initialRate:state.initial!.rate,initialUnit:state.initial!.unit,priceRestrictionLevel:pricingLevel(state.completed,goodStanding,state.policy!)}:{};
}
