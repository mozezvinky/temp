import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { load } from "./auth-harness";
import { MemoryFirestore } from "./memory-firestore";

async function fixture() {
  const db = new MemoryFirestore()
    .seed("users/agent", { agentEnabled: true, emailVerified: true })
    .seed("verifications/worker", { status: "approved", nationalIdHash: "identity" })
    .seed("identityClaims/identity", { userId: "worker" })
    .seed("jobs/job", { status: "completed", clientId: "client", payType: "fixed" })
    .seed("applications/app", { jobId: "job", workerId: "worker", status: "completed", paymentConfirmedAt: "2026-10-24", workerEarnings: 4500 })
    .seed("commissionLedger/entry", { agentId: "agent", workerId: "worker", jobId: "job", applicationId: "app", roleType: "CLIENT_AGENT", eligibleWorkerAmount: 4500, commissionAmount: 45, commissionRate: .01 })
    .seed("commissionStates/entry", { status: "pending" })
    .seed("agentMetrics/agent", { earnedCommission: 45, pendingCommission: 45 });
  const route = await load("app/api/admin/agents/route.ts", { "server-only": {}, "@/lib/firebase-admin": { adminDb: () => db }, "@/lib/admin-security": {
    requireAdmin: async (request: NextRequest) => { if (request.headers.get("authorization") !== "Bearer finance-admin") throw new Error("Admin access required"); return { uid: "finance", role: "super_admin" }; },
    adminErrorStatus: () => 403, writeAdminAuditLog: async () => {}
  } }, {});
  const request = (body: object, token = "finance-admin") => new NextRequest("https://copic.example/api/admin/agents", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: "entry", reason: "Verified actual payment receipt", paymentReference: "verified-receipt", ...body }) });
  return { db, route, request };
}
test("agents cannot mark commissions earned, available, paid or alter their balances", async () => {
  const { db, route, request } = await fixture(), before = JSON.stringify([...db.records]);
  for (const status of ["available", "paid", "recalculate"]) assert.equal((await route.POST(request({ status }, "agent"))).status, 403);
  assert.equal(JSON.stringify([...db.records]), before);
});
test("payout release and paid states require independent finance verification and explicit receipt", async () => {
  const { db, route, request } = await fixture();
  assert.equal((await route.POST(request({ status: "available", paymentReference: "" }))).status, 400);
  assert.equal((await route.POST(request({ status: "paid" }))).status, 409);
  assert.equal((await route.POST(request({ status: "available" }))).status, 200);
  assert.equal(db.records.get("commissionStates/entry")?.status, "available");
  assert.equal((await route.POST(request({ status: "paid" }))).status, 200);
  assert.equal(db.records.get("commissionStates/entry")?.paymentReference, "verified-receipt");
  assert.equal(db.records.get("agentMetrics/agent")?.paidCommission, 45);
});
test("source disputes and changed financial values block payout inside its transaction", async () => {
  for (const scenario of ["dispute", "adjustment", "unconfirmed", "suspended-agent"]) {
    const { db, route, request } = await fixture();
    if (scenario === "dispute") db.seed("disputes/d", { jobId: "job", status: "open" });
    if (scenario === "adjustment") db.records.get("applications/app")!.workerEarnings = 4000;
    if (scenario === "unconfirmed") db.records.get("applications/app")!.paymentConfirmedAt = null;
    if (scenario === "suspended-agent") db.records.get("users/agent")!.agentStatus = "suspended";
    assert.equal((await route.POST(request({ status: "available" }))).status, 409, scenario);
    assert.equal(db.records.get("commissionStates/entry")?.status, "pending");
  }
});
test("administrative adjustment recalculates from server net, keeps original ledger and appends audit event", async () => {
  const { db, route, request } = await fixture();
  db.seed("commissionStates/entry", { status: "reversed", requiresReview: true });
  db.seed("agentMetrics/agent", { earnedCommission: 0, pendingCommission: 0 });
  db.records.get("applications/app")!.workerEarnings = 4000;
  assert.equal((await route.POST(request({ status: "recalculate", commissionAmount: 999999 }))).status, 200);
  assert.equal(db.records.get("commissionStates/entry")?.commissionAmount, 40);
  assert.equal(db.records.get("commissionLedger/entry")?.commissionAmount, 45);
  assert.equal(db.records.get("commissionEvents/entry_correction_1")?.newAmount, 40);
  assert.equal((await route.POST(request({ status: "available" }))).status, 200);
  assert.equal(db.records.get("agentMetrics/agent")?.availableCommission, 40);
});
test("paid adjustments require recovery evidence before a corrected amount can be credited", async () => {
  const { db, route, request } = await fixture();
  db.seed("commissionStates/entry", { status: "reversed", reversedFrom: "paid", requiresReview: true });
  assert.equal((await route.POST(request({ status: "recalculate" }))).status, 409);
});
