"use client";

import { JobCard } from "@/components/jobs/JobCard";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { demoJobs } from "@/lib/demoData";
import { subscribeOpenJobs } from "@/services/jobs";
import type { Job } from "@/types";
import { CheckCircle2, Clock, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function JobsPage() {
  const { loading: authLoading, isAuthorized } = useProtectedRoute(["worker", "admin"]);
  const [jobs, setJobs] = useState<Job[]>(demoJobs);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      setLoading(false);
      return;
    }
    return subscribeOpenJobs(items => {
      setJobs(items);
      setLoading(false);
    });
  }, []);
  if (authLoading || !isAuthorized) return <LoadingSpinner label="Checking worker access" />;
  if (loading) return <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-56" /><Skeleton className="h-56" /><Skeleton className="h-56" /></div>;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><Clock /><p className="mt-4 text-sm">Active jobs</p><p className="text-3xl font-black">2</p></Card>
        <Card><CheckCircle2 /><p className="mt-4 text-sm">Completed this month</p><p className="text-3xl font-black">5</p></Card>
        <Card><Star /><p className="mt-4 text-sm">Avg client rating</p><p className="text-3xl font-black">4.7</p></Card>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {jobs.length ? jobs.map(job => <div key={job.id} className="space-y-2"><JobCard job={job} /><button onClick={() => toast.success(`${job.title} moved to active jobs`)} className="w-full rounded-2xl border border-bone/20 px-4 py-2 font-semibold">Accept job</button><button onClick={() => toast.success(`${job.title} marked complete`)} className="w-full rounded-2xl bg-bone px-4 py-2 font-semibold text-smoky">Mark complete</button></div>) : <EmptyState title="No jobs yet" body="Check again soon for verified temporary jobs." />}
      </div>
    </div>
  );
}
