"use client";

import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useProtectedRoute(roles?: Role[]) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (roles?.length && profile && !roles.includes(profile.role)) router.replace("/dashboard");
  }, [loading, profile, roles, router, user]);

  return { user, profile, loading, isAuthorized: !!user && (!roles?.length || (!!profile && roles.includes(profile.role))) };
}

export function usePublicOnlyRoute() {
  const { user, profile, loading, homePath } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace(homePath);
  }, [homePath, loading, router, user]);

  return { user, profile, loading, shouldRender: !loading && !user };
}
