"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import type { AdminSession } from "@/types";
import { MonitorSmartphone, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const fallbackPermissions = ["tickets:read", "tickets:write", "users:read", "users:write", "jobs:write", "applications:write", "kyc:write", "finance:read", "finance:adjust", "audit:read", "admins:manage", "moderation:write"];

export default function AdminSettingsPage() {
  const { profile, user } = useAuth();
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [sessionsError, setSessionsError] = useState("");
  const [revokingId, setRevokingId] = useState("");
  const role = profile?.adminRole ?? "super_admin";
  const permissions = profile?.adminPermissions?.length ? profile.adminPermissions : fallbackPermissions;

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setSessionsError("");
    try {
      const response = await fetch("/api/admin/sessions", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { sessions?: AdminSession[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load admin sessions.");
      setSessions(payload.sessions ?? []);
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "Unable to load admin sessions.");
    }
  }, [user]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function revokeSession(sessionId: string) {
    if (!user) return;
    setRevokingId(sessionId);
    try {
      const response = await fetch("/api/admin/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ sessionId })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to log out this device.");
      setSessions(items => items.map(item => item.id === sessionId ? { ...item, revoked: true } : item));
      toast.success("Device session logged out.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to log out this device.");
    } finally {
      setRevokingId("");
    }
  }

  function displayDate(value: AdminSession["createdAt"]) {
    if (!value) return "Unknown";
    if (typeof value === "string") return new Date(value).toLocaleString();
    if (typeof value === "object" && "seconds" in value && typeof value.seconds === "number") return new Date(value.seconds * 1000).toLocaleString();
    if (typeof value === "object" && "_seconds" in value && typeof value._seconds === "number") return new Date(value._seconds * 1000).toLocaleString();
    return "Unknown";
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-black uppercase tracking-[.2em] text-[#959087]">Control center</p>
        <h1 className="mt-2 text-3xl font-black">Admin settings</h1>
      </div>
      <Card>
        <Settings />
        <h2 className="mt-4 text-xl font-black text-[#FFFBFF]">Current admin access</h2>
        <p className="mt-2 text-sm text-[#CCC6BB]">Role: <strong>{role.replace("_", " ")}</strong></p>
        <div className="mt-4 flex flex-wrap gap-2">
          {permissions.map(permission => (
            <span key={permission} className="rounded-lg bg-[#2A2A2B] px-3 py-1 text-xs font-bold text-[#D8CFBC]">{permission}</span>
          ))}
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <MonitorSmartphone />
            <h2 className="mt-4 text-xl font-black text-[#FFFBFF]">Logged-in admin devices</h2>
            <p className="mt-2 text-sm text-[#CCC6BB]">Sessions recorded through the Copic admin sign-in screen can be logged out from here.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadSessions()}>Refresh</Button>
        </div>
        {sessionsError && <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{sessionsError}</p>}
        <div className="mt-5 grid gap-3">
          {sessions.length ? sessions.map(session => (
            <div key={session.id} className="rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-[#FFFBFF]">{session.userAgent || "Unknown device"}</p>
                  <p className="mt-1 text-sm text-[#CCC6BB]">IP: {session.ip || "Unknown"} · Started: {displayDate(session.createdAt)}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[.16em] text-[#959087]">{session.revoked ? "Logged out" : "Active"}</p>
                </div>
                <Button type="button" variant="secondary" disabled={session.revoked || revokingId === session.id} onClick={() => void revokeSession(session.id)}>
                  {revokingId === session.id ? "Logging out..." : session.revoked ? "Logged out" : "Log out"}
                </Button>
              </div>
            </div>
          )) : <p className="rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-4 text-sm text-[#CCC6BB]">No admin device sessions have been recorded yet. New admin sign-ins will appear here.</p>}
        </div>
      </Card>
      <Card>
        <h2 className="text-xl font-black text-[#FFFBFF]">Operational notes</h2>
        <div className="mt-3 grid gap-2 text-sm text-[#CCC6BB]">
          <p>Use the Overview page to change the admin password.</p>
          <p>Use Tickets for account, job, application, and KYC support cases.</p>
          <p>Use Service Fees for worker service-fee payment review and approval.</p>
          <p>Use Audit to review security-sensitive admin actions.</p>
        </div>
      </Card>
    </div>
  );
}
