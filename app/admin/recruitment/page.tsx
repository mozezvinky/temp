"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authenticatedJson, useOperationalData } from "@/hooks/useOperationalData";
import { flatJobCategories } from "@/lib/jobCategories";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
type Campaign = { id: string; name: string; service: string; rate: number; unit: string; targetLocation: string; active: boolean };
export default function RecruitmentAdminPage() {
  const { user } = useAuth(), [cursor,setCursor] = useState(""), [error,setError] = useState(""), [saving,setSaving] = useState(false);
  const { data, error: loadError, refresh } = useOperationalData<{ campaigns: Campaign[]; nextCursor: string | null }>(`/api/admin/recruitment?cursor=${cursor}`);
  const { data: services } = useOperationalData<{ services: { name: string }[] }>("/api/admin/marketplace",0);
  return <div className="space-y-5"><h1 className="text-3xl font-black">Recruitment</h1><p className="copic-muted">COPIC-owned campaigns. These links have no agent commission owner.</p>
    <Card><h2 className="text-xl font-bold">Create a campaign</h2><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={async event => { event.preventDefault(); if(!user)return; const form=event.currentTarget, values=new FormData(form); setSaving(true);setError(""); try { await authenticatedJson("/api/admin/recruitment",await user.getIdToken(),{ method:"POST", body:JSON.stringify({ name:values.get("name"),service:values.get("service"),rate:Number(values.get("rate")),unit:values.get("unit"),targetLocation:values.get("targetLocation"),source:values.get("source"),active:values.get("active")==="on",startsAt:values.get("startsAt")?new Date(String(values.get("startsAt"))).toISOString():null,endsAt:values.get("endsAt")?new Date(String(values.get("endsAt"))).toISOString():null,adSpend:Number(values.get("adSpend")||0) }) }); form.reset();refresh(); } catch(reason){setError(reason instanceof Error?reason.message:"Unable to save.");}finally{setSaving(false);} }}>
      {[{name:"name",label:"Campaign name"},{name:"service",label:"Existing service / skill"},{name:"rate",label:"Worker rate (KSh)",type:"number"},{name:"unit",label:"Unit"},{name:"targetLocation",label:"Target location"},{name:"source",label:"Source"},{name:"startsAt",label:"Start date (optional)",type:"datetime-local"},{name:"endsAt",label:"End date (optional)",type:"datetime-local"},{name:"adSpend",label:"Ad spend (KSh, optional)",type:"number"}].map(field=><label key={field.name} className="temp-label">{field.label}<input name={field.name} type={field.type??"text"} list={field.name==="service"?"campaign-services":undefined} required={!["startsAt","endsAt","adSpend"].includes(field.name)} min={field.type==="number"?0:undefined} step={field.type==="number"?"0.01":undefined} className="temp-input w-full p-3" /></label>)}
      <datalist id="campaign-services">{[...new Set([...flatJobCategories,...(services?.services??[]).map(service=>service.name)])].map(name=><option key={name}>{name}</option>)}</datalist><label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="active" defaultChecked />Active</label><Button disabled={saving}>{saving?"Creating…":"Create recruitment link"}</Button>
    </form></Card>
    {(error||loadError)&&<p role="alert" className="copic-error">{error||loadError}</p>}{!data&&!loadError&&<p role="status">Loading campaigns…</p>}{data?.campaigns.length===0&&<Card>No campaigns yet. Create your first recruitment link above.</Card>}
    <div className="copic-marketplace-grid">{data?.campaigns.map(campaign=><Card key={campaign.id}><p className="copic-muted text-sm">{campaign.active?"Active":"Inactive"} · {campaign.targetLocation}</p><h2 className="mt-2 text-xl font-bold">{campaign.name}</h2><p className="mt-2">{campaign.service} · KSh {campaign.rate} / {campaign.unit}</p><Link className="mt-4 inline-flex min-h-11 items-center font-bold underline" href={`/admin/recruitment/${campaign.id}`}>Campaign details and funnel</Link></Card>)}</div>
    <div className="flex gap-3">{cursor&&<Button onClick={()=>setCursor("")}>First page</Button>}{data?.nextCursor&&<Button onClick={()=>setCursor(data.nextCursor!)}>Next page</Button>}</div>
  </div>;
}
