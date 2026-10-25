"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_RATE = void 0;
exports.agentMoney = agentMoney;
exports.settled = settled;
exports.activeAgent = activeAgent;
exports.unresolvedIssue = unresolvedIssue;
exports.AGENT_RATE = 0.01;
/** KES -> cents, then half-up rounding at exactly one percent. */
function agentMoney(net) {
    if (!Number.isFinite(net) || net < 0)
        throw new Error("Invalid settled worker earnings");
    const [coefficient, exponent = "0"] = String(net).toLowerCase().split("e");
    const decimals = coefficient.split(".")[1]?.length ?? 0;
    const digits = BigInt(coefficient.replace(".", ""));
    const scale = Number(exponent) - decimals + 2;
    const divisor = 10n ** BigInt(Math.max(0, -scale));
    const minor = scale >= 0 ? digits * 10n ** BigInt(scale) : (digits + divisor / 2n) / divisor;
    const netMinor = Number(minor);
    if (!Number.isSafeInteger(netMinor))
        throw new Error("Invalid settled worker earnings");
    const commissionMinor = Number((minor + 50n) / 100n);
    return { netMinor, commissionMinor, commissionAmount: commissionMinor / 100 };
}
function settled(record) {
    return record.status === "completed" && !record.fraudulent && !record.refunded && !record.invalid
        && !record.disputed && !record.disputeOpen && !["open", "pending", "unresolved"].includes(String(record.disputeStatus))
        && record.recurrenceStatus !== "cancelled";
}
function activeAgent(profile) {
    return !!profile?.agentEnabled && !profile.isLocked && profile.emailVerified !== false && !["suspended", "inactive", "disabled"].includes(String(profile.agentStatus));
}
function unresolvedIssue(record, clientId, workerId, ownerField) {
    return !["resolved", "closed", "rejected"].includes(String(record.status))
        && (!record[ownerField] || [clientId, workerId].includes(record[ownerField]));
}
//# sourceMappingURL=agent-policy.js.map