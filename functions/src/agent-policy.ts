export const AGENT_RATE = 0.01;
export type AgentRole = "CLIENT_AGENT" | "WORKER_AGENT";

/** KES -> cents, then half-up rounding at exactly one percent. */
export function agentMoney(net: number) {
  if (!Number.isFinite(net) || net < 0) throw new Error("Invalid settled worker earnings");
  const [coefficient, exponent = "0"] = String(net).toLowerCase().split("e");
  const decimals = coefficient.split(".")[1]?.length ?? 0;
  const digits = BigInt(coefficient.replace(".", ""));
  const scale = Number(exponent) - decimals + 2;
  const divisor = 10n ** BigInt(Math.max(0, -scale));
  const minor = scale >= 0 ? digits * 10n ** BigInt(scale) : (digits + divisor / 2n) / divisor;
  const netMinor = Number(minor);
  if (!Number.isSafeInteger(netMinor)) throw new Error("Invalid settled worker earnings");
  const commissionMinor = Number((minor + 50n) / 100n);
  return { netMinor, commissionMinor, commissionAmount: commissionMinor / 100 };
}
export function settled(record: Record<string, unknown>) {
  return record.status === "completed" && !record.fraudulent && !record.refunded && !record.invalid
    && !record.disputed && !record.disputeOpen && !["open", "pending", "unresolved"].includes(String(record.disputeStatus))
    && record.recurrenceStatus !== "cancelled";
}
export function activeAgent(profile: Record<string, unknown> | undefined) {
  return !!profile?.agentEnabled && !profile.isLocked && profile.emailVerified !== false && !["suspended", "inactive", "disabled"].includes(String(profile.agentStatus));
}
export function unresolvedIssue(record: Record<string, unknown>, clientId: unknown, workerId: unknown, ownerField: "createdBy" | "userId") {
  return !["resolved", "closed", "rejected"].includes(String(record.status))
    && (!record[ownerField] || [clientId, workerId].includes(record[ownerField]));
}
