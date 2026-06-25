"use client";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";

interface Dispute {
  id: string;
  title?: string;
  reason?: string;
  status?: string;
  createdBy?: string;
}

export default function AdminDisputesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void user.getIdToken().then(token => fetch("/api/admin/reports?kind=disputes", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }))
      .then(async response => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error); return payload; })
      .then(payload => { if (!cancelled) setItems(payload.items ?? []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);
  if (loading) return <LoadingSpinner label="Loading disputes" />;
  if (!items.length) return <EmptyState title="No disputes" body="Reported work disputes will appear here." />;
  return <div className="space-y-4"><h1 className="text-3xl font-black">Disputes</h1>{items.map(item => <Card key={item.id}><h2 className="font-black">{item.title ?? "Work dispute"}</h2><p className="mt-2 text-sm text-[#CCC6BB]">{item.reason ?? "No details supplied."}</p><p className="mt-2 text-xs capitalize text-[#959087]">{item.status ?? "open"}</p></Card>)}</div>;
}
