"use client";
import { useOperationalData } from "@/hooks/useOperationalData";
import type { PricingPolicy } from "@/functions/src/marketplace-policy";
export function ServicePricingNotice({name}:{name:string}) {
  const {data,error}=useOperationalData<{completed:number;level:number|null;policy:PricingPolicy|null;initial:{rate:number;unit:string}|null}>(name?`/api/profile/pricing?service=${encodeURIComponent(name)}`:null,0);
  if(!name)return null;
  if(error)return <p className="copic-error text-sm">{error}</p>;
  if(!data)return <p role="status" className="text-sm">Checking service pricing…</p>;
  if(!data.policy)return <p className="copic-muted text-sm">{data.completed} eligible completed jobs for {name}. No service pricing limits configured.</p>;
  return <div className="copic-surface rounded-xl p-3 text-sm"><p className="font-bold">{data.level===3?"You've unlocked flexible pricing.":data.level===2?"Established pricing":"New worker pricing"}</p><p className="mt-1">{data.completed} eligible {name} jobs completed.</p>{data.level===1&&data.initial?<p className="mt-1">Locked: KSh {data.initial.rate} / {data.initial.unit}. Complete {data.policy.widerPricingUnlockJobs} {name} jobs on COPIC to unlock additional pricing options.</p>:data.level!==3?<p className="mt-1">KSh {data.level===1?data.policy.newWorkerMin:data.policy.establishedMin}–{data.level===1?data.policy.newWorkerMax:data.policy.establishedMax} / {data.policy.unit}. Flexible pricing unlocks at {data.policy.fullPricingUnlockJobs} eligible jobs and acceptable account standing.</p>:null}</div>;
}
