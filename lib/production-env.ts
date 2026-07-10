export const REQUIRED_PRODUCTION_ENVS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "NEXT_PUBLIC_APP_URL"
] as const;

export function missingProductionEnvVars() {
  if (process.env.NODE_ENV !== "production") return [];
  return REQUIRED_PRODUCTION_ENVS.filter(name => !process.env[name]?.trim());
}

export function assertProductionEnvReady() {
  const missing = missingProductionEnvVars();
  if (missing.length) {
    throw new Error(`Production configuration missing: ${missing.join(", ")}.`);
  }
}

export function configuredAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercelUrl ? `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : "";
}

export function configuredDomain() {
  const appUrl = configuredAppUrl();
  if (!appUrl) return "";
  try {
    return new URL(appUrl).hostname;
  } catch {
    return appUrl.replace(/^https?:\/\//, "").split("/")[0] ?? "";
  }
}
