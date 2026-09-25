"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RecruitmentApplyLink, RecruitmentState } from "@/components/profile/RecruitmentUI";
import { AGENT_ONBOARDING_PATH, AGENT_TERMS_VERSION, agentProgramRules } from "@/lib/agent-program";
import { rememberAcquisitionReturn, clearAcquisitionReturn, recruitmentVerificationPath } from "@/utils/acquisition-return";
import { reloadVerifiedRecruitmentUser } from "@/services/emailVerification";

export default function BecomeAgentPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [rate, setRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    void fetch("/api/agent/program", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (typeof data.commissionRate !== "number") throw new Error();
      if (!stopped) setRate(data.commissionRate);
    }).catch(() => { if (!stopped) setRateError(true); });
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    // Explicit Agent intent replaces any stale worker recruitment return destination.
    if (profile?.agentEnabled) clearAcquisitionReturn();
    else rememberAcquisitionReturn(AGENT_ONBOARDING_PATH);
    setAccepted(false);
    setActivated(false);
    setNeedsVerification(false);
    setError("");
  }, [user?.uid, profile?.agentEnabled]);

  async function activate() {
    if (!accepted || busy) return;
    if (!user) {
      window.location.assign("/auth/register?returnTo=%2Fbecome-agent");
      return;
    }
    setBusy(true); setError("");
    try {
      if (!await reloadVerifiedRecruitmentUser()) {
        setNeedsVerification(true);
        return;
      }
      setNeedsVerification(false);
      if (!profile) {
        window.location.assign("/complete-profile?returnTo=%2Fbecome-agent");
        return;
      }
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ action: "register", acceptTerms: true, termsVersion: AGENT_TERMS_VERSION }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (payload.error === "EMAIL_NOT_VERIFIED") {
          setNeedsVerification(true);
          return;
        }
        setError(response.status === 409 ? "This account already has a worker referral relationship. Contact COPIC support before becoming an Agent." : response.status === 403 ? "This account is not eligible for Agent activation. Contact COPIC support to check your account status." : "We couldn't activate your Agent account. Please try again.");
        return;
      }
      setActivated(true);
      clearAcquisitionReturn();
      await refreshProfile();
      window.location.assign("/agent");
    } catch { setError("We couldn't finish opening your Agent account. Please try again or open your Agent Dashboard if activation succeeded."); }
    finally { setBusy(false); }
  }

  if (loading && !user) return <RecruitmentState title="Checking your Agent status…" />;
  if (profile?.agentEnabled || activated) return <RecruitmentState title="You're a COPIC Agent."><p>Your Agent Dashboard has your worker referral links and commissions.</p><div className="mt-6"><RecruitmentApplyLink href="/agent" onClick={clearAcquisitionReturn}>Open Agent Dashboard</RecruitmentApplyLink></div></RecruitmentState>;
  if (user && accepted && needsVerification) return <RecruitmentState title="Verify your email" error={!!error}>
    <p>{error || "Verify your email to continue setting up your Agent account."}</p>
    <div className="mt-6 flex flex-wrap gap-3">
      <RecruitmentApplyLink href={recruitmentVerificationPath(AGENT_ONBOARDING_PATH)}>Verify email</RecruitmentApplyLink>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void activate()}>{busy ? "Checking…" : "I've verified my email — check again"}</Button>
    </div>
  </RecruitmentState>;

  return <div className="recruitment-page">
    <header className="space-y-3"><p className="copic-eyebrow">COPIC Agent Program</p><h1 className="recruitment-title">{user ? "You're almost ready." : "Become a COPIC Agent"}</h1><p className="copic-muted">Help genuine service providers join COPIC and earn commission from eligible work completed by workers you successfully refer.</p></header>
    <Card className="recruitment-opportunity">
      <p className="copic-eyebrow">Your commission</p>
      {rate !== null ? <>
        <h2 className="recruitment-rate mt-3">Earn {(rate * 100).toLocaleString("en-KE", { maximumFractionDigits: 4 })}% commission</h2>
        <div className="mt-4 space-y-4 leading-relaxed">
          <p>For every eligible job successfully completed by a worker you validly referred to COPIC, <strong>you earn 1% of the eligible job amount.</strong></p>
          <p>For example, if your worker completes an eligible job worth <strong>KSh 1,000</strong>, you earn <strong>KSh 10</strong>.</p>
          <h3 className="pt-3 text-xl font-bold">Your Referrals Can Add Up</h3>
          <p>The more active workers you successfully bring to COPIC, the more completed jobs can contribute to your commission.</p>
          <section className="space-y-3 pt-2" aria-labelledby="agent-example-one">
            <h4 id="agent-example-one" className="font-bold">Example 1 — 100 active workers</h4>
            <p>If you have <strong>100 referred workers</strong>, and each completes one eligible <strong>KSh 1,000 job per day</strong>:</p>
            <p><strong>KSh 10 commission × 100 workers = KSh 1,000 per day</strong></p>
            <p>If that level of activity continued for 30 days, that would equal approximately <strong>KSh 30,000 in commission.</strong></p>
          </section>
          <section className="space-y-3 pt-2" aria-labelledby="agent-example-two">
            <h4 id="agent-example-two" className="font-bold">Example 2 — Build Your Network Consistently</h4>
            <p>If your goal is to recruit just <strong>1 genuine worker per day</strong>, after one year you could have <strong>365 referred workers</strong>.</p>
            <p>Even if only <strong>120 of those workers</strong> completed one eligible KSh 1,000 job on a given day:</p>
            <p><strong>120 workers × KSh 10 = KSh 1,200 in commission that day.</strong></p>
            <p>If that level of activity occurred every day for 30 days, that would equal <strong>KSh 36,000.</strong></p>
          </section>
          <section className="space-y-3 pt-2" aria-labelledby="agent-example-three">
            <h4 id="agent-example-three" className="font-bold">Example 3 — Recruit 3 Workers a Day</h4>
            <p>Recruit <strong>3 genuine workers per day for 30 days</strong>, and you could build a network of:</p>
            <p><strong>3 × 30 = 90 referred workers.</strong></p>
            <p>As those workers complete eligible jobs on COPIC, <strong>you earn your 1% commission on each qualifying completed job.</strong></p>
          </section>
          <h3 className="pt-3 text-xl font-bold">Start Building Your Network</h3>
          <p>You don&apos;t need hundreds of referrals on your first day. Start with one genuine worker, then another.</p>
          <p><strong>Refer workers. Help them get started. Grow your network. Earn 1% from their eligible completed jobs.</strong></p>
          <p className="text-sm copic-muted"><em>The figures above are examples based on the stated assumptions. Actual commission depends on the number and value of eligible jobs successfully completed by your referred workers.</em></p>
        </div>
      </> : <p role="status" className="mt-3 copic-muted">{rateError ? "Commission information is temporarily unavailable. Please try again later." : "Loading the current commission…"}</p>}
    </Card>
    {!user && <Card><h2 className="text-xl font-bold">How it works</h2><ol className="agent-program-steps mt-4">{["Become an Agent", "Share your referral links", "Refer genuine workers", "Earn eligible commissions"].map((step, i) => <li key={step}><span aria-hidden="true">{i + 1}</span>{step}</li>)}</ol><p className="mt-4 text-center copic-muted">Already registered? <Link href="/auth/login?returnTo=%2Fbecome-agent" className="inline-flex min-h-11 items-center px-2 font-bold underline">Sign in</Link></p></Card>}
    <Card>
      <h2 className="text-xl font-bold">Your role and program rules</h2>
      <ul className="mt-4 space-y-3">{agentProgramRules.map(rule => <li className="flex items-start gap-3" key={rule}><Check size={18} className="mt-1 shrink-0" aria-hidden="true" /><span>{rule}</span></li>)}</ul>
      <form className="mt-6 space-y-5" onSubmit={event => { event.preventDefault(); void activate(); }}>
        <div className="flex items-start gap-3"><input id="agent-terms" type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} required disabled={busy} className="mt-3 h-5 w-5 shrink-0" /><label htmlFor="agent-terms" className="min-h-11 py-2">I agree to the <Link href="/legal/agent-terms" target="_blank" rel="noopener noreferrer" className="font-bold underline">COPIC Agent Terms</Link>.</label></div>
        {error && <p role="alert" className="copic-error">{error}</p>}
        <p className="copic-muted">After accepting, continue to account setup. We will ask you to verify your email before activating your Agent account.</p>
        <Button className="recruitment-primary w-full" type="submit" disabled={!accepted || busy || loading || rate === null} aria-busy={busy}><span>{busy ? "Setting up Agent account…" : !user ? "Accept and create my account" : !profile ? "Accept and complete my account" : "Activate my Agent Account"}</span><ArrowRight size={20} aria-hidden="true" className="shrink-0" /></Button>
      </form>
    </Card>
  </div>;
}
