"use client";
import { safeVerificationPath, verificationPath, verificationReturnPath } from "@/utils/verification-return";

import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function useProtectedRoute(roles?: Role[]) {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(pathname.startsWith("/admin") ? "/auth/admin" : "/auth/login");
      return;
    }
    if (!user.emailVerified) {
      router.replace(verificationPath(safeVerificationPath(pathname) || "/complete-profile"));
      return;
    }
    if (!profile && pathname !== "/complete-profile") {
      router.replace(`/complete-profile?returnTo=${encodeURIComponent(safeVerificationPath(pathname) || "/dashboard")}`);
      return;
    }
    if (roles?.length && profile && !roles.includes(profile.role)) router.replace("/dashboard");
  }, [loading, pathname, profile, roles, router, user]);

  return { user, profile, loading, refreshProfile, isAuthorized: !!user && user.emailVerified && (!roles?.length || (!!profile && roles.includes(profile.role))) };
}

export function usePublicOnlyRoute(options?: { disabled?: boolean }) {
  const { user, profile, loading, homePath } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (options?.disabled) return;
    if (loading) return;
    if (user) {
      const destination = verificationReturnPath(profile ? homePath : "/complete-profile");
      router.replace(!user.emailVerified ? verificationPath(destination) : destination);
    }
  }, [homePath, loading, options?.disabled, profile, router, user]);

  // Public pages must remain available while Firebase restores a session. A slow
  // or blocked auth request should not turn the whole public site into a spinner.
  return { user, profile, loading, shouldRender: options?.disabled || !user };
}
