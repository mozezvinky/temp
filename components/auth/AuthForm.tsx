"use client";

import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { usePublicOnlyRoute } from "@/hooks/useProtectedRoute";
import { activateProfileRole, authErrorMessage, loginWithEmail, registerWithEmail, sendPasswordReset } from "@/services/auth";
import type { Role } from "@/types";
import { BriefcaseBusiness, Eye, EyeOff, LockKeyhole, Mail, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import type { User } from "firebase/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [signedInUser, setSignedInUser] = useState<User | null>(null);
  const [signedInEmail, setSignedInEmail] = useState("");
  const { shouldRender } = usePublicOnlyRoute({ disabled: loading || !!signedInUser });

  useEffect(() => {
    document.body.classList.toggle("continue-as-active", mode === "login" && !!signedInUser);
    return () => document.body.classList.remove("continue-as-active");
  }, [mode, signedInUser]);

  async function continueAs(nextRole: Role) {
    if (!signedInUser) return;
    setLoading(true);
    try {
      const savedRole = await activateProfileRole(
        signedInUser,
        nextRole,
        signedInUser.displayName ?? signedInUser.email?.split("@")[0] ?? "Copic user",
        signedInUser.email ?? signedInEmail
      );
      window.sessionStorage.setItem("temp.profile.uid", signedInUser.uid);
      window.sessionStorage.setItem("temp.profile.role", savedRole);
      if (signedInUser.email) window.localStorage.setItem(`temp.accountRole.${signedInUser.email.toLowerCase()}`, savedRole);
      window.location.assign(savedRole === "client" ? "/find-work" : "/jobs");
    } catch (error) {
      toast.error(authErrorMessage(error));
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "register") {
        const user = await registerWithEmail(String(form.get("email")), String(form.get("password")), String(form.get("displayName")));
        window.sessionStorage.setItem("temp.profile.uid", user.uid);
        window.sessionStorage.removeItem("temp.profile.role");
        window.location.assign("/complete-profile");
      } else {
        const credential = await loginWithEmail(String(form.get("email")), String(form.get("password")));
        window.sessionStorage.removeItem("temp.profile.uid");
        window.sessionStorage.removeItem("temp.profile.role");
        setSignedInUser(credential.user);
        setSignedInEmail(String(form.get("email")));
        setLoading(false);
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

  if (!signedInUser && (!shouldRender || loading)) return <LoadingSpinner label={loading ? "Signing you in" : "Checking session"} />;

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
      {mode === "login" && signedInUser ? (
        <div className="copic-auth-card">
            <p className="copic-eyebrow">Account mode</p>
            <h1>Continue as</h1>
            <p className="copic-auth-copy">Choose which side of Copic you want to use with {signedInUser.email ?? signedInEmail}.</p>
            <div className="copic-role-options">
              <button type="button" disabled={loading} onClick={() => void continueAs("worker")} className="copic-role-option is-primary">
                <span className="flex items-center gap-3 font-black"><BriefcaseBusiness size={20} /> Continue as Worker</span>
                <span>Browse available jobs, apply for opportunities, and manage your professional profile.</span>
              </button>
              <button type="button" disabled={loading} onClick={() => void continueAs("client")} className="copic-role-option is-secondary">
                <span className="flex items-center gap-3 font-black"><Search size={20} /> Continue as Client</span>
                <span>Post work, review candidates, and hire the right people for the job.</span>
              </button>
            </div>
        </div>
      ) : (
      <form onSubmit={submit} className="copic-auth-card">
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
            <input name="email" type="email" required value={emailValue} onChange={event => setEmailValue(event.target.value)} placeholder="Email" className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-smoky/45" />
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
      )}
    </div>
  );
}
