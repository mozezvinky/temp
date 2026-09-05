"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { sendEmailVerificationCode, verifyEmailCode } from "@/services/emailVerification";
import { MailCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

export default function VerifyEmailPage() {
  const { user, profile, loading, isAuthorized, refreshProfile } = useProtectedRoute(["client", "worker"]);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!loading && profile?.emailVerified) window.location.replace(profile.role === "client" ? "/find-work" : "/dashboard");
  }, [loading, profile]);

  async function send() {
    setSending(true);
    try { toast.success(await sendEmailVerificationCode()); setSent(true); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to send code."); }
    finally { setSending(false); }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const otp = String(new FormData(event.currentTarget).get("otp") ?? "").trim();
    setVerifying(true);
    try {
      toast.success(await verifyEmailCode(otp));
      await refreshProfile();
      window.location.assign("/settings");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to verify code."); setVerifying(false); }
  }

  if (loading || !isAuthorized || !profile || !user) return <LoadingSpinner label="Opening email verification" />;
  return <Card className="mx-auto max-w-lg">
    <MailCheck className="text-[#D3C4B3]" />
    <h1 className="mt-4 text-3xl font-black">Verify your email</h1>
    <p className="mt-2 text-sm text-[#CCC6BB]">We will send a 6-digit code to <strong>{user.email}</strong>.</p>
    <Button className="mt-5" type="button" disabled={sending} onClick={() => void send()}>{sending ? "Sending..." : sent ? "Resend code" : "Send verification code"}</Button>
    <form onSubmit={verify} className="mt-5 grid gap-3">
      <label className="temp-label">Verification code<input name="otp" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" className="temp-input p-3 text-center text-2xl tracking-[.4em] outline-none" /></label>
      <Button type="submit" disabled={verifying}>{verifying ? "Verifying..." : "Verify email"}</Button>
    </form>
  </Card>;
}
