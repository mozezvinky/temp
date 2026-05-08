"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { demoJobs } from "@/lib/demoData";
import { applyToJob } from "@/services/jobs";
import { kes } from "@/utils/money";
import { useParams } from "next/navigation";
import { toast } from "sonner";

export default function JobDetailsPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute(["worker", "admin"]);
  const { id } = useParams<{ id: string }>();
  const job = demoJobs.find(item => item.id === id) ?? demoJobs[0];
  if (loading || !isAuthorized) return <LoadingSpinner label="Opening job" />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <p className="text-xs font-bold uppercase text-olive">{job.category}</p>
        <h1 className="mt-2 text-3xl font-black">{job.title}</h1>
        <p className="mt-4 text-sm text-smoky/75">{job.description}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <span className="rounded-2xl bg-smoky/10 p-3 font-bold">{kes(job.rateAmount)}</span>
          <span className="rounded-2xl bg-smoky/10 p-3 font-bold">{job.durationHours} hours</span>
          <span className="rounded-2xl bg-smoky/10 p-3 font-bold">{job.location}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <span className="rounded-2xl bg-smoky/10 p-3 text-sm font-bold">Client rating: 4.7</span>
          <span className="rounded-2xl bg-smoky/10 p-3 text-sm font-bold">Payment reliability: 96%</span>
          <span className="rounded-2xl bg-smoky/10 p-3 text-sm font-bold">Completed hires: 24</span>
        </div>
      </Card>
      {profile?.role === "worker" && (
        <Card>
          <textarea id="cover" placeholder="Short cover note" className="min-h-28 w-full rounded-2xl bg-smoky/10 p-4 outline-none" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => profile && applyToJob(job, profile, (document.getElementById("cover") as HTMLTextAreaElement).value || "I am available.").then(() => toast.success("Application sent")).catch(error => toast.error(error.message))}>Apply</Button>
            <button onClick={() => toast.success("Job saved")} className="rounded-2xl border border-smoky/20 px-5 py-2 font-semibold">Save job</button>
            <button onClick={() => toast.success("Job marked complete")} className="rounded-2xl border border-smoky/20 px-5 py-2 font-semibold">Mark complete</button>
          </div>
        </Card>
      )}
    </div>
  );
}
