"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { verificationPath } from "@/utils/verification-return";
import { loginAsAdmin } from "@/services/auth";
import { LockKeyhole, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      const credential = await loginAsAdmin(String(form.get("username") ?? ""), String(form.get("password") ?? ""), String(form.get("twoFactorCode") ?? ""));
      window.location.assign(credential.user.emailVerified ? "/admin" : verificationPath("/auth/admin"));
    } catch (error) {
      const knownErrors = ["Invalid admin username or password.", "Invalid admin verification code.", "Too many failed attempts. Try again later.", "Admin email verification is required."];
      const message = error instanceof Error && knownErrors.includes(error.message) ? error.message : "Admin sign in is unavailable. Check your details or try again shortly.";
      setError(message);
      toast.error(message);
      setLoading(false);
    }
  }

  return (
    <Card className="copic-admin-login mx-auto my-4 w-full max-w-md sm:my-10">
      <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">COPIC Administration</p>
      <h1 className="mt-2 text-2xl font-black sm:text-3xl">Admin access</h1>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <label className="temp-label">Username<div className="temp-input flex items-center gap-3 px-3"><UserRound size={18} /><input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required className="min-w-0 flex-1 bg-transparent outline-none" /></div></label>
        <label className="temp-label">Password<div className="temp-input flex items-center gap-3 px-3"><LockKeyhole size={18} /><input name="password" type="password" autoComplete="current-password" required className="min-w-0 flex-1 bg-transparent outline-none" /></div></label>
        <label className="temp-label">2FA code<div className="temp-input flex items-center gap-3 px-3"><LockKeyhole size={18} /><input name="twoFactorCode" inputMode="numeric" autoComplete="one-time-code" className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Required when configured" /></div></label>
        {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm copic-error">{error}</p>}
        <Button type="submit" disabled={loading} aria-busy={loading}>{loading ? "Signing in..." : "Sign in as admin"}</Button>
      </form>
    </Card>
  );
}
