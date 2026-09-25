import type { Role } from "@/types";

export function isAccountRole(value: unknown): value is Role {
  return value === "worker" || value === "client" || value === "admin";
}

/** COPIC's persisted schema is role + roles. Never infer roles from browser caches. */
export function accountRoles(data: { role?: unknown; roles?: unknown } | null | undefined): Role[] {
  return [...new Set([data?.role, ...(Array.isArray(data?.roles) ? data.roles : [])].filter(isAccountRole))];
}

export function accountRole(data: { role?: unknown; roles?: unknown } | null | undefined): Role | null {
  const roles = accountRoles(data);
  return roles.includes("admin") ? "admin" : roles[0] ?? null;
}

export function accountHome(role: Role | null) {
  return role === "admin" ? "/admin" : role === "client" ? "/find-work" : "/dashboard";
}

export function onboardingState(user: { emailVerified: boolean } | null, profile: { role?: unknown; roles?: unknown } | null, loading: boolean, error?: string | null) {
  if (loading) return "loading";
  if (!user) return "signed_out";
  if (!user.emailVerified) return "email_unverified";
  if (error) return "error";
  return accountRole(profile) ? "ready" : "role_required";
}

export function accountDestination(profile: { role?: unknown; roles?: unknown } | null, intended: string) {
  if (!accountRole(profile)) {
    if (/^\/complete-profile\?role=(worker|client)$/.test(intended)) return intended;
    return `/complete-profile${intended && !intended.startsWith("/complete-profile") ? `?returnTo=${encodeURIComponent(intended)}` : ""}`;
  }
  return intended && !intended.startsWith("/complete-profile") && intended !== "/auth/admin" ? intended : accountHome(accountRole(profile));
}
