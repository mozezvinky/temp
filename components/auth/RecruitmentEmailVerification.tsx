"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { createProfile, logout } from "@/services/auth";
import { reloadVerifiedRecruitmentUser, sendRecruitmentVerificationEmail } from "@/services/emailVerification";
import { rememberAcquisitionReturn } from "@/utils/acquisition-return";
import { requireAuth } from "@/lib/firebase";

export function RecruitmentEmailVerification({ returnPath }: { returnPath: string }) {
  const { user, profile, loading } = useAuth();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const sendingRef = useRef(false);
  const checkingRef = useRef(false);
  const cooldown = useRef(0);
  const initialized = useRef("");

  const check = useCallback(async (manual: boolean) => {
    if (!user || checkingRef.current) return false;
    checkingRef.current = true;
    setChecking(true);
    try {
      if (!await reloadVerifiedRecruitmentUser()) {
        if (manual) setMessage("Your email hasn't been verified yet. Open the verification email and complete verification first.");
        return false;
      }
      // New email/link accounts may not have completed COPIC profile creation yet.
      if (!profile?.role) await createProfile(user.uid, "worker", user.displayName ?? "Copic user", user.email ?? undefined);
      if (requireAuth().currentUser?.uid === user.uid) window.location.replace(returnPath);
      return true;
    } catch {
      setMessage("We couldn't check your email verification. Please try again.");
      return false;
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [user, profile, returnPath]);

  const send = useCallback(async () => {
    if (!user || sendingRef.current || Date.now() < cooldown.current) return;
    sendingRef.current = true;
    setSending(true);
    setMessage("");
    // Persist the cooldown so refreshing cannot accidentally trigger repeated sends.
    cooldown.current = Date.now() + 60_000;
    setRemaining(60);
    try { localStorage.setItem(`copic.verification.resend.${user.uid}`, String(cooldown.current)); } catch { /* Firebase also rate limits sends. */ }
    try {
      await sendRecruitmentVerificationEmail(returnPath);
      setSent(true);
    } catch (error) {
      const code = (error as { code?: string }).code;
      setMessage(code === "auth/too-many-requests"
        ? "Too many requests. Please wait before resending your verification email."
        : "We couldn't send your verification email. Please try again shortly.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [user, returnPath]);

  useEffect(() => {
    rememberAcquisitionReturn(returnPath);
    if (loading) return;
    if (!user) {
      window.location.replace(`/auth/login?returnTo=${encodeURIComponent(returnPath)}`);
      return;
    }
    if (initialized.current === user.uid) return;
    initialized.current = user.uid;
    try { cooldown.current = Number(localStorage.getItem(`copic.verification.resend.${user.uid}`)) || 0; } catch { /* Storage is optional. */ }
    setRemaining(Math.max(0, Math.ceil((cooldown.current - Date.now()) / 1000)));
    const [, kind, id] = returnPath.split("/");
    void (async () => {
      try {
        if (returnPath !== "/become-agent") {
        const response = await fetch(`/api/acquisition?id=${encodeURIComponent(id)}&type=${kind === "join" ? "agent_referral" : "admin_campaign"}`, { cache: "no-store" });
        if (!response.ok) {
          setUnavailable(true);
          setMessage("This recruitment link is unavailable or has ended. Please contact the person who shared it.");
          return;
        }
        }
        if (requireAuth().currentUser?.uid !== user.uid) return;
        if (!await check(false)) await send();
      } catch { setMessage("We couldn't load your application. Refresh the page to try again."); }
    })();
  }, [loading, user, returnPath, check, send]);

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((cooldown.current - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading || !user) return <LoadingSpinner label="Opening email verification" />;
  return <Card className="recruitment-page mx-auto max-w-lg">
    <MailCheck className="text-lime" aria-hidden="true" /><p className="copic-eyebrow">Onboarding process</p>
    <h1 className="mt-4 text-3xl font-black">Verify your email</h1>
    <p className="mt-2 break-words text-sm copic-muted">{sent ? "We've sent a verification link to " : "Verify the email address "}<strong>{user.email}</strong>. {returnPath === "/become-agent" ? "Verify your email to continue setting up your COPIC Agent account." : "Verify your email to continue your application."}</p>
    <p className="mt-3 text-sm copic-muted">If the link has expired, request a new email below. You can also verify on another device and return here.</p>
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    <div className="mt-5 grid gap-3">
      <Button type="button" disabled={sending || checking || unavailable || remaining > 0} onClick={() => void send()}>{sending ? "Sending..." : remaining > 0 ? `Resend verification email (${remaining}s)` : "Resend verification email"}</Button>
      <Button type="button" className="recruitment-primary" variant="primary" disabled={checking || sending || unavailable} onClick={() => void check(true)}>{checking ? "Checking..." : "I've verified my email"}</Button>
      <Button type="button" variant="ghost" onClick={async () => {
        try {
          await logout();
          window.location.replace(`/auth/login?returnTo=${encodeURIComponent(returnPath)}`);
        } catch { setMessage("Unable to sign out. Please try again."); }
      }}>Sign out / change account</Button>
    </div>
  </Card>;
}
