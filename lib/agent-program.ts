/** Versioned program rules, shared by the setup screen and trusted activation. */
export const AGENT_ONBOARDING_PATH = "/become-agent";
export const AGENT_TERMS_VERSION = "2026-10-25";
export const agentProgramRules = [
  "Bring genuine clients and service providers to COPIC. A client must approve any job you prepare for them.",
  "Use your personal COPIC referral links to recruit workers, not other Agents.",
  "You cannot refer yourself or place another Agent underneath your referral.",
  "Fake accounts and referral manipulation are prohibited.",
  "For every eligible job successfully completed according to COPIC's completion rules by a worker validly referred to you, you earn 1% commission on the eligible worker net earnings after COPIC fees.",
  "Client Agents source eligible jobs; Worker Agents recruit workers. One account can do both, free of charge.",
  "Referring a worker does not promise them jobs or a specific number of jobs."
] as const;

export function agentDestination(enabled?: boolean) {
  return enabled ? "/agent" : AGENT_ONBOARDING_PATH;
}
