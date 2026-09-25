"use client";
import { verificationPath, verificationReturnPath, clearVerificationReturn } from "@/utils/verification-return";

import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import { createProfile } from "@/services/auth";
import { accountRole, accountHome } from "@/utils/onboarding";
import { AccountRecovery } from "@/components/auth/AccountRecovery";
import type { Role } from "@/types";
import { BriefcaseBusiness, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function roleHome(role: Role) {
  return accountHome(role);
}


function setupDestination(fallback: string) {
  const destination = verificationReturnPath(fallback);
  clearVerificationReturn();
  return destination.startsWith("/complete-profile") ? fallback : destination;
}

export default function CompleteProfilePage() {
  const router = useRouter();
  const { user, profile, loading, profileError, resolveProfile } = useAuth();
  const [savingRole, setSavingRole] = useState<Role | null>(null);

  useEffect(() => {
    if (loading || savingRole || profileError) return;
    if (!user) { router.replace("/auth/login"); return; }
    if (!user.emailVerified) { router.replace(verificationPath(verificationReturnPath("/complete-profile"))); return; }
    if (accountRole(profile)) {
      router.replace(setupDestination(accountHome(accountRole(profile))));
    }
  }, [loading, profile, profileError, router, user, savingRole]);

  async function finish(role: Role) {
    if (!user || !user.emailVerified || savingRole) return;
    setSavingRole(role);
    try {
      const savedRole = await createProfile(
        user.uid,
        role,
        user.displayName ?? user.email?.split("@")[0] ?? "Copic user",
        user.email ?? undefined,
        user.phoneNumber ?? undefined
      );
      await resolveProfile();
      toast.success("Account profile saved.");
      window.location.assign(setupDestination(roleHome(savedRole)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your account profile.";
      toast.error(message);
      setSavingRole(null);
    }
  }

  if (profileError) return <AccountRecovery />;
  if (loading || !user || !user.emailVerified || accountRole(profile)) return <LoadingSpinner label="Checking account" />;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
      <Card className="w-full">
        <AccountRecovery signOutOnly />
        <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Finish setup</p>
        <h1 className="mt-3 text-3xl font-black text-[#FFFBFF]">Choose how you want to use Copic</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#CCC6BB]">
          Your sign-in is working, but your account profile was not found. Choose your account type once so Copic can route you to the right dashboard.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!!savingRole}
            onClick={() => finish("worker")}
            className="rounded-2xl border border-[#4A463F] bg-[#2A2A2B] p-5 text-left transition hover:border-[#D8CFBC] disabled:opacity-60"
          >
            <UserRound className="text-[#D8CFBC]" size={26} />
            <p className="mt-4 text-lg font-black text-[#FFFBFF]">Worker</p>
            <p className="mt-2 text-sm text-[#CCC6BB]">Browse available jobs, apply for opportunities, and manage your professional profile.</p>
            <span className="mt-5 inline-flex rounded-xl bg-[#D8CFBC] px-4 py-2 text-sm font-black text-[#1E1B13]">
              {savingRole === "worker" ? "Saving..." : "Continue as Worker"}
            </span>
          </button>
          <button
            type="button"
            disabled={!!savingRole}
            onClick={() => finish("client")}
            className="rounded-2xl border border-[#4A463F] bg-[#2A2A2B] p-5 text-left transition hover:border-[#D8CFBC] disabled:opacity-60"
          >
            <BriefcaseBusiness className="text-[#D8CFBC]" size={26} />
            <p className="mt-4 text-lg font-black text-[#FFFBFF]">Client</p>
            <p className="mt-2 text-sm text-[#CCC6BB]">Post work, review candidates, and hire the right people for the job.</p>
            <span className="mt-5 inline-flex rounded-xl bg-[#D8CFBC] px-4 py-2 text-sm font-black text-[#1E1B13]">
              {savingRole === "client" ? "Saving..." : "Continue as Client"}
            </span>
          </button>
        </div>
      </Card>
    </div>
  );
}
