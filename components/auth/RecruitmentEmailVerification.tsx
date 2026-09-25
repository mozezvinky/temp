"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { logout } from "@/services/auth";
import { sendEmailVerificationCode, verifyEmailCode } from "@/services/emailVerification";
import { rememberVerificationReturn, clearVerificationReturn } from "@/utils/verification-return";
import { rememberAcquisitionReturn, safeAcquisitionPath } from "@/utils/acquisition-return";
import { accountDestination } from "@/utils/onboarding";
import { requireAuth } from "@/lib/firebase";

export function RecruitmentEmailVerification({ returnPath }: { returnPath: string }) {
  const { user, resolveProfile } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | "logout" | null>(null);
  const [message, setMessage] = useState("");
  const [remaining, setRemaining] = useState(0);
  const initialized = useRef("");
  const leaving = useRef(false);

  const finish = useCallback(async () => {
    const current = requireAuth().currentUser;
    if (!current || !user || current.uid !== user.uid) throw new Error("Please sign in again.");
    await current.reload();
    await current.getIdToken(true);
    if (!current.emailVerified) throw new Error("Your email is not verified yet.");
    const profile = await resolveProfile();
    if (leaving.current) return;
    const destination = accountDestination(profile, returnPath);
    clearVerificationReturn();
    leaving.current = true;
    window.location.replace(destination);
  }, [user, resolveProfile, returnPath]);

  const send = useCallback(async (automatic = false) => {
    if (!user || busy || leaving.current) return;
    setBusy("send"); setMessage("");
    try {
      const result = await sendEmailVerificationCode();
      if (leaving.current || requireAuth().currentUser?.uid !== user.uid) return;
      setRemaining(Number(result.retryAfter ?? 60));
      setMessage(result.alreadyVerified ? "This email is already verified." : "We've sent a 6-digit verification code to your email.");
      if (result.alreadyVerified) await finish();
    } catch (error) {
      const retryAfter = Number((error as { retryAfter?: number }).retryAfter ?? 0);
      if (retryAfter) setRemaining(retryAfter);
      setMessage(error instanceof Error ? error.message : automatic ? "We couldn't send your code. Please try again." : "Unable to resend the code.");
    } finally { setBusy(null); }
  }, [user, busy, finish]);

  useEffect(() => {
    if (!user) return;
    rememberVerificationReturn(returnPath);
    if (safeAcquisitionPath(returnPath)) rememberAcquisitionReturn(returnPath);
    if (initialized.current === user.uid) return;
    initialized.current = user.uid;
    void (async () => {
      if (user.emailVerified) { try { await finish(); } catch { /* The page remains available for recovery. */ } return; }
      await send(true);
    })();
  }, [user, returnPath, send, finish]);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  async function verify() {
    if (!/^\d{6}$/.test(code)) { setMessage("Enter the 6-digit code from your email."); return; }
    setBusy("verify"); setMessage("");
    try { await verifyEmailCode(code); await finish(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to verify the code. Please try again."); }
    finally { setBusy(null); }
  }

  async function signOut(changeEmail = false) {
    if (busy) return;
    setBusy("logout");
    try {
      await logout();
      const next = changeEmail ? `/auth/register?returnTo=${encodeURIComponent(returnPath)}` : `/auth/login?returnTo=${encodeURIComponent(returnPath)}`;
      window.location.replace(next);
    } catch { setBusy(null); setMessage("Unable to sign out. Please try again."); }
  }

  if (!user) return <Card className="mx-auto max-w-lg space-y-4"><LoadingSpinner label="Checking session" /><Button onClick={() => window.location.replace(`/auth/login?returnTo=${encodeURIComponent(returnPath)}`)}>Sign in</Button></Card>;
  return <Card className="recruitment-page mx-auto max-w-lg">
    <MailCheck className="text-lime" aria-hidden="true" /><p className="copic-eyebrow">Account setup</p>
    <h1 className="mt-4 text-3xl font-black">Verify your email</h1>
    <p className="mt-3 break-words text-sm copic-muted">We&apos;ve sent a 6-digit verification code to your email.</p>
    <p className="mt-1 font-semibold">{user.email}</p>
    <label className="mt-5 block text-sm font-bold" htmlFor="verification-code">6-digit verification code</label>
    <input id="verification-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="_ _ _ _ _ _" aria-label="6-digit verification code" className="copic-auth-field mt-2 w-full min-w-0 text-center text-2xl font-bold tracking-[0.45em]" />
    {message && <p role="status" aria-live="polite" className="mt-4 text-sm">{message}</p>}
    <div className="mt-5 grid gap-3">
      <Button type="button" disabled={!!busy || code.length !== 6} onClick={() => void verify()}>{busy === "verify" ? "Verifying…" : "Verify email"}</Button>
      <Button type="button" variant="ghost" disabled={!!busy || remaining > 0} onClick={() => void send()}>{busy === "send" ? "Sending…" : remaining ? `Resend code (${remaining}s)` : "Resend code"}</Button>
      <Button type="button" variant="ghost" disabled={!!busy} onClick={() => void signOut(true)}>Change email</Button>
      <Button type="button" variant="ghost" disabled={!!busy} onClick={() => void signOut(false)}>{busy === "logout" ? "Signing out…" : "Sign out"}</Button>
    </div>
  </Card>;
}
