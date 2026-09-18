"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { IdentityVerificationModal } from "@/components/verification/IdentityVerificationModal";
import { AddSkillModal } from "@/components/profile/AddSkillModal";
import { RecruitmentApplyLink, RecruitmentHero, RecruitmentOnboardingCard, RecruitmentOpportunityCard, RecruitmentState } from "./RecruitmentUI";
import { clearAcquisitionReturn, rememberAcquisitionReturn, recruitmentVerificationPath } from "@/utils/acquisition-return";
import { reloadVerifiedRecruitmentUser } from "@/services/emailVerification";
import { normalizeVerificationStatus } from "@/utils/verification";

type LinkData = { name: string; service: string | null; rate: number | null; unit: string | null; targetLocation: string | null };
// Only display known product errors; Firebase/network diagnostics must stay out of the UI.
const publicErrors = new Set([
  "Agents cannot refer themselves or another agent.", "This agent link is unavailable.",
  "This referral is for newly created accounts. Existing members can still use COPIC.",
  "Use a worker account for recruitment.", "A profile can have up to 50 services.",
  "Too many link visits. Try again later.", "This recruitment link is inactive or has ended."
]);
function actionError(reason: unknown) {
  return reason instanceof Error && publicErrors.has(reason.message) ? reason.message : "We couldn't continue your application. Please try again.";
}

export function RecruitmentLanding({ id, type }: { id: string; type: "admin_campaign" | "agent_referral" }) {
  const { user, profile, refreshProfile, loading } = useAuth();
  const [link, setLink] = useState<LinkData | null>(null);
  const [error, setError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [verify, setVerify] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [skillModal, setSkillModal] = useState(false);
  const [attached, setAttached] = useState(false);
  const [verifiedUid, setVerifiedUid] = useState("");
  const returnPath = `/${type === "admin_campaign" ? "recruit" : "join"}/${id}`;
  const endpoint = `/api/acquisition?id=${encodeURIComponent(id)}&type=${type}`;
  const action = useCallback(async (name: string) => {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}) }, body: JSON.stringify({ action: name }) });
    const data = await response.json();
    if (!response.ok) {
      if (data.error === "EMAIL_NOT_VERIFIED") window.location.replace(recruitmentVerificationPath(returnPath));
      throw new Error(data.error ?? "Unable to continue.");
    }
    return data;
  }, [endpoint, user, returnPath]);
  useEffect(() => {
    rememberAcquisitionReturn(returnPath);
    if (loading || !user) return;
    let stopped = false;
    void reloadVerifiedRecruitmentUser().then(verified => {
      if (stopped) return;
      if (!verified) window.location.replace(recruitmentVerificationPath(returnPath));
      else setVerifiedUid(user.uid);
    }).catch(() => { if (!stopped) setError("We couldn't check your email verification. Refresh to try again."); });
    return () => { stopped = true; };
  }, [loading, user, returnPath]);
  useEffect(() => {
    let stopped = false;
    fetch(endpoint).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 410 || response.status === 400 ? "This recruitment link is unavailable or has ended. Please contact the person who shared it." : "We couldn't load this opportunity. Please refresh to try again.");
      if (!stopped) setLink(data.link);
    }).catch(reason => { if (!stopped) setLinkError(reason instanceof Error && reason.message.startsWith("This recruitment link") ? reason.message : "We couldn't load this opportunity. Please refresh to try again."); });
    return () => { stopped = true; };
  }, [endpoint]);
  useEffect(() => {
    if (!link) return;
    let stopped = false;
    void action("link_clicked").then(async () => {
      if (user && profile && verifiedUid === user.uid) {
        await action("attach");
        if (!stopped) setAttached(true);
      }
    }).catch(reason => { if (!stopped) setError(actionError(reason)); });
    return () => { stopped = true; };
  }, [link, user, profile, action, verifiedUid]);

  if (linkError) return <RecruitmentState title="Opportunity unavailable" error><p>{linkError}</p><Link href="/" className="recruitment-secondary mt-5">Explore COPIC</Link></RecruitmentState>;
  if (loading || (user && verifiedUid !== user.uid)) return <RecruitmentState title={error ? "Unable to continue" : "Checking email verification…"} error={!!error}>{error || "We'll return you to this opportunity once your email is verified."}</RecruitmentState>;
  if (!link) return <RecruitmentState title="Loading your opportunity…">Getting the recruitment details.</RecruitmentState>;

  const service = link.service?.trim() || null;
  const missingService = type === "admin_campaign" && !service;
  const verificationStatus = normalizeVerificationStatus(profile?.verificationStatus);
  // A refreshed admin campaign can recognize the service already on the profile.
  const existingService = type === "admin_campaign" && !!service && !!profile && [...profile.skills, ...(profile.skillProfiles ?? []).map(skill => skill.name)].some(name => name.trim().toLowerCase() === service.toLowerCase());
  const serviceComplete = added || existingService;
  return <div className="recruitment-page">
    <RecruitmentHero service={service} location={link.targetLocation} />
    {error && <p role="alert" className="copic-error">{error}</p>}
    <RecruitmentOpportunityCard service={service} rate={link.rate} unit={link.unit}>
      {missingService ? <p role="status">Service details are not available. Please contact the person who shared this link.</p> : !user ? <>
        <p className="mb-4 text-sm copic-muted">Create your free COPIC account to continue.</p>
        <RecruitmentApplyLink href={`/auth/register?returnTo=${encodeURIComponent(returnPath)}`} onClick={() => void action("signup_started").catch(() => undefined)}>{service ? `Apply as a ${service} worker` : "Apply to COPIC"}</RecruitmentApplyLink>
        <p className="mt-4 text-center text-sm copic-muted">Already registered? <Link className="inline-flex min-h-11 items-center px-2 font-bold underline underline-offset-4" href={`/auth/login?returnTo=${encodeURIComponent(returnPath)}`}>Sign in</Link></p>
      </> : !profile ? <RecruitmentApplyLink href={`/complete-profile?returnTo=${encodeURIComponent(returnPath)}`}>Complete your free account</RecruitmentApplyLink> : !serviceComplete ? <Button className="recruitment-primary" disabled={busy || (!attached && type === "admin_campaign")} aria-busy={busy} onClick={async () => {
        setBusy(true); setError("");
        try {
          if (type === "admin_campaign") { await action("add_skill"); await refreshProfile(); setAdded(true); }
          else { await action("enable_worker"); await refreshProfile(); setSkillModal(true); }
        } catch (reason) { setError(actionError(reason)); }
        finally { setBusy(false); }
      }}><span>{`Add ${service ?? "a service"} to my profile`}</span><ArrowRight size={20} aria-hidden="true" className={busy ? "shrink-0 animate-pulse" : "shrink-0"} /></Button> : <p className="font-semibold" role="status">This service is on your profile.</p>}
    </RecruitmentOpportunityCard>
    {user && profile && serviceComplete && <RecruitmentOnboardingCard status={verificationStatus === "approved" ? "complete" : submitted || verificationStatus === "pending" ? "pending" : "required"} onVerify={() => { void action("id_verification_started").catch(() => undefined); setVerify(true); }} onLeave={clearAcquisitionReturn} />}
    {verify && profile && <IdentityVerificationModal profile={profile} onClose={() => setVerify(false)} onSubmitted={async () => { setSubmitted(true); setVerify(false); clearAcquisitionReturn(); await refreshProfile(); }} />}
    {skillModal && profile && <AddSkillModal initialName={service ?? undefined} onClose={() => setSkillModal(false)} onSaved={async () => { setSkillModal(false); setAdded(true); await refreshProfile(); }} />}
  </div>;
}
