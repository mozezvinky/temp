"use client";

import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { usePublicOnlyRoute } from "@/hooks/useProtectedRoute";
import { authErrorMessage, loginWithEmail, loginWithGoogle, registerWithEmail } from "@/services/auth";
import type { Role } from "@/types";
import { BriefcaseBusiness, Mail, Phone, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { loading: authChecking, shouldRender } = usePublicOnlyRoute();
  const [role, setRole] = useState<Role>("worker");
  const [loading, setLoading] = useState(false);

  if (authChecking || !shouldRender || loading) return <LoadingSpinner label={loading ? "Signing you in" : "Checking session"} />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    window.localStorage.setItem("temp_pending_role", role);
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "register") {
        await registerWithEmail(String(form.get("email")), String(form.get("password")), String(form.get("displayName")), role);
      } else {
        await loginWithEmail(String(form.get("email")), String(form.get("password")));
      }
      router.replace(mode === "register" ? (role === "client" ? "/find-work" : "/jobs") : "/dashboard");
    } catch (error) {
      toast.error(authErrorMessage(error));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass mx-auto max-w-md rounded-2xl p-6">
      <h1 className="text-3xl font-black">{mode === "login" ? "Welcome back" : "Create your Temp account"}</h1>
      <p className="mt-2 text-sm text-floral/70">Email, Google, and phone OTP-ready Firebase authentication.</p>
      {mode === "register" && (
        <>
          <input name="displayName" required placeholder="Full name" className="mt-6 w-full rounded-2xl border border-bone/20 bg-smoky px-4 py-3 outline-none" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(["worker", "client"] as Role[]).map(item => (
              <button type="button" key={item} onClick={() => setRole(item)} className={`rounded-2xl px-3 py-2 text-sm capitalize ${role === item ? "bg-bone text-smoky" : "bg-olive/40"}`}>{item}</button>
            ))}
          </div>
        </>
      )}
      <input name="email" type="email" required placeholder="Email" className="mt-4 w-full rounded-2xl border border-bone/20 bg-smoky px-4 py-3 outline-none" />
      <input name="password" type="password" required minLength={8} placeholder="Password" className="mt-4 w-full rounded-2xl border border-bone/20 bg-smoky px-4 py-3 outline-none" />
      <Button disabled={loading} className="mt-5 w-full"><Mail size={18} /> {mode === "login" ? "Log in" : "Register"}</Button>
      <button type="button" onClick={() => {
        setLoading(true);
        window.localStorage.setItem("temp_pending_role", role);
        loginWithGoogle(role).then(() => router.replace(mode === "register" ? (role === "client" ? "/find-work" : "/jobs") : "/dashboard")).catch(error => {
          toast.error(authErrorMessage(error));
          setLoading(false);
        });
      }} className="mt-3 w-full rounded-2xl border border-bone/25 px-5 py-3 font-semibold">
        Continue with Google
      </button>
      <div id="recaptcha-container" className="mt-3" />
      <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs text-floral/70">
        <span><BriefcaseBusiness className="mx-auto mb-1" size={16} />Worker</span>
        <span><Phone className="mx-auto mb-1" size={16} />OTP</span>
        <span><ShieldCheck className="mx-auto mb-1" size={16} />KYC</span>
      </div>
    </form>
  );
}
