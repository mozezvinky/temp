import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { load } from "./auth-harness";

/** Static rule regressions complement server-route authorization tests. */
test("all financial, attribution and approval collections deny direct browser reads and writes", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  for (const collection of ["agentJobProposals", "agentProposalLimits", "agentLinks", "agentReferrals", "commissionLedger", "commissionStates", "commissionEvents", "agentMetrics"]) {
    assert.ok(rules.includes(`match /${collection}/{id} { allow read, write: if false; }`), collection);
  }
  const profileFields = rules.split("affectedKeys().hasOnly([")[1].split("])")[0];
  for (const field of ["agentEnabled", "agentStatus", "clientAgent", "earnedCommission", "availableCommission"]) assert.ok(!profileFields.includes(`"${field}"`), field);
  assert.match(rules, /match \/jobs\/\{jobId\}[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /match \/reports\/\{reportId\}[\s\S]*?request\.resource\.data\.userId == request\.auth\.uid/);
});
test("an agent cannot select another agent's private earnings through query parameters", async () => {
  const rows = [{ id: "own", agentId: "current-agent", commissionAmount: 45 }, { id: "private", agentId: "victim", commissionAmount: 999 }];
  const db = {
    collection: () => ({ where: (field: string, operator: string, uid: string) => {
      assert.equal(field, "agentId"); assert.equal(operator, "=="); assert.equal(uid, "current-agent");
      return { orderBy: () => ({ limit: () => ({ get: async () => ({ size: 1, docs: rows.filter(row => row.agentId === uid).map(row => ({ id: row.id, data: () => row })) }) }) }) };
    } }), getAll: async () => [], doc: (path: string) => ({ path })
  };
  const route = await load("app/api/agent/route.ts", { "server-only": {}, "@/lib/firebase-admin": { adminDb: () => db }, "@/lib/server-auth": { requireServerUser: async () => ({ uid: "current-agent", profile: { agentEnabled: true, emailVerified: true } }) } }, {});
  const response = await route.GET(new NextRequest("https://copic.example/api/agent?view=earnings&agentId=victim"));
  assert.equal(response.status, 200); const payload = await response.json();
  assert.equal(payload.records.length, 1); assert.equal(payload.records[0].id, "own");
  assert.doesNotMatch(JSON.stringify(payload), /victim|999|private/);
});
