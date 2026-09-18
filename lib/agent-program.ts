/** Versioned program rules, shared by the setup screen and trusted activation. */
export const AGENT_ONBOARDING_PATH = "/become-agent";
export const AGENT_TERMS_VERSION = "2026-09-18";
export const agentProgramRules = [
  "Invite genuine service providers and help them understand COPIC.",
  "Use your personal COPIC referral links to recruit workers, not other Agents.",
  "You cannot refer yourself or place another Agent underneath your referral.",
  "Fake accounts and referral manipulation are prohibited.",
  "Commission applies only to eligible completed work under COPIC's commission rules. Income is not guaranteed."
] as const;

export function agentDestination(enabled?: boolean) {
  return enabled ? "/agent" : AGENT_ONBOARDING_PATH;
}
