"use client";
import { use } from "react";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authenticatedJson,useOperationalData } from "@/hooks/useOperationalData";
import { AcquisitionFunnel } from "@/components/admin/AcquisitionFunnel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
export default function CampaignDetail({params}:{params:Promise<{campaignId:string}>}) {
  const {campaignId}=use(params), {user}=useAuth(),[error,setError]=useState("");
  const {data,error:loadError,refresh}=useOperationalData<{campaign:{name:string;active:boolean;service:string;rate:number;unit:string;adSpend:number};funnel:Record<string,number>}>(`/api/admin/recruitment?id=${encodeURIComponent(campaignId)}`);
  if(!data)return <p role="status">{loadError||"Loading campaign…"}</p>;
  return <div className="space-y-5"><h1 className="text-3xl font-black">{data.campaign.name}</h1><Card><p>{data.campaign.service} · KSh {data.campaign.rate} / {data.campaign.unit}</p><Link className="mt-3 block break-all underline" href={`/recruit/${campaignId}`}>/recruit/{campaignId}</Link><Button className="mt-3" onClick={()=>navigator.clipboard.writeText(`${location.origin}/recruit/${campaignId}`).catch(()=>setError("Copy the recruitment link above."))}>Copy recruitment link</Button><form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={async event=>{event.preventDefault();if(!user)return;const values=new FormData(event.currentTarget);try{await authenticatedJson("/api/admin/recruitment",await user.getIdToken(),{method:"PATCH",body:JSON.stringify({id:campaignId,active:values.get("active")==="on",adSpend:Number(values.get("adSpend"))})});refresh();}catch(reason){setError(reason instanceof Error?reason.message:"Unable to update.");}}}><label className="temp-label">Ad spend (KSh)<input name="adSpend" type="number" min="0" step="0.01" defaultValue={data.campaign.adSpend} className="temp-input w-full p-3"/></label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="active" defaultChecked={data.campaign.active}/>Active</label><Button>Save</Button></form></Card>{error&&<p role="alert" className="copic-error">{error}</p>}<AcquisitionFunnel data={data.funnel} adSpend={data.campaign.adSpend}/></div>;
}
