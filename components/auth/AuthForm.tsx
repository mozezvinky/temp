"use client";
import { useAuth } from "@/context/AuthContext";
import { accountDestination } from "@/utils/onboarding";

import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { usePublicOnlyRoute } from "@/hooks/useProtectedRoute";
import { authErrorMessage, loginWithEmail, registerWithEmail, sendPasswordReset } from "@/services/auth";
import { verificationPath, verificationReturnPath } from "@/utils/verification-return";
import { validSignupEmail } from "@/utils/email-validation";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const { resolveProfile } = useAuth();
  const [emailError, setEmailError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (new URLSearchParams(window.location.search).get("emailChanged") === "1") setNotice("Your email address was updated. Sign in with your new email and verify it to continue."); }, []);
  const { shouldRender } = usePublicOnlyRoute({ disabled: loading });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!validSignupEmail(String(form.get("email")))) { setEmailError("Enter a valid email address."); return; }
    setEmailError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const destination = verificationReturnPath("/complete-profile");
        const user = await registerWithEmail(String(form.get("email")), String(form.get("password")), String(form.get("displayName")));
        window.location.assign(user.emailVerified ? destination : verificationPath(destination));
        return;
      } else {
        const credential = await loginWithEmail(String(form.get("email")), String(form.get("password")));
        await credential.user.reload();
        const destination = verificationReturnPath("");
        if (!credential.user.emailVerified) {
          window.location.assign(verificationPath(destination || "/complete-profile"));
          return;
        }
        const profile = await resolveProfile();
        window.location.assign(accountDestination(profile, destination));
        return;
      }
    } catch (error) {
      toast.error(authErrorMessage(error));
      setLoading(false);
    }
  }

  async function forgotPassword() {
    const email = emailValue.trim();
    if (!email) {
      toast.error("Enter your email first, then tap forgot password.");
      return;
    }
    setResettingPassword(true);
    try {
      await sendPasswordReset(email);
      toast.success("Password reset email sent. Check your inbox.");
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setResettingPassword(false);
    }
  }

  if (!shouldRender || loading) return <LoadingSpinner label={loading ? "Signing you in" : "Checking session"} />;

  return (
    <div className="copic-auth-layout">
      <div className="copic-auth-intro hidden lg:block">
        <p className="copic-eyebrow">Copic Marketplace</p>
        <h1>
          {mode === "login" ? "Welcome back to Copic." : "Create your Copic account."}
        </h1>
        <p>
          {mode === "login" ? "Built for flexible work." : "Find temporary jobs, hire trusted workers, and manage work opportunities easily in one place."}
        </p>
      </div>
      <form onSubmit={submit} className="copic-auth-card">
          {notice && <p role="status" className="copic-muted">{notice}</p>}
          {emailError && <p id="email-error" role="alert" className="copic-error">{emailError}</p>}
          <p className="copic-eyebrow">{mode === "login" ? "Account access" : "Create profile"}</p>
          <h1>{mode === "login" ? "Welcome Back" : "Sign Up"}</h1>
          <p className="copic-auth-copy">{mode === "login" ? "Built for flexible work." : "Find work or hire help in minutes."}</p>
      {mode === "register" && (
        <>
          <label className="copic-auth-field mt-6">
            <UserRound size={18} />
            <input name="displayName" required placeholder="Full name" className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-smoky/45" />
          </label>
        </>
      )}
          <label className="copic-auth-field mt-4">
            <Mail size={18} />
            <input name="email" type="email" required pattern="[^\s@]+@[^\s@.]+(\.[^\s@.]+)+" aria-label="Email address" aria-invalid={!!emailError} aria-describedby={emailError ? "email-error" : undefined} onInvalid={() => setEmailError("Enter a valid email address.")} value={emailValue} onChange={event => setEmailValue(event.target.value)} placeholder="Email" className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-smoky/45" />
          </label>
          <label className="copic-auth-field mt-4">
            <LockKeyhole size={18} />
            <input name="password" type={showPassword ? "text" : "password"} required minLength={8} placeholder="Password" className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-smoky/45" />
            <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-smoky/70 hover:bg-smoky/10">
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </label>
          {mode === "login" && (
            <button type="button" disabled={resettingPassword} onClick={() => void forgotPassword()} className="mt-3 text-left text-sm font-black text-black disabled:opacity-60">
              {resettingPassword ? "Sending reset email..." : "Forgot password?"}
            </button>
          )}
          <Button disabled={loading} className="mt-5 w-full rounded-2xl py-4 text-base"><Mail size={18} /> {mode === "login" ? "Sign In" : "Create Account"}</Button>
          <div id="recaptcha-container" className="mt-3" />
          <p className="mt-6 text-center text-sm text-[#7e7576]">
            {mode === "login" ? "New to Copic?" : "Already have an account?"}{" "}
            <Link className="font-black text-black" href={mode === "login" ? "/auth/register" : "/auth/login"}>
              {mode === "login" ? "Create account" : "Sign in"}
            </Link>
          </p>
      </form>
    </div>
  );
}
