"use client";

import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";

export default function ApplicationsPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute();
  if (loading || !isAuthorized || !profile) return <LoadingSpinner label="Opening applications" />;
  if (profile.role === "client") {
    return <Card><h1 className="text-3xl font-black">Applicants</h1><p className="mt-3 text-sm text-smoky/70">Review applicants for posted jobs, accept the right worker, and unlock chat after acceptance.</p></Card>;
  }
  return <Card><h1 className="text-3xl font-black">Applications</h1><p className="mt-3 text-sm text-smoky/70">Realtime application status tracking is backed by the applications collection and acceptApplication workflow.</p></Card>;
}
