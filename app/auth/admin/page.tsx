"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
      await loginAsAdmin(String(form.get("username") ?? ""), String(form.get("password") ?? ""), String(form.get("twoFactorCode") ?? ""));
      window.location.assign("/admin");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin sign in failed.";
      setError(message);
      toast.error(message);
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto mt-16 w-full max-w-md">
      <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Hidden administration</p>
      <h1 className="mt-2 text-3xl font-black text-[#FFFBFF]">Admin access</h1>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <label className="temp-label">Username<div className="temp-input flex items-center gap-3 px-3"><UserRound size={18} /><input name="username" required className="min-w-0 flex-1 bg-transparent outline-none" /></div></label>
        <label className="temp-label">Password<div className="temp-input flex items-center gap-3 px-3"><LockKeyhole size={18} /><input name="password" type="password" required className="min-w-0 flex-1 bg-transparent outline-none" /></div></label>
        <label className="temp-label">2FA code<div className="temp-input flex items-center gap-3 px-3"><LockKeyhole size={18} /><input name="twoFactorCode" inputMode="numeric" autoComplete="one-time-code" className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Required when configured" /></div></label>
        {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        <Button type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in as admin"}</Button>
      </form>
    </Card>
  );
}
