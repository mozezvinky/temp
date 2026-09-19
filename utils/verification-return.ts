import { acquisitionReturnPath, safeAcquisitionPath } from "./acquisition-return";
const key = "copic.verification.return";
const pages = new Set(["/auth/admin", "/complete-profile", "/dashboard", "/find-work", "/workers", "/profile", "/settings", "/account-settings", "/applications", "/completed-requests", "/notifications", "/chat", "/help", "/jobs", "/jobs/new", "/agent", "/agent/referrals", "/agent/earnings", "/admin"]);
export function safeVerificationPath(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  if (safeAcquisitionPath(value) || pages.has(value)) return value;
  if (/^\/complete-profile\?role=(worker|client)$/.test(value)) return value;
  if (/^\/jobs\/[A-Za-z0-9_-]{1,100}$/.test(value)) return value;
  if (/^\/admin\/(admins|users|agents|agent-program|recruitment|support|settings|verification|kyc|jobs|analytics|audit|disputes|reports|skills|map|service-fees)$/.test(value)) return value;
  return null;
}
export function rememberVerificationReturn(path: string) {
  const safe = safeVerificationPath(path);
  if (!safe || typeof window === "undefined") return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try { storage.setItem(key, safe); } catch { /* URL preserves intent without storage. */ }
  }
}
export function verificationReturnPath(fallback = "/complete-profile") {
  if (typeof window === "undefined") return fallback;
  const explicit = safeVerificationPath(new URLSearchParams(window.location.search).get("returnTo"));
  if (explicit) { rememberVerificationReturn(explicit); return explicit; }
  const role = new URLSearchParams(window.location.search).get("role");
  if (role === "worker" || role === "client") { const path = `/complete-profile?role=${role}`; rememberVerificationReturn(path); return path; }
  const acquisition = acquisitionReturnPath("");
  if (acquisition) return acquisition;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try { const saved = safeVerificationPath(storage.getItem(key)); if (saved) return saved; } catch { /* Storage is optional. */ }
  }
  return fallback;
}
export function clearVerificationReturn() {
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try { storage.removeItem(key); } catch { /* Storage is optional. */ }
  }
}
export function verificationPath(path: string) {
  const safe = safeVerificationPath(path);
  if (!safe) throw new Error("Invalid verification return path.");
  rememberVerificationReturn(safe);
  return `/verify-email?returnTo=${encodeURIComponent(safe)}`;
}
