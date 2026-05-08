import { Card } from "@/components/ui/Card";
import { demoJobs, demoTransactions, demoWorkers } from "@/lib/demoData";
import { Activity, AlertTriangle, BarChart3, BriefcaseBusiness, Megaphone, ShieldBan, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black">Admin dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><UsersRound /><p className="mt-4">Total users</p><p className="text-3xl font-black">{demoWorkers.length}</p></Card>
        <Card><BriefcaseBusiness /><p className="mt-4">Active jobs</p><p className="text-3xl font-black">{demoJobs.length}</p></Card>
        <Card><WalletCards /><p className="mt-4">Wallet activity</p><p className="text-3xl font-black">{demoTransactions.length}</p></Card>
        <Card><BarChart3 /><p className="mt-4">Revenue analytics</p><p className="text-3xl font-black">KES 150</p></Card>
        <Card><AlertTriangle /><p className="mt-4">Fraud alerts</p><p className="text-3xl font-black">1</p></Card>
        <Card><Activity /><p className="mt-4">Audit logs</p><p className="text-3xl font-black">18</p></Card>
      </div>
      <div className="grid gap-3 md:grid-cols-4">{["kyc", "reports", "transactions", "users"].map(item => <Link className="glass rounded-2xl p-5 text-center font-bold capitalize" href={`/admin/${item}`} key={item}>{item}</Link>)}</div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><ShieldBan /><h2 className="mt-3 font-black">Moderation tools</h2><p className="mt-2 text-sm text-smoky/70">Suspend users, moderate jobs, manage disputes, verify workers, and track reported accounts.</p></Card>
        <Card><Megaphone /><h2 className="mt-3 font-black">Broadcast notifications</h2><p className="mt-2 text-sm text-smoky/70">Send platform-wide alerts for policy, payment, and safety updates.</p></Card>
        <Card><BarChart3 /><h2 className="mt-3 font-black">Platform statistics</h2><p className="mt-2 text-sm text-smoky/70">Monitor completed jobs, revenue, fraud signals, and wallet movement.</p></Card>
      </div>
    </div>
  );
}
