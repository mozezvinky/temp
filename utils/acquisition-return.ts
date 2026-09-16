/** Only same-origin acquisition paths may override an authentication redirect. */
export function acquisitionReturnPath(fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = window.sessionStorage.getItem("copic.acquisition.return");
  return value && /^\/(recruit|join)\/[A-Za-z0-9_-]{1,100}$/.test(value) ? value : fallback;
}
