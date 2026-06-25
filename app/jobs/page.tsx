"use client";

import { JobCard } from "@/components/jobs/JobCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { subscribeApplications, subscribeOpenJobs } from "@/services/jobs";
import type { Application, Job } from "@/types";
import { ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { workerVisiblePay } from "@/utils/pricing";

export default function JobsPage() {
  const { profile, loading: authLoading, isAuthorized } = useProtectedRoute(["worker", "admin"]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortOpen, setSortOpen] = useState(false);
  const [sortOptions, setSortOptions] = useState({ pay: false, currentLocation: false });
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthorized) {
      setLoading(false);
      return;
    }
    if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      setLoading(false);
      return;
    }
    return subscribeOpenJobs(
      items => {
        setJobs(items);
        setLoading(false);
      },
      error => {
        setJobs([]);
        setLoading(false);
        setError(error.message.includes("permission") ? "Jobs are not available right now." : "Unable to load jobs right now.");
      }
    );
  }, [authLoading, isAuthorized]);

  useEffect(() => {
    if (authLoading || !isAuthorized || !profile || profile.role !== "worker") return;
    return subscribeApplications(profile.id, "worker", setApplications, () => setApplications([]));
  }, [authLoading, isAuthorized, profile]);
  const [error, setError] = useState("");
  const appliedJobIds = useMemo(() => new Set(applications.map(application => application.jobId)), [applications]);
  const filteredJobs = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const locationText = `${profile?.location?.county ?? ""} ${profile?.location?.town ?? ""}`.trim().toLowerCase();
    const results = jobs.filter(job => {
      const matchesSearch = !normalized || `${job.title} ${job.description} ${job.category} ${job.location} ${job.county}`.toLowerCase().includes(normalized);
      const matchesLocation = !sortOptions.currentLocation || (!!locationText && `${job.location} ${job.county}`.toLowerCase().includes(locationText));
      return matchesSearch && matchesLocation;
    });
    if (sortOptions.pay) {
      results.sort((first, second) => workerVisiblePay(second.payAmount) - workerVisiblePay(first.payAmount));
    }
    return results;
  }, [jobs, profile?.location?.county, profile?.location?.town, search, sortOptions.currentLocation, sortOptions.pay]);
  const selectedSortLabels = [
    sortOptions.pay ? "Pay" : "",
    sortOptions.currentLocation ? "Current Location" : ""
  ].filter(Boolean).join(", ") || "Options";

  function toggleSortOption(option: keyof typeof sortOptions) {
    setSortOptions(current => ({ ...current, [option]: !current[option] }));
  }

  if (authLoading || !isAuthorized) return <LoadingSpinner label="Checking worker access" />;
  if (loading) return <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-56" /><Skeleton className="h-56" /><Skeleton className="h-56" /></div>;
  return (
    <div className="marketplace-page space-y-5">
      <div>
        <p className="text-sm font-black uppercase tracking-[.22em] text-[#959087]">Available work</p>
        <h1 className="temp-page-title mt-2 text-4xl font-black text-[#FFFBFF]">Jobs</h1>
      </div>
      <div className="marketplace-filterbar">
        <label className="marketplace-search">
          <Search size={17} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search jobs, skills, or location" />
        </label>
        <div className="marketplace-sort-wrap">
          <button type="button" className="marketplace-sort" aria-haspopup="menu" aria-expanded={sortOpen} onClick={() => setSortOpen(open => !open)}>
            <span>Sort By</span>
            <strong>{selectedSortLabels}</strong>
            <ChevronDown size={16} className={sortOpen ? "rotate-180 transition" : "transition"} />
          </button>
          {sortOpen && (
            <div className="marketplace-sort-menu" role="menu">
              <label className="marketplace-checkbox-option">
                <input type="checkbox" checked={sortOptions.pay} onChange={() => toggleSortOption("pay")} />
                Pay
              </label>
              <label className="marketplace-checkbox-option">
                <input type="checkbox" checked={sortOptions.currentLocation} onChange={() => toggleSortOption("currentLocation")} />
                Current Location
              </label>
            </div>
          )}
        </div>
      </div>
      {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredJobs.length ? filteredJobs.map(job => {
          const applied = appliedJobIds.has(job.id);
          return (
            <JobCard
              key={job.id}
              job={job}
              workerView
              infoActionSlot={<Link href={`/jobs/${job.id}`} className={`reference-job-action ${applied ? "is-applied pointer-events-none" : ""}`}>{applied ? "Applied" : "Apply"}</Link>}
            />
          );
        }) : <EmptyState title="No jobs found" body="Try changing your search or job filters." />}
      </div>
    </div>
  );
}
