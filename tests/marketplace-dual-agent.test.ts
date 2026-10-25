import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryFirestore } from "./memory-firestore";
import { reconcileCompletedApplication } from "../functions/src/marketplace-completions";
import { agentMoney } from "../functions/src/agent-policy";

function fixture() {
  return new MemoryFirestore()
    .seed("users/worker", { role: "worker", skillProfiles: [{ id: "laundry", name: "Laundry" }] })
    .seed("users/client-agent", { agentEnabled: true, emailVerified: true })
    .seed("users/worker-agent", { agentEnabled: true, emailVerified: true })
    .seed("jobs/job", { clientId: "client", title: "Laundry", status: "completed", payType: "fixed", clientAgent: { agentId: "client-agent", clientUid: "client", status: "approved", reference: "agentLinks/client-link" } })
    .seed("applications/app", { jobId: "job", clientId: "client", workerId: "worker", status: "completed", requestSkillName: "Laundry", paymentConfirmedAt: "2026-10-24", createdAt: "2026-10-22", grossAmount: 5000, serviceFeeAmount: 500, workerEarnings: 4500 })
    .seed("agentReferrals/worker", { agentId: "worker-agent", referredAt: "2026-10-20" })
    .seed("verifications/worker", { status: "approved", nationalIdHash: "identity" })
    .seed("identityClaims/identity", { userId: "worker" });
}
const run = (m: MemoryFirestore) => reconcileCompletedApplication(m.asFirestore(), "app");
test("two independent role commissions use recorded worker net and never change the payout", async () => {
  const m = fixture(), before = { ...m.records.get("applications/app") };
  await run(m); await run(m);
  assert.equal(m.records.get("commissionLedger/job_worker")?.commissionAmount, 45);
  assert.equal(m.records.get("commissionLedger/job_worker_CLIENT_AGENT")?.commissionAmount, 45);
  assert.equal(m.records.get("commissionLedger/job_worker")?.roleType, "WORKER_AGENT");
  assert.equal(m.records.get("commissionLedger/job_worker_CLIENT_AGENT")?.roleType, "CLIENT_AGENT");
  assert.deepEqual(m.records.get("applications/app"), before);
  assert.equal(m.records.get("agentMetrics/client-agent")?.pendingCommission, 45);
});
test("one agent can legitimately earn both roles without merging or duplicating entries", async () => {
  const m = fixture(); m.records.get("agentReferrals/worker")!.agentId = "client-agent";
  await run(m); await run(m);
  assert.equal(m.records.get("agentMetrics/client-agent")?.earnedCommission, 90);
  assert.equal([...m.records.keys()].filter(k => k.startsWith("commissionLedger/")).length, 2);
});
test("concurrent completion deliveries retry atomically and credit both roles once", async () => {
  const m = fixture(); await Promise.all(Array.from({ length: 12 }, () => run(m)));
  assert.equal(m.records.get("agentMetrics/client-agent")?.earnedCommission, 45);
  assert.equal(m.records.get("agentMetrics/worker-agent")?.earnedCommission, 45);
  assert.equal([...m.records.keys()].filter(k => k.startsWith("commissionLedger/")).length, 2);
});
for (const status of ["open", "accepted", "payment_sent", "cancelled"]) test(`${status} jobs generate no payable commissions`, async () => {
  const m = fixture(); m.records.get("jobs/job")!.status = status; await run(m);
  assert.equal([...m.records.keys()].filter(k => k.startsWith("commissionLedger/")).length, 0);
});
for (const scenario of ["missing-confirmation", "self-client", "self-worker", "unapproved-attribution", "locked-client-agent", "inactive-client-agent", "unverified-agent", "forged-client", "disputed", "unresolved-dispute"]) test(`eligibility rejects ${scenario}`, async () => {
  const m = fixture(), j = m.records.get("jobs/job")!, a = m.records.get("applications/app")!, c = j.clientAgent as Record<string, unknown>;
  if (scenario === "missing-confirmation") a.paymentConfirmedAt = null;
  if (scenario === "self-client") j.clientId = "client-agent";
  if (scenario === "self-worker") c.agentId = "worker";
  if (scenario === "unapproved-attribution") c.status = "pending";
  if (scenario === "locked-client-agent") m.records.get("users/client-agent")!.isLocked = true;
  if (scenario === "inactive-client-agent") m.records.get("users/client-agent")!.agentStatus = "suspended";
  if (scenario === "unverified-agent") m.records.get("users/client-agent")!.emailVerified = false;
  if (scenario === "forged-client") c.clientUid = "other";
  if (scenario === "disputed") j.disputed = true;
  if (scenario === "unresolved-dispute") m.seed("disputes/d", { jobId: "job", status: "open" });
  await run(m); assert.equal(m.records.has("commissionLedger/job_worker_CLIENT_AGENT"), false);
});
test("fixed 1% ignores configurable rates for new earnings", async () => {
  const m = fixture().seed("marketplaceConfig/agents", { commissionRate: .03 }); await run(m);
  assert.equal(m.records.get("commissionLedger/job_worker_CLIENT_AGENT")?.commissionAmount, 45);
});
test("timeline jobs use paid settlement records including their actual fee", async () => {
  const m = fixture(); m.records.get("jobs/job")!.payType = "pay_per_timeline";
  m.seed("jobTimelines/one", { jobId: "job", applicationId: "app", status: "paid", workerAmount: 400, clientAmount: 450, platformFee: 50 });
  m.seed("jobTimelines/two", { jobId: "job", applicationId: "app", status: "paid", workerAmount: 600, clientAmount: 680, platformFee: 80 });
  await run(m); const row = m.records.get("commissionLedger/job_worker_CLIENT_AGENT")!;
  assert.equal(row.commissionAmount, 10); assert.equal(row.copicFeeAmount, 130); assert.equal(row.grossJobAmount, 1130);
});
test("adjusted settled amount reverses each role once and retains immutable calculation", async () => {
  const m = fixture(); await run(m); m.records.get("applications/app")!.workerEarnings = 4000;
  await run(m); await run(m);
  assert.equal(m.records.get("commissionLedger/job_worker_CLIENT_AGENT")?.commissionAmount, 45);
  assert.equal(m.records.get("commissionStates/job_worker_CLIENT_AGENT")?.status, "reversed");
  assert.equal(m.records.get("commissionStates/job_worker_CLIENT_AGENT")?.requiresReview, true);
  assert.equal(m.records.get("agentMetrics/client-agent")?.earnedCommission, 0);
});
test("paid commission invalidation records recovery requirement instead of deleting payment history", async () => {
  const m = fixture(); await run(m);
  m.seed("commissionStates/job_worker_CLIENT_AGENT", { status: "paid", paidAt: "2026-10-24", paymentReference: "receipt" });
  m.records.get("jobs/job")!.refunded = true; await run(m);
  const state = m.records.get("commissionStates/job_worker_CLIENT_AGENT")!;
  assert.equal(state.status, "reversed"); assert.equal(state.reversedFrom, "paid"); assert.equal(state.paymentReference, "receipt");
});
test("a participant's completed-job report blocks both roles, while an outsider cannot hijack settlement", async () => {
  const m = fixture().seed("reports/report", { relatedJobId: "job", userId: "client", status: "open" });
  await run(m); assert.equal(m.records.has("commissionLedger/job_worker"), false);
  m.records.get("reports/report")!.userId = "outsider"; await run(m);
  assert.equal(m.records.get("commissionLedger/job_worker_CLIENT_AGENT")?.commissionAmount, 45);
});
test("malformed settled money fails closed and reverses an existing available commission", async () => {
  const m = fixture(); await run(m); m.records.get("applications/app")!.workerEarnings = NaN;
  await run(m); assert.equal(m.records.get("commissionStates/job_worker")?.status, "reversed");
});
test("legacy ledger and referrals are retained without re-crediting either balance", async () => {
  const m = fixture().seed("commissionLedger/job_worker", { applicationId: "app", agentId: "worker-agent", commissionAmount: 70, status: "pending" }).seed("agentMetrics/worker-agent", { pendingCommission: 70, earnedCommission: 70 });
  await run(m); await run(m);
  assert.equal(m.records.get("commissionLedger/job_worker")?.commissionAmount, 70);
  assert.equal(m.records.get("agentMetrics/worker-agent")?.pendingCommission, 70);
  assert.equal(m.records.get("agentReferrals/worker")?.agentId, "worker-agent");
});
test("half-up minor-unit rounding is accurate at cent boundaries", () => {
  assert.equal(agentMoney(1.005).netMinor, 101);
  assert.equal(agentMoney(1e-7).netMinor, 0);
  assert.equal(agentMoney(4500).commissionMinor, 4500);
  assert.equal(agentMoney(.49).commissionMinor, 0);
  assert.equal(agentMoney(.5).commissionMinor, 1);
  assert.equal(agentMoney(1.5).commissionMinor, 2);
  assert.equal(agentMoney(100.49).commissionMinor, 100);
  assert.equal(agentMoney(100.5).commissionMinor, 101);
  for (const value of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER]) assert.throws(() => agentMoney(value));
});
