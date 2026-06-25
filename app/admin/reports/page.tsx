"use client";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";

type Report = { id: string; title?: string; reason?: string; status?: string };

export default function AdminReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void user.getIdToken().then(token => fetch("/api/admin/reports?kind=reports", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }))
      .then(async response => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error); return payload; })
      .then(payload => { if (!cancelled) setReports(payload.items ?? []); })
      .catch(() => { if (!cancelled) setReports([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);
  if (loading) return <LoadingSpinner label="Loading reports" />;
  if (!reports.length) return <EmptyState title="No reports" body="Submitted safety and dispute reports will appear here." />;
  return <div className="space-y-4"><h1 className="text-3xl font-black">Reports</h1>{reports.map(report => <Card key={report.id}><h2 className="font-black">{report.title ?? "User report"}</h2><p className="mt-2 text-sm text-[#CCC6BB]">{report.reason ?? "No reason supplied."}</p>{report.status && <p className="mt-2 text-sm capitalize text-[#959087]">{report.status}</p>}</Card>)}</div>;
}
