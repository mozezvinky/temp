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
  const [verifiedUid, setVerifiedUid] = useState("");
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
    if (loading || !user || profile?.agentEnabled) return;
    let stopped = false;
    void reloadVerifiedRecruitmentUser().then(verified => {
      if (stopped) return;
      if (verified) setVerifiedUid(user.uid);
      else window.location.replace(recruitmentVerificationPath(AGENT_ONBOARDING_PATH));
    }).catch(() => { if (!stopped) setError("We couldn't check your email verification. Refresh to try again."); });
    return () => { stopped = true; };
  }, [loading, user, profile?.agentEnabled]);

  async function activate() {
    if (!user || !accepted || busy) return;
    setBusy(true); setError("");
    try {
      if (!await reloadVerifiedRecruitmentUser()) {
        window.location.replace(recruitmentVerificationPath(AGENT_ONBOARDING_PATH));
        return;
      }
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ action: "register", acceptTerms: true, termsVersion: AGENT_TERMS_VERSION }) });
      if (!response.ok) {
        setError(response.status === 409 ? "This account already has a worker referral relationship. Contact COPIC support before becoming an Agent." : response.status === 403 ? "This account cannot be activated. Check your email verification and account status." : "We couldn't activate your Agent account. Please try again.");
        return;
      }
      setActivated(true);
      clearAcquisitionReturn();
      await refreshProfile();
      window.location.assign("/agent");
    } catch { setError("We couldn't finish opening your Agent account. Please try again or open your Agent Dashboard if activation succeeded."); }
    finally { setBusy(false); }
  }

  if (loading) return <RecruitmentState title="Checking your Agent status…" />;
  if (profile?.agentEnabled || activated) return <RecruitmentState title="You're a COPIC Agent."><p>Your Agent Dashboard has your worker referral links and commissions.</p><div className="mt-6"><RecruitmentApplyLink href="/agent" onClick={clearAcquisitionReturn}>Open Agent Dashboard</RecruitmentApplyLink></div></RecruitmentState>;
  if (user && verifiedUid !== user.uid) return <RecruitmentState title={error ? "Unable to continue" : "Checking email verification…"} error={!!error}>{error || "Verify your email to continue setting up your Agent account."}</RecruitmentState>;

  return <div className="recruitment-page">
    <header className="space-y-3"><p className="copic-eyebrow">COPIC Agent Program</p><h1 className="recruitment-title">{user ? "You're almost ready." : "Become a COPIC Agent"}</h1><p className="copic-muted">Help genuine service providers join COPIC and earn commission from eligible work completed by workers you successfully refer.</p></header>
    <Card className="recruitment-opportunity">
      <p className="copic-eyebrow">Your commission</p>
      {rate !== null ? <><h2 className="recruitment-rate mt-3">Earn {(rate * 100).toLocaleString("en-KE", { maximumFractionDigits: 4 })}% commission</h2><p className="mt-3 copic-muted">For an eligible KSh 1,000 completed job, your commission is KSh {(1000 * rate).toLocaleString("en-KE", { maximumFractionDigits: 2 })}.</p><p className="mt-2 text-sm copic-muted">For every eligible job successfully completed according to COPIC&apos;s completion rules by a worker validly referred to you, you earn {(rate * 100).toLocaleString("en-KE", { maximumFractionDigits: 4 })}% commission on the eligible job amount.</p></> : <p role="status" className="mt-3 copic-muted">{rateError ? "Commission information is temporarily unavailable. Please try again later." : "Loading the current commission…"}</p>}
    </Card>
    {!user ? <Card><h2 className="text-xl font-bold">How it works</h2><ol className="agent-program-steps mt-4">{["Become an Agent", "Share your referral links", "Refer genuine workers", "Earn eligible commissions"].map((step, i) => <li key={step}><span aria-hidden="true">{i + 1}</span>{step}</li>)}</ol><div className="mt-7"><RecruitmentApplyLink href="/auth/register?returnTo=%2Fbecome-agent" onClick={() => rememberAcquisitionReturn(AGENT_ONBOARDING_PATH)}>Become a COPIC Agent</RecruitmentApplyLink></div><p className="mt-4 text-center copic-muted">Already registered? <Link href="/auth/login?returnTo=%2Fbecome-agent" className="inline-flex min-h-11 items-center px-2 font-bold underline">Sign in</Link></p></Card> : !profile ? <Card><p>Complete your COPIC profile before activating your Agent account.</p><div className="mt-5"><RecruitmentApplyLink href="/complete-profile?returnTo=%2Fbecome-agent">Complete my account</RecruitmentApplyLink></div></Card> : <Card>
      <h2 className="text-xl font-bold">Your role and program rules</h2>
      <ul className="mt-4 space-y-3">{agentProgramRules.map(rule => <li className="flex items-start gap-3" key={rule}><Check size={18} className="mt-1 shrink-0" aria-hidden="true" /><span>{rule}</span></li>)}</ul>
      <form className="mt-6 space-y-5" onSubmit={event => { event.preventDefault(); void activate(); }}>
        <div className="flex items-start gap-3"><input id="agent-terms" type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} required disabled={busy} className="mt-3 h-5 w-5 shrink-0" /><label htmlFor="agent-terms" className="min-h-11 py-2">I agree to the <Link href="/legal/agent-terms" target="_blank" rel="noopener noreferrer" className="font-bold underline">COPIC Agent Terms</Link>.</label></div>
        {error && <p role="alert" className="copic-error">{error}</p>}
        <Button className="recruitment-primary w-full" type="submit" disabled={!accepted || busy || rate === null} aria-busy={busy}><span>{busy ? "Activating Agent account…" : "Activate my Agent Account"}</span><ArrowRight size={20} aria-hidden="true" className="shrink-0" /></Button>
      </form>
    </Card>}
  </div>;
}
