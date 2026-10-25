"use client";
import { use, useEffect, useState } from "react";
import { rememberAcquisitionReturn } from "@/utils/acquisition-return";
import Link from "next/link";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { authenticatedJson, useOperationalData } from "@/hooks/useOperationalData";
import { PostWorkWizard } from "@/components/jobs/PostWorkWizard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params), { user, profile } = useProtectedRoute(["client"]);
  useEffect(() => { rememberAcquisitionReturn(`/agent/review/${id}`); }, [id]);
  const { data, error, refresh } = useOperationalData<{ status: string; clientUid: string; job: Record<string, unknown> }>(user ? `/api/agent/proposals?id=${encodeURIComponent(id)}` : null);
  const [editing, setEditing] = useState(false), [message, setMessage] = useState("");
  return <div className="mx-auto max-w-2xl space-y-5"><h1 className="text-3xl font-black">Review proposed work</h1>
    {(error || message) && <p role="status">{error || message}</p>}
    {data && <Card><h2 className="text-xl font-bold">{String(data.job.title)}</h2><p className="mt-3 whitespace-pre-wrap">{String(data.job.description)}</p><p className="mt-3">KSh {Number(data.job.payAmount).toLocaleString()} · {String(data.job.location)} · {String(data.job.duration)}</p><p className="mt-3">Status: {data.status}. Publishing confirms this agent sourced your job. You remain the owner and must complete COPIC verification and payment requirements.</p>
      {data.status === "pending" && data.clientUid === user?.uid && <div className="mt-4 flex flex-wrap gap-3"><Button onClick={() => setEditing(true)}>Review, edit and approve</Button><Button variant="secondary" onClick={async () => { try { await authenticatedJson("/api/agent/proposals", await user!.getIdToken(), { method: "POST", body: JSON.stringify({ action: "reject", id }) }); refresh(); } catch (e) { setMessage(String(e)); } }}>Reject proposal</Button></div>}
    </Card>}
    {!user && <Link className="underline" href={`/auth/login?returnTo=${encodeURIComponent(`/agent/review/${id}`)}`}>Sign in to review your proposal</Link>}
    {editing && profile && <PostWorkWizard profile={profile} initialJob={data?.job} onClose={() => setEditing(false)} onSubmitJob={async job => {
      await authenticatedJson("/api/jobs/create", await user!.getIdToken(), { method: "POST", body: JSON.stringify({ ...job, agentProposalId: id, approveAgentProposal: true }) });
      setMessage("Your approved job is published."); refresh();
    }} />}
  </div>;
}
