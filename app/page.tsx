"use client";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { usePublicOnlyRoute } from "@/hooks/useProtectedRoute";
import { motion } from "framer-motion";
import { ArrowRight, BellRing, BriefcaseBusiness, CheckCircle2, MessageCircle, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
import Link from "next/link";

const reveal = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 }
};

const workflows = [
  {
    title: "Find flexible local work",
    body: "Browse open opportunities, compare pay and duration, apply, and follow every status from one workspace.",
    icon: BriefcaseBusiness,
    tags: ["2 hours to 1 year", "Clear pay", "Local work"]
  },
  {
    title: "Hire with confidence",
    body: "Review worker skills and profiles, send direct hire requests, and manage accepted work without losing context.",
    icon: UserRoundCheck,
    tags: ["Worker profiles", "Direct hire", "Verified skills"]
  },
  {
    title: "Complete work clearly",
    body: "Use secure chat, completion requests, payment confirmations, ratings, and a permanent work history.",
    icon: CheckCircle2,
    tags: ["Live status", "Payments", "Ratings"]
  }
];

export default function LandingPage() {
  const { shouldRender } = usePublicOnlyRoute();
  if (!shouldRender) return <LoadingSpinner label="Opening Copic" />;

  return (
    <div className="copic-landing">
      <section className="landing-hero">
        <div className="landing-grid">
          <motion.div {...reveal} transition={{ duration: .55, ease: "easeOut" }}>
            <span className="landing-eyebrow"><Sparkles size={14} /> Kenya&apos;s flexible work marketplace</span>
            <h1 className="landing-title">Connect with <em>opportunities</em>, hire skilled workers, and move forward.</h1>
            <p className="landing-copy">Copic brings workers and clients into one clear workflow—from discovery and direct hiring to live work, completion, payment confirmation, and ratings.</p>
            <div className="landing-actions">
              <Link href="/auth/register" className="landing-cta primary">Start using Copic <ArrowRight size={18} /></Link>
              <Link href="/auth/login" className="landing-cta secondary">Sign in</Link>
            </div>
            <div className="landing-trust">
              <span className="inline-flex items-center gap-2"><ShieldCheck size={18} className="text-[#B2F746]" /> Role-aware accounts</span>
              <span className="inline-flex items-center gap-2"><MessageCircle size={18} className="text-[#B2F746]" /> Secure job chat</span>
              <span className="inline-flex items-center gap-2"><BellRing size={18} className="text-[#B2F746]" /> Real-time alerts</span>
            </div>
          </motion.div>

          <motion.div {...reveal} transition={{ duration: .6, delay: .14, ease: "easeOut" }} className="landing-feature-grid" aria-label="Copic platform highlights">
            <article className="landing-feature-card tall">
              <span className="landing-feature-icon"><BriefcaseBusiness size={23} /></span>
              <div>
                <p className="mb-3 font-mono text-xs uppercase tracking-[.14em] text-[#B2F746]">Flexible by design</p>
                <h3>Work that fits real life</h3>
                <p className="mt-3">Discover jobs lasting from two hours to one year, with the pay, place, requirements, and timeline visible before you apply.</p>
              </div>
            </article>
            <article className="landing-feature-card">
              <span className="landing-feature-icon"><UserRoundCheck size={23} /></span>
              <div><h3>Skilled people</h3><p className="mt-3">Build a practical profile with skills, experience, proof, pricing, and work history.</p></div>
            </article>
            <article className="landing-feature-card">
              <span className="landing-feature-icon"><ShieldCheck size={23} /></span>
              <div><h3>Visible progress</h3><p className="mt-3">Applications, live jobs, requests, completion, and payments stay easy to understand.</p></div>
            </article>
          </motion.div>
        </div>
      </section>

      <section className="landing-opportunities">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[.18em] text-[#B2F746]">One connected platform</p>
            <h2 className="mt-3 text-4xl font-extrabold md:text-5xl">Built around real work</h2>
          </div>
          <Link href="/auth/register" className="inline-flex items-center gap-2 font-bold text-[#B2F746]">Create your account <ArrowRight size={18} /></Link>
        </div>
        <div className="landing-opportunity-grid">
          {workflows.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.article key={item.title} {...reveal} transition={{ duration: .45, delay: index * .08 }} className="landing-opportunity">
                <span className="landing-feature-icon"><Icon size={22} /></span>
                <h3 className="mt-8 text-2xl font-bold">{item.title}</h3>
                <p className="mt-3 leading-6">{item.body}</p>
                <div className="mt-7 flex flex-wrap gap-2">{item.tags.map(tag => <span key={tag} className="rounded-lg border border-[#2b2b2b] bg-[#111] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[#c7c7c7]">{tag}</span>)}</div>
              </motion.article>
            );
          })}
        </div>
      </section>

      <footer className="landing-footer">
        <div><strong className="text-xl text-white">Copic</strong><p className="mt-4 max-w-lg leading-6">Connecting people, earning income, and building careers through transparent local work.</p><p className="mt-7 text-sm">© {new Date().getFullYear()} Copic Marketplace.</p></div>
        <div><strong className="text-white">Company</strong><div className="mt-4 grid gap-3"><Link href="/about">About</Link><Link href="/faq">FAQ</Link></div></div>
        <div><strong className="text-white">Support</strong><div className="mt-4 grid gap-3"><Link href="/help">Help center</Link><Link href="/auth/login">Sign in</Link></div></div>
      </footer>
    </div>
  );
}
