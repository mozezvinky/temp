"use client";

import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { demoJobs, demoTransactions } from "@/lib/demoData";
import { kes } from "@/utils/money";
import { Activity, BriefcaseBusiness, CheckCircle2, Clock, MessageCircle, ReceiptText, ShieldCheck, Star, TrendingUp, UsersRound, Wallet } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute();
  if (loading || !isAuthorized || !profile) return <LoadingSpinner label="Opening dashboard" />;

  if (profile.role === "client") {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm text-floral/65">Hello {profile.displayName}</p>
          <h1 className="text-3xl font-black">Client dashboard</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card><ReceiptText /><p className="mt-4 text-sm">Post work</p><p className="text-3xl font-black">{demoJobs.length}</p></Card>
          <Card><UsersRound /><p className="mt-4 text-sm">Applicants</p><p className="text-3xl font-black">12</p></Card>
          <Card><MessageCircle /><p className="mt-4 text-sm">Active chats</p><p className="text-3xl font-black">3</p></Card>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/find-work" className="glass rounded-2xl p-6"><h2 className="text-xl font-black">Find Work</h2><p className="mt-2 text-sm text-floral/70">Post a job with description, budget, and timeline.</p></Link>
          <Link href="/workers" className="glass rounded-2xl p-6"><h2 className="text-xl font-black">Workers</h2><p className="mt-2 text-sm text-floral/70">Search verified workers by category, skill, and rating.</p></Link>
          <Link href="/applications" className="glass rounded-2xl p-6"><h2 className="text-xl font-black">Manage applicants</h2><p className="mt-2 text-sm text-floral/70">Review worker applications and unlock chat after acceptance.</p></Link>
        </div>
        <Card><h2 className="font-black">Client trust snapshot</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><p className="rounded-2xl bg-smoky/10 p-3 text-sm">Payment reliability: 96%</p><p className="rounded-2xl bg-smoky/10 p-3 text-sm">Completed hires: 24</p><p className="rounded-2xl bg-smoky/10 p-3 text-sm">Worker rating: 4.7</p></div></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-floral/65">Hello {profile.displayName}</p>
        <h1 className="text-3xl font-black">Worker dashboard</h1>
      </div>
      {profile?.isLocked && <div className="rounded-2xl bg-olive p-4 text-floral">{profile.lockReason}</div>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card><BriefcaseBusiness /><p className="mt-4 text-sm">Active jobs</p><p className="text-3xl font-black">2</p></Card>
        <Card><CheckCircle2 /><p className="mt-4 text-sm">Completed jobs</p><p className="text-3xl font-black">{profile.completedJobs}</p></Card>
        <Card><Star /><p className="mt-4 text-sm">Rating</p><p className="text-3xl font-black">{profile.ratingAverage || 0}</p></Card>
        <Card><TrendingUp /><p className="mt-4 text-sm">Acceptance rate</p><p className="text-3xl font-black">82%</p></Card>
        <Card><Wallet /><p className="mt-4 text-sm">Earnings</p><p className="text-3xl font-black">{kes(demoTransactions[0].amount)}</p></Card>
        <Card><Clock /><p className="mt-4 text-sm">Pending payments</p><p className="text-3xl font-black">{kes(150)}</p></Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/jobs" className="glass rounded-2xl p-6"><h2 className="text-xl font-black">Find Jobs</h2><p className="mt-2 text-sm text-floral/70">Browse temporary jobs and apply with your worker profile.</p></Link>
        <Link href="/chat" className="glass rounded-2xl p-6"><h2 className="text-xl font-black">Chat</h2><p className="mt-2 text-sm text-floral/70">Message clients after an application or invitation is accepted.</p></Link>
      </div>
      <Card><h2 className="font-black">Recent activity</h2><div className="mt-4 grid gap-3"><p className="rounded-2xl bg-smoky/10 p-3 text-sm"><Activity className="mr-2 inline" size={16} />Application viewed for Office deep cleaning crew.</p><p className="rounded-2xl bg-smoky/10 p-3 text-sm"><ShieldCheck className="mr-2 inline" size={16} />Verification status: {profile.kycStatus}.</p></div></Card>
    </div>
  );
}
