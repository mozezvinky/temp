"use client";

import { AgentProgramCard } from "@/components/admin/AgentProgramCard";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { kes } from "@/utils/money";
import { Activity, AlertTriangle, BriefcaseBusiness, Coins, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useOperationalData } from "@/hooks/useOperationalData";
import { Button } from "@/components/ui/Button";
import { FormEvent } from "react";
import { toast } from "sonner";

type Stats = { [key: string]: number | boolean; users: number; activeJobs: number; serviceFeePayments: number; reports: number; auditLogs: number; pendingVerifications: number; revenue: number };

export default function AdminPage() {
  const { user } = useAuth();
  const { data: stats, error } = useOperationalData<Stats>("/api/admin/stats");
  const value = (key: string) => stats?.[key] == null ? "--" : String(stats[key]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/admin/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ password: form.get("password") })
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return toast.error(payload.error ?? "Unable to change password.");
    formElement.reset();
    toast.success("Admin password changed.");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black">Admin dashboard</h1>
      {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card><UsersRound /><p className="mt-4">Total users</p><p className="text-3xl font-black">{value("users")}</p></Card>
        <Card><BriefcaseBusiness /><p className="mt-4">Open jobs</p><p className="text-3xl font-black">{value("activeJobs")}</p></Card>
        <Card><Coins /><p className="mt-4">Service fee revenue</p><p className="text-3xl font-black">{stats ? kes(stats.revenue) : "--"}</p></Card>
        <Card><ShieldCheck /><p className="mt-4">Pending verification</p><p className="text-3xl font-black">{value("pendingVerifications")}</p></Card>
        <Card><AlertTriangle /><p className="mt-4">Reports</p><p className="text-3xl font-black">{value("reports")}</p></Card>
        <Card><Activity /><p className="mt-4">Audit logs</p><p className="text-3xl font-black">{value("auditLogs")}</p></Card>
      </div>
      {stats && stats.projectionReady === false && <p role="status" className="copic-muted text-sm">Service and capability metrics are awaiting the marketplace backfill.</p>}
      <AgentProgramCard /><div className="copic-marketplace-grid">{Object.entries({ workers: "Workers", clients: "Clients", agents: "Agents", verifiedUsers: "Verified users", unverifiedUsers: "Unverified users", workersWithSkills: "Workers with skills", workersWithoutSkills: "Workers without skills", totalSkills: "Total skills", verifiedSkills: "Verified skills", unverifiedSkills: "Unverified skills", applications: "Applications", liveJobs: "Active jobs", completedJobs: "Completed jobs", jobsToday: "Jobs today", approvedVerifications: "Approved verifications", rejectedVerifications: "Rejected verifications" }).map(([key, label]) => <Card key={key}><p className="copic-muted text-sm">{label}</p><p className="mt-2 text-3xl font-black">{value(key)}</p></Card>)}</div>
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">{["kyc", "skills", "support", "service-fees", "disputes", "reports", "jobs", "users", "admins", "audit", "settings"].map(item => <Link className="copic-surface rounded-xl p-5 text-center font-bold capitalize" href={`/admin/${item}`} key={item}>{item.replace("-", " ")}</Link>)}</div>
      <Card>
        <h2 className="text-xl font-black text-[#FFFBFF]">Admin password</h2>
        <form onSubmit={changePassword} className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row">
          <input name="password" type="password" minLength={8} required placeholder="New admin password" className="temp-input min-w-0 flex-1 p-3 outline-none" />
          <Button type="submit">Change password</Button>
        </form>
      </Card>
    </div>
  );
}
