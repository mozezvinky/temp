"use client";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import type { AdminAuditLog } from "@/types";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function AdminAuditPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAuditLogs = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/admin/audit", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load audit logs.");
      setItems(payload.logs ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void loadAuditLogs();
  }, [loadAuditLogs, user]);

  if (loading) return <LoadingSpinner label="Loading audit logs" />;
  if (!items.length) return <EmptyState title="No audit events" body="Super admins will see controlled admin actions here." />;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black">Audit logs</h1>
      {items.map(item => (
        <Card key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-black">{item.actionType}</p>
              <p className="mt-2 text-sm text-[#959087]">{item.reason}</p>
              <p className="mt-1 text-xs text-[#959087]">Admin: {item.adminEmail ?? item.adminId} - Target: {item.targetUserId ?? "none"}</p>
            </div>
            {item.linkedTicketId && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">Ticket {item.linkedTicketId}</span>}
          </div>
        </Card>
      ))}
    </div>
  );
}
