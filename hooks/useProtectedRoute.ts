"use client";
import { safeVerificationPath, verificationPath, verificationReturnPath } from "@/utils/verification-return";

import { useAuth } from "@/context/AuthContext";
import { accountDestination, accountRole, onboardingState } from "@/utils/onboarding";
import type { Role } from "@/types";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function useProtectedRoute(roles?: Role[]) {
  const { user, profile, loading, profileError, refreshProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const state = onboardingState(user, profile, loading, profileError);

  useEffect(() => {
    if (state === "loading" || state === "error") return;
    if (state === "signed_out") {
      router.replace(pathname.startsWith("/admin") ? "/auth/admin" : "/auth/login");
      return;
    }
    if (state === "email_unverified") {
      router.replace(verificationPath(safeVerificationPath(pathname) || "/complete-profile"));
      return;
    }
    if (state === "role_required" && pathname !== "/complete-profile") {
      router.replace(`/complete-profile?returnTo=${encodeURIComponent(safeVerificationPath(pathname) || "/dashboard")}`);
      return;
    }
    if (roles?.length && profile && !roles.includes(profile.role)) router.replace("/dashboard");
  }, [pathname, profile, roles, router, state]);

  return { user, profile, loading: loading || !!profileError, refreshProfile, isAuthorized: !loading && !profileError && !!user && user.emailVerified && !!accountRole(profile) && (!roles?.length || (!!profile && roles.includes(profile.role))) };
}

export function usePublicOnlyRoute(options?: { disabled?: boolean }) {
  const { user, profile, loading, profileError, homePath } = useAuth();
  const router = useRouter();
  const state = onboardingState(user, profile, loading, profileError);

  useEffect(() => {
    if (options?.disabled) return;
    if (state === "loading" || state === "error") return;
    if (user) {
      const destination = verificationReturnPath(profile ? homePath : "/complete-profile");
      if (state === "email_unverified") router.replace(verificationPath(destination));
      else router.replace(accountDestination(profile, destination));
    }
  }, [homePath, options?.disabled, profile, router, user, state]);

  // Public pages must remain available while Firebase restores a session. A slow
  // or blocked auth request should not turn the whole public site into a spinner.
  return { user, profile, loading, shouldRender: options?.disabled || !user };
}
