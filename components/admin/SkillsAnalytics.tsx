"use client";
import { useState } from "react";
import { useOperationalData } from "@/hooks/useOperationalData";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Service = { id: string; name: string; category: string; workers: number; verifiedWorkers: number; unverifiedWorkers: number; availableWorkers: number; completedJobs?: number };
export function SkillsAnalytics() {
  const [search, setSearch] = useState(""), [cursor, setCursor] = useState(""), [sort, setSort] = useState("name");
  const { data, error, loading } = useOperationalData<{ services: Service[]; nextCursor: string | null }>(`/api/admin/marketplace?search=${encodeURIComponent(search)}&cursor=${encodeURIComponent(cursor)}`, 60000);
  return <section className="space-y-4" aria-label="Services analytics"><h2 className="text-xl font-black">Marketplace services</h2>
    <form onSubmit={event => { event.preventDefault(); setCursor(""); setSearch(String(new FormData(event.currentTarget).get("search") ?? "")); }} className="flex flex-wrap gap-3"><label className="temp-label flex-1">Search service<input name="search" className="temp-input w-full p-3" placeholder="Service name" /></label><Button type="submit">Search</Button><label className="temp-label">Sort this page<select className="temp-input p-3" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Service</option><option value="workers">Most workers</option><option value="verifiedWorkers">Most verified</option></select></label></form>
    {error && <p role="alert" className="copic-error">{error}</p>}{loading && <p role="status">Loading services…</p>}
    {data?.services.length === 0 && <Card>No services indexed yet. Run the marketplace backfill if existing worker profiles are present.</Card>}
    <div className="copic-marketplace-grid">{[...(data?.services ?? [])].sort((a,b) => sort === "name" ? a.name.localeCompare(b.name) : Number(b[sort as keyof Service]) - Number(a[sort as keyof Service])).map(service => <Card key={service.id}><h3 className="text-xl font-bold">{service.name}</h3><p className="copic-muted text-sm">{service.category.replaceAll("_", " ")}</p><dl className="mt-4 grid grid-cols-2 gap-3">{Object.entries({ workers: "Workers", verifiedWorkers: "ID verified", unverifiedWorkers: "ID unverified", availableWorkers: "Available", completedJobs: "Completed jobs" }).map(([key,label]) => <div key={key}><dt className="copic-muted text-sm">{label}</dt><dd className="text-xl font-bold">{service[key as keyof Service] ?? 0}</dd></div>)}</dl></Card>)}</div>
    <div className="flex gap-3">{cursor && <Button variant="secondary" onClick={() => setCursor("")}>First page</Button>}{data?.nextCursor && <Button onClick={() => setCursor(data.nextCursor!)}>Next services</Button>}</div>
  </section>;
}
