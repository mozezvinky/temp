"use client";
import { rememberVerificationReturn, clearVerificationReturn } from "@/utils/verification-return";
import { useCallback, useEffect, useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { logout } from "@/services/auth";
import { reloadVerifiedRecruitmentUser, deliverVerificationEmail, verificationDeliveryStatus } from "@/services/emailVerification";
import { rememberAcquisitionReturn, safeAcquisitionPath } from "@/utils/acquisition-return";
import { accountDestination } from "@/utils/onboarding";
import { requireAuth } from "@/lib/firebase";

export function RecruitmentEmailVerification({ returnPath }: { returnPath: string }) {
  const { user, resolveProfile } = useAuth();
  const [busy, setBusy] = useState<"send" | "check" | "logout" | null>(null);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [remaining, setRemaining] = useState(0);
  const running = useRef(false);
  const leaving = useRef(false);
  const cooldown = useRef(0);
  const initialized = useRef("");

  const check = useCallback(async (manual: boolean) => {
    if (!user || running.current || leaving.current) return;
    running.current = true; setBusy("check"); setMessage("");
    try {
      if (!await reloadVerifiedRecruitmentUser()) {
        if (manual) setMessage("Your email hasn't been verified yet. Open the link in your email, then try again.");
        return;
      }
      const profile = await resolveProfile();
      if (!leaving.current && requireAuth().currentUser?.uid === user.uid) {
        const destination = accountDestination(profile, returnPath);
        clearVerificationReturn();
        window.location.replace(destination);
      }
    } catch { setMessage("Unable to refresh your account. Please try again, or use another account."); }
    finally { running.current = false; setBusy(null); }
  }, [user, returnPath, resolveProfile]);

  const send = useCallback(async () => {
    if (!user || running.current || leaving.current || Date.now() < cooldown.current) return;
    running.current = true; setBusy("send"); setMessage("");
    try {
      const result = await deliverVerificationEmail(returnPath);
      if (leaving.current || requireAuth().currentUser?.uid !== user.uid) return;
      setSent(result.sent === true);
      cooldown.current = result.retryAt || 0;
      setRemaining(Math.max(0, Math.ceil((cooldown.current - Date.now()) / 1000)));
      setMessage(result.error || "Verification email sent.");
    } catch { setMessage("Unable to send the verification email. Please try again."); }
    finally { running.current = false; setBusy(null); }
  }, [user, returnPath]);

  useEffect(() => {
    if (!user || leaving.current) return;
    rememberVerificationReturn(returnPath);
    if (safeAcquisitionPath(returnPath)) rememberAcquisitionReturn(returnPath);
    if (initialized.current === user.uid) return;
    initialized.current = user.uid;
    const delivery = verificationDeliveryStatus(user.uid);
    setSent(delivery.sent === true);
    setMessage(delivery.error || (delivery.sent ? "Verification email sent." : ""));
    cooldown.current = delivery.retryAt || 0;
    setRemaining(Math.max(0, Math.ceil((cooldown.current - Date.now()) / 1000)));
    if (!delivery.error) void check(false);
  }, [user, returnPath, check]);

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((cooldown.current - Date.now()) / 1000))), 1000);
    const onFocus = () => { void check(false); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [check]);

  async function signOut() {
    if (leaving.current) return;
    leaving.current = true; setBusy("logout");
    try { await logout(); window.location.replace("/auth/login"); }
    catch { leaving.current = false; setBusy(null); setMessage("Unable to sign out. Please try again."); }
  }

  if (!user) return <Card className="mx-auto max-w-lg space-y-4"><LoadingSpinner label="Checking session" /><Button onClick={() => window.location.replace(`/auth/login?returnTo=${encodeURIComponent(returnPath)}`)}>Sign in / Use Another Account</Button></Card>;
  return <Card className="recruitment-page mx-auto max-w-lg">
    <MailCheck className="text-lime" aria-hidden="true" /><p className="copic-eyebrow">Account setup</p>
    <h1 className="mt-4 text-3xl font-black">Verify your email</h1>
    <label className="mt-5 block text-sm font-bold" htmlFor="verification-email">Email address</label>
    <input id="verification-email" type="email" readOnly value={user.email || ""} className="copic-auth-field mt-2 w-full min-w-0" />
    <p className="mt-3 break-words text-sm copic-muted">{sent ? `We've sent a verification link to ${user.email}. Open the link in your inbox, then return here.` : "Send a verification link to this email address to continue setting up your account."}</p>
    <p className="mt-3 text-sm copic-muted">Check your spam folder too. If the link has expired, request a new email below.</p>
    {message && <p role="status" aria-live="polite" className="mt-4 text-sm">{message}</p>}
    <div className="mt-5 grid gap-3">
      <Button type="button" disabled={!!busy || remaining > 0} onClick={() => void send()}>{busy === "send" ? "Sending…" : remaining > 0 ? `Resend Verification Email (${remaining}s)` : sent ? "Resend Verification Email" : "Verify Email"}</Button>
      <Button type="button" className="recruitment-primary" disabled={!!busy} onClick={() => void check(true)}>{busy === "check" ? "Checking…" : "I've Verified My Email"}</Button>
      <Button type="button" variant="ghost" disabled={busy === "logout"} onClick={() => void signOut()}>{busy === "logout" ? "Signing out…" : "Sign Out / Use Another Account"}</Button>
    </div>
  </Card>;
}
