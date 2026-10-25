import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { load } from "./auth-harness";
import { MemoryFirestore } from "./memory-firestore";

class Database extends MemoryFirestore {
  sequence = 0;
  doc(path: string) { const ref = super.doc(path); return Object.assign(ref, { get: async () => this.snapshot(ref) }); }
  collection(path: string) { return Object.assign(super.collection(path), { doc: (id?: string) => this.doc(`${path}/${id ?? `generated-${this.sequence++}`}`) }); }
}
function fixture() {
  return new Database().seed("users/agent", { agentEnabled: true, emailVerified: true })
    .seed("users/client", { role: "client", verificationStatus: "approved" })
    .seed("verifications/client", { status: "approved" })
    .seed("agentLinks/code", { agentId: "agent", active: true, roleType: "CLIENT_AGENT" })
    .seed("agentJobProposals/proposal", { agentId: "agent", clientUid: "client", status: "pending", job: {} });
}
async function policy(db: Database) {
  return load("lib/client-agent.ts", { "server-only": {}, "@/lib/firebase-admin": { adminDb: () => db } }, {});
}
test("client link requires explicit approval and captures a backend-owned snapshot", async () => {
  const db = fixture(), api = await policy(db);
  await assert.rejects(db.runTransaction(tx => api.approvedClientAgent(db, tx, "client", { clientAgentCode: "code" })));
  const attribution = await db.runTransaction<{agentId: string; sourceType: string; reference: string}>(tx => api.approvedClientAgent(db, tx, "client", { clientAgentCode: "code", approveClientAgent: true, agentId: "forged" }));
  assert.equal(attribution.agentId, "agent"); assert.equal(attribution.sourceType, "referral_link");
});
test("explicitly approved agent proposal takes precedence over passive link attribution", async () => {
  const db = fixture(), api = await policy(db);
  const attribution = await db.runTransaction<{agentId: string; sourceType: string; reference: string}>(tx => api.approvedClientAgent(db, tx, "client", { agentProposalId: "proposal", approveAgentProposal: true, clientAgentCode: "invalid" }));
  assert.equal(attribution.sourceType, "agent_sourced"); assert.equal(attribution.reference, "agentJobProposals/proposal");
});
for (const scenario of ["unrelated-client", "already-published", "rejected", "unapproved", "self", "inactive-agent", "agent-client", "circular-referral", "forged-code"]) test(`secure attribution blocks ${scenario}`, async () => {
  const db = fixture(), api = await policy(db), body: Record<string, unknown> = { agentProposalId: "proposal", approveAgentProposal: true };
  let uid = "client";
  if (scenario === "unrelated-client") uid = "other";
  if (scenario === "already-published") db.records.get("agentJobProposals/proposal")!.status = "published";
  if (scenario === "rejected") db.records.get("agentJobProposals/proposal")!.status = "rejected";
  if (scenario === "unapproved") body.approveAgentProposal = false;
  if (scenario === "self") db.records.get("agentJobProposals/proposal")!.agentId = "client";
  if (scenario === "inactive-agent") db.records.get("users/agent")!.isLocked = true;
  if (scenario === "agent-client") db.records.get("users/client")!.agentEnabled = true;
  if (scenario === "circular-referral") db.seed("agentReferrals/client", { agentId: "agent" });
  if (scenario === "forged-code") { delete body.agentProposalId; body.clientAgentCode = "../../other"; body.approveClientAgent = true; }
  await assert.rejects(db.runTransaction(tx => api.approvedClientAgent(db, tx, uid, body)));
});

const job = { title: "Laundry", description: "Wash household laundry", category: "services_trades", duration: "2 hours", durationValue: 2, durationUnit: "hours", durationHours: 2, payType: "fixed", payAmount: 5000, workersNeeded: 1, location: "Nairobi", county: "Nairobi", locationDetails: { county: "Nairobi", town: "Westlands", estateOrArea: "Westlands", nearestLandmark: "Mall", addressText: "Westlands, Nairobi", latitude: -1.26, longitude: 36.8 }, requiredSkills: ["Laundry"] };
async function posting(db: Database, uid = "client") {
  return load("app/api/jobs/create/route.ts", { "server-only": {}, "@/lib/firebase-admin": { adminDb: () => db }, "@/lib/data-backend": { isSqlBackend: () => false }, "@/lib/local-sql": {}, "@/lib/current-user-profile": { getCurrentUserProfile: async () => ({ uid, emailVerified: true, profile: db.records.get(`users/${uid}`) }), CurrentUserProfileError: class extends Error {} } }, {});
}
const request = (body: object) => new NextRequest("https://copic.example/api/jobs/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
test("client approval publishes through the existing job route and consumes proposal atomically", async () => {
  const db = fixture(), route = await posting(db);
  const response = await route.POST(request({ ...job, title: "Client edited title", agentProposalId: "proposal", approveAgentProposal: true, clientId: "forged", status: "completed" }));
  assert.equal(response.status, 200); const { jobId } = await response.json();
  const result = db.records.get(`jobs/${jobId}`)!;
  assert.equal(result.clientId, "client"); assert.equal(result.title, "Client edited title"); assert.equal(result.status, "open");
  assert.equal((result.clientAgent as Record<string, unknown>).agentId, "agent");
  assert.equal(db.records.get("agentJobProposals/proposal")?.status, "published");
  assert.equal((await route.POST(request({ ...job, agentProposalId: "proposal", approveAgentProposal: true }))).status, 403);
});
test("an agent cannot publish for the client and client verification remains mandatory", async () => {
  const db = fixture(), agentRoute = await posting(db, "agent");
  assert.equal((await agentRoute.POST(request({ ...job, agentProposalId: "proposal", approveAgentProposal: true }))).status, 403);
  db.records.get("verifications/client")!.status = "pending";
  const clientRoute = await posting(db);
  assert.equal((await clientRoute.POST(request({ ...job, agentProposalId: "proposal", approveAgentProposal: true }))).status, 403);
  assert.equal([...db.records.keys()].some(path => path.startsWith("jobs/")), false);
});
test("proposal read endpoint never exposes another client's or agent's proposal", async () => {
  const db = fixture();
  const route = await load("app/api/agent/proposals/route.ts", { "server-only": {}, "@/lib/notifications-server": {}, "@/lib/firebase-admin": { adminDb: () => db }, "@/lib/server-auth": { requireServerUser: async () => ({ uid: "intruder", profile: { agentEnabled: true } }) } }, {});
  const response = await route.GET(new NextRequest("https://copic.example/api/agent/proposals?id=proposal"));
  assert.equal(response.status, 404); assert.doesNotMatch(JSON.stringify(await response.json()), /clientUid|Laundry/);
});
