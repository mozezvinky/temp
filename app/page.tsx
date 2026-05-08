"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { usePublicOnlyRoute } from "@/hooks/useProtectedRoute";
import { demoJobs, demoWorkers } from "@/lib/demoData";
import { motion } from "framer-motion";
import { BellRing, BriefcaseBusiness, CheckCircle2, MapPin, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

const features: Array<[string, LucideIcon, string]> = [
  ["KYC-first trust", ShieldCheck, "National ID, selfie checks, duplicate ID detection, and admin review."],
  ["Locked chat", CheckCircle2, "Realtime chat unlocks only after accepted hires or invitations."],
  ["Wallet payments", Wallet, "M-Pesa and cash flows with automatic service-fee enforcement."],
  ["Push alerts", BellRing, "FCM notifications for jobs, messages, payments, locks, and KYC decisions."]
];

export default function LandingPage() {
  const { loading, shouldRender } = usePublicOnlyRoute();
  if (loading || !shouldRender) return <LoadingSpinner label="Opening Temp" />;

  return (
    <div className="space-y-16">
      <section className="grid min-h-[78vh] items-center gap-8 py-8 md:grid-cols-[1.05fr_.95fr]">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
          <p className="text-sm font-bold uppercase tracking-[.24em] text-bone">Kenya temporary work</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-black leading-[1.02] md:text-7xl">Temp</h1>
          <p className="mt-5 max-w-xl text-lg text-floral/75">A premium mobile-first marketplace for verified workers and clients hiring from 2 hours to 1 year.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/jobs"><Button>Find work</Button></Link>
            <Link href="/jobs" className="rounded-2xl border border-bone/25 px-5 py-3 font-semibold">Browse jobs</Link>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .55, delay: .1 }} className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between border-b border-bone/10 pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-bone">Live marketplace</p>
              <h2 className="mt-2 text-2xl font-black">Open temporary jobs</h2>
            </div>
            <BriefcaseBusiness className="h-9 w-9 text-bone" />
          </div>
          <div className="mt-5 grid gap-3">
            {demoJobs.slice(0, 3).map(job => (
              <Card key={job.id} className="bg-bone/95">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-olive">{job.category}</p>
                    <h3 className="mt-1 font-black">{job.title}</h3>
                  </div>
                  <span className="rounded-full bg-smoky px-3 py-1 text-xs font-bold text-floral">{job.durationHours}h</span>
                </div>
                <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-smoky/70"><MapPin size={15} /> {job.location}</p>
              </Card>
            ))}
          </div>
        </motion.div>
      </section>
      <section className="grid gap-4 md:grid-cols-4">
        {features.map(([title, Icon, body]) => <Card key={String(title)}><Icon className="mb-4" /><h3 className="font-black">{title}</h3><p className="mt-2 text-sm text-smoky/70">{body}</p></Card>)}
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {["Post a verified temporary job", "Accept worker applications", "Pay with M-Pesa or confirm cash"].map((step, index) => (
          <div key={step} className="glass rounded-2xl p-6">
            <span className="text-4xl font-black text-bone">0{index + 1}</span>
            <h3 className="mt-6 text-xl font-black">{step}</h3>
          </div>
        ))}
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <Card><ShieldCheck className="mb-4" /><h2 className="text-2xl font-black">Worker trust system</h2><p className="mt-3 text-sm text-smoky/75">Trial Worker badges appear automatically, Trusted Worker unlocks after 3 completed jobs, and Skill Verified appears after category quizzes.</p></Card>
        <Card><Smartphone className="mb-4" /><h2 className="text-2xl font-black">Add to Home Screen</h2><p className="mt-3 text-sm text-smoky/75">Open Temp on mobile, tap the install button or browser share menu, then add Temp to your home screen for an app-like experience.</p></Card>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {demoWorkers.map(worker => <Card key={worker.id}><p className="font-black">{worker.displayName}</p><p className="mt-2 text-sm text-smoky/70">{worker.bio}</p><p className="mt-4 text-sm font-bold">{worker.badges.join(" | ")}</p></Card>)}
      </section>
      <section className="glass rounded-2xl p-8 text-center">
        <BriefcaseBusiness className="mx-auto mb-4 h-10 w-10 text-bone" />
        <h2 className="text-3xl font-black">Hire short-term help with guardrails that matter.</h2>
        <Link href="/auth/register"><Button className="mt-6">Create account</Button></Link>
      </section>
    </div>
  );
}
