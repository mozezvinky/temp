"use client";
import { useState } from "react";
import Link from "next/link";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { authenticatedJson, useOperationalData } from "@/hooks/useOperationalData";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PostWorkWizard } from "@/components/jobs/PostWorkWizard";
import { AcquisitionFunnel } from "@/components/admin/AcquisitionFunnel";
import { flatJobCategories } from "@/lib/jobCategories";
type Summary = { earned: number; available: number; pending: number; completedJobs: number; net: number; generatedValue?: number; eligibleJobs?: number };
type AgentData = { enabled: boolean; client: Summary; worker: Summary; combined: { earned: number; available: number }; clientCode: string; metrics: Record<string, number>; links: { id: string; name: string }[]; workers: { id: string; status: string }[]; clients: { id: string }[]; jobs: { id: string; title: string; clientId: string; gross: number; status: string; workerNet: number; estimatedCommission: number; commission: number; paymentStatus: string }[]; proposals: { id: string; title: string; status: string }[]; records: { id: string; jobId: string; roleType: string; eligibleWorkerAmount: number; commissionAmount: number; status: string }[] };
const kes = (value: number) => `KSh ${value.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default function AgentPage() {
  const { user, profile, loading, isAuthorized } = useProtectedRoute();
  const [mode, setMode] = useState<"WORKER_AGENT" | "CLIENT_AGENT">("WORKER_AGENT"), [error, setError] = useState(""), [busy, setBusy] = useState(false), [prepare, setPrepare] = useState(false), [clientEmail, setClientEmail] = useState("");
  const { data, error: loadError, refresh } = useOperationalData<AgentData>(user ? "/api/agent/overview" : null);
  async function send(body: Record<string, unknown>) {
    if (!user) return; setBusy(true); setError("");
    try { await authenticatedJson("/api/agent", await user.getIdToken(), { method: "POST", body: JSON.stringify(body) }); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update."); } finally { setBusy(false); }
  }
  async function share(path: string, native = false) {
    const url = `${location.origin}${path}`;
    try { if (native && navigator.share) await navigator.share({ title: "Join COPIC", url }); else await navigator.clipboard.writeText(url); }
    catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError("Unable to share. Copy the displayed link address."); }
  }
  if (loading || !isAuthorized) return <p role="status">Checking your account…</p>;
  const clientMode = mode === "CLIENT_AGENT", summary = data?.enabled ? clientMode ? data.client : data.worker : null;
  const clientPath = `/agent/client/${data?.clientCode}`;
  return <div className="mx-auto max-w-6xl space-y-5 pb-8"><header><p className="copic-eyebrow">One account. Two opportunities.</p><h1 className="mt-2 text-3xl font-black">COPIC Agent</h1></header>
    {(error || loadError) && <p role="alert" className="copic-error">{error || loadError}</p>}
    {!data && !loadError && <p role="status">Loading your agent dashboard…</p>}
    {data && !data.enabled && <Card><h2 className="text-xl font-bold">Become a COPIC Agent</h2><p className="mt-3">Bring clients and recruit workers with one free account.</p><Link className="recruitment-primary mt-4" href="/become-agent">Become a COPIC Agent</Link></Card>}
    {data?.enabled && summary && <>
      <div role="tablist" aria-label="Agent dashboard mode" className="grid grid-cols-2 gap-2 rounded-2xl bg-black p-2">{(["CLIENT_AGENT", "WORKER_AGENT"] as const).map(role => <button key={role} id={`tab-${role}`} role="tab" aria-selected={mode === role} aria-controls="agent-panel" onClick={() => setMode(role)} className={`min-h-12 rounded-xl px-3 py-3 text-base font-bold transition-colors ${mode === role ? "bg-lime text-black" : "text-white hover:bg-white/10"}`}>{role === "CLIENT_AGENT" ? "Client Agent" : "Worker Agent"}</button>)}</div>
      <Card><h2 className="font-bold">Your shared overview</h2><dl className="mt-4 grid grid-cols-2 gap-5 md:grid-cols-4">{Object.entries({ "Client earnings": data.client.earned, "Worker earnings": data.worker.earned, "Combined commissions": data.combined.earned, "Combined available": data.combined.available }).map(([label, value]) => <div key={label}><dt className="text-sm copic-muted">{label}</dt><dd className="mt-1 font-bold">{kes(value)}</dd></div>)}</dl></Card>
      <section id="agent-panel" role="tabpanel" aria-labelledby={`tab-${mode}`} className="space-y-5">
        <h2 className="text-2xl font-black">{clientMode ? "Client Agent" : "Worker Agent"} dashboard</h2><p className="copic-muted">Earn exactly 1% of eligible worker net earnings after COPIC fees. Pending amounts require verification and payout review.</p>
        <div className="copic-marketplace-grid">{[
          ["Total commissions earned", kes(summary.earned)], ["Available commissions", kes(summary.available)], ["Pending commissions", kes(summary.pending)],
          [clientMode ? "Clients referred" : "Workers referred", clientMode ? data.clients.length : data.workers.length],
          ["Completed referred jobs", summary.completedJobs], [clientMode ? "Eligible jobs posted" : "Active referred workers", clientMode ? summary.eligibleJobs ?? data.jobs.length : data.metrics.activeWorkers ?? 0],
          [clientMode ? "Job value generated" : "Worker net earnings generated", kes(clientMode ? summary.generatedValue ?? 0 : summary.net)]
        ].map(([label, value]) => <Card key={label}><p className="text-sm copic-muted">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></Card>)}</div>
        <Card><h3 className="text-xl font-bold">{clientMode ? "Client referral link" : "Worker referral links"}</h3>
          {clientMode ? <div className="mt-4 space-y-3"><p className="copic-muted">Clients explicitly confirm your referral before preparing work.</p><Link className="block break-all underline" href={clientPath}>{clientPath}</Link><div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => void share(clientPath)}>Copy link</Button><Button variant="secondary" onClick={() => void share(clientPath, true)}>Share link</Button></div></div> : <>
            <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void send({ action: "create_link", service: new FormData(event.currentTarget).get("service") || null }); }}><label className="temp-label flex-1">Service (optional)<input name="service" list="agent-services" className="temp-input w-full p-3" /></label><datalist id="agent-services">{flatJobCategories.map(name => <option key={name}>{name}</option>)}</datalist><Button disabled={busy}>Create link</Button></form>
            <div className="mt-4 space-y-4">{data.links.map(link => <div key={link.id} className="space-y-2"><Link className="block break-all underline" href={`/join/${link.id}`}>{link.name}</Link><div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => void share(`/join/${link.id}`)}>Copy link</Button><Button variant="secondary" onClick={() => void share(`/join/${link.id}`, true)}>Share link</Button></div></div>)}{!data.links.length && <p>Create a link to start referring workers.</p>}</div></>}
        </Card>
        {clientMode && <Card><h3 className="text-xl font-bold">Post a Job for a Client</h3><p className="mt-3 copic-muted">Prepare the details using COPIC’s job form. Your client receives an approval request and can edit or reject it. Only their approval publishes the job.</p><label className="temp-label mt-4 block">Client account email<input type="email" required value={clientEmail} onChange={e => setClientEmail(e.target.value)} className="temp-input mt-2 w-full p-3" /></label><Button className="mt-4" disabled={!clientEmail.includes("@")} onClick={() => setPrepare(true)}>Prepare job for approval</Button><div className="mt-4 space-y-2">{data.proposals.map(p => <p key={p.id}>{p.title} · {p.status}</p>)}</div></Card>}
        <Card><h3 className="text-xl font-bold">My referred {clientMode ? "clients" : "workers"}</h3><div className="mt-4 space-y-3">{(clientMode ? data.clients : data.workers).map(person => <p className="break-all" key={person.id}>Reference: {person.id}</p>)}{!(clientMode ? data.clients : data.workers).length && <p className="copic-muted">No referrals yet.</p>}</div></Card>
        {clientMode && <Card><h3 className="text-xl font-bold">My referred jobs</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">{data.jobs.map(job => <article className="rounded-xl border border-white/15 p-4" key={job.id}><h4 className="font-bold">{job.title}</h4><p className="break-all text-sm copic-muted">Job: {job.id}<br />Client: {job.clientId}</p><dl className="mt-3 space-y-1"><div>Job value: {kes(Number(job.gross || 0))}</div><div>Settled worker net: {kes(job.workerNet)}</div><div>Status: {job.status}</div><div>Estimated commission: {kes(job.estimatedCommission)} (potential)</div><div>Earned commission: {kes(job.commission)}</div><div>Commission / payment: {job.paymentStatus}</div></dl></article>)}</div>{!data.jobs.length && <p className="mt-4 copic-muted">Approved published referrals will appear here. Posted jobs alone do not earn commissions.</p>}</Card>}
        <Card><h3 className="text-xl font-bold">{clientMode ? "Client" : "Worker"} commission ledger</h3><div className="mt-4 space-y-3">{data.records.filter(r => r.roleType === mode).map(row => <article className="flex flex-wrap justify-between gap-3 rounded-xl border border-white/15 p-4" key={row.id}><div className="min-w-0"><p className="break-all font-bold">Job {row.jobId}</p><p className="text-sm copic-muted">Eligible worker net: {kes(row.eligibleWorkerAmount)}</p></div><div><p className="font-bold">{kes(row.commissionAmount)}</p><p className="capitalize">{row.status}</p></div></article>)}{!data.records.some(r => r.roleType === mode) && <p className="copic-muted">No commission entries yet.</p>}</div></Card>
        {!clientMode && <AcquisitionFunnel data={data.metrics} />}
      </section>
    </>}
    {prepare && profile && <PostWorkWizard profile={profile} onClose={() => setPrepare(false)} onSubmitJob={async job => { await authenticatedJson("/api/agent/proposals", await user!.getIdToken(), { method: "POST", body: JSON.stringify({ clientEmail, job }) }); refresh(); }} />}
  </div>;
}
