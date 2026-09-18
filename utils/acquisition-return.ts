const key = "copic.acquisition.return";

/** Only these relative paths may override authentication or verification redirects. */
export function safeAcquisitionPath(value: unknown): string | null {
  return typeof value === "string" && value === value.trim() && (value === "/become-agent" || /^\/(recruit|join)\/[A-Za-z0-9_-]{1,100}$/.test(value)) ? value : null;
}

export function rememberAcquisitionReturn(value: string) {
  const path = safeAcquisitionPath(value);
  if (!path || typeof window === "undefined") return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try { storage.setItem(key, path); } catch { /* The URL also carries the return path. */ }
  }
}

export function clearAcquisitionReturn() {
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ }
  }
}

export function acquisitionReturnPath(fallback: string) {
  if (typeof window === "undefined") return fallback;
  const explicit = safeAcquisitionPath(new URLSearchParams(window.location.search).get("returnTo"));
  if (explicit) { rememberAcquisitionReturn(explicit); return explicit; }
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const path = safeAcquisitionPath(storage.getItem(key));
      if (path) return path;
    } catch { /* Fall back to the default route. */ }
  }
  return fallback;
}

export function recruitmentVerificationPath(path: string) {
  const safePath = safeAcquisitionPath(path);
  if (!safePath) throw new Error("Invalid recruitment return path.");
  return `/verify-email?returnTo=${encodeURIComponent(safePath)}`;
}
