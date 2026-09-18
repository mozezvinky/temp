import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import { NextRequest } from "next/server";
import { MemoryFirestore } from "./memory-firestore";
import { AGENT_TERMS_VERSION, agentDestination } from "../lib/agent-program";

const require = createRequire(resolve("package.json"));
async function load(entry: string, mocks: Record<string, unknown>, browser: Record<string, unknown> = {}) {
  const result = await build({ absWorkingDir: process.cwd(), tsconfig: resolve("tsconfig.json"), entryPoints: [resolve(entry)], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path === "server-only" || args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: `module.exports = mocks[${JSON.stringify(args.path)}] || {};`, loader: "js" }));
  } }] });
  const loaded = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module: loaded, exports: loaded.exports, require, mocks, console, process, Buffer, URL, URLSearchParams, ...browser });
  return loaded.exports as Record<string, (...args: any[]) => any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
class Database extends MemoryFirestore {
  doc(path: string) { const ref = super.doc(path); return Object.assign(ref, { get: async () => this.snapshot(ref) }); }
  collection(path: string) { return Object.assign(super.collection(path), { doc: (id: string) => this.doc(`${path}/${id}`) }); }
}
async function setup({ verified = true, disabled = false, role = "worker" } = {}) {
  const db = new Database();
  db.seed("users/person", { role, roles: [role], skills: ["Cleaning"], completedJobs: 7, emailVerified: true });
  const mocks = { "@/lib/firebase-admin": { adminDb: () => db, adminAuth: () => ({ verifyIdToken: async (token: string) => { if (token !== "test") throw new Error("private-token-diagnostic"); return { uid: "person" }; }, getUser: async () => ({ emailVerified: verified, disabled }) }) }, "@/lib/data-backend": { isSqlBackend: () => false }, "@/lib/local-sql": {} };
  const route = await load("app/api/agent/route.ts", mocks);
  const request = (body: object = {}, token = "test") => new NextRequest("https://copic.example/api/agent", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", acceptTerms: true, termsVersion: AGENT_TERMS_VERSION, ...body }) });
  return { db, route, request, mocks };
}
for (const role of ["worker", "client"]) test(`${role} activation is idempotent and preserves the existing account`, async () => {
  const { db, route, request } = await setup({ role });
  assert.equal((await route.POST(request())).status, 200);
  const first = JSON.stringify([...db.records]);
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(JSON.stringify([...db.records]), first);
  assert.equal(db.records.size, 1);
  const person = db.records.get("users/person")!;
  assert.equal(person.agentEnabled, true);
  assert.equal(person.agentTermsVersion, AGENT_TERMS_VERSION);
  assert.ok(person.agentTermsAcceptedAt);
  assert.equal(person.role, role);
  assert.deepEqual(person.skills, ["Cleaning"]);
  assert.equal(person.completedJobs, 7);
  assert.equal(db.records.has("agentReferrals/person"), false);
  assert.equal(db.records.has("acquisitionAttributions/person"), false);
});
test("fresh Auth email state, disabled users, missing and forged authentication block activation", async () => {
  for (const options of [{ verified: false }, { disabled: true }]) {
    const { db, route, request } = await setup(options);
    assert.equal((await route.POST(request())).status, 403);
    assert.equal(db.records.get("users/person")?.agentEnabled, undefined);
  }
  const { route, request } = await setup();
  for (const token of ["", "forged"]) {
    const response = await route.POST(request({}, token));
    assert.notEqual(response.status, 200);
    assert.doesNotMatch(JSON.stringify(await response.json()), /private-token-diagnostic/);
  }
});
test("activation requires explicit current Terms; browser role flags have no authority", async () => {
  const { db, route, request } = await setup();
  for (const body of [{ acceptTerms: false }, { acceptTerms: "true" }, { termsVersion: "old" }, { acceptTerms: undefined, isAgent: true }]) {
    assert.equal((await route.POST(request(body))).status, 400);
    assert.equal(db.records.get("users/person")?.agentEnabled, undefined);
  }
});
test("upstream worker referral relationships cannot become nested Agent accounts", async () => {
  for (const collection of ["agentReferrals", "acquisitionAttributions"]) {
    const { db, route, request } = await setup();
    db.seed(`${collection}/person`, { agentId: "upstream", sourceType: "agent_referral" });
    const before = JSON.stringify([...db.records]);
    assert.equal((await route.POST(request())).status, 409);
    assert.equal(JSON.stringify([...db.records]), before);
  }
});
test("Admin campaign attribution remains independent during Agent activation", async () => {
  const { db, route, request } = await setup();
  db.seed("acquisitionAttributions/person", { sourceType: "admin_campaign", campaignId: "campaign", agentId: null });
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(db.records.get("acquisitionAttributions/person")?.campaignId, "campaign");
  assert.equal(db.records.has("agentReferrals/person"), false);
});
test("locked and Admin profiles cannot activate", async () => {
  for (const patch of [{ role: "admin" }, { isLocked: true }, { roles: ["worker", "admin"] }]) {
    const { db, route, request } = await setup();
    db.seed("users/person", { ...db.records.get("users/person"), ...patch });
    assert.equal((await route.POST(request())).status, 403);
    assert.equal(db.records.get("users/person")?.agentEnabled, undefined);
  }
});
test("public commission uses authoritative config, existing default, and safe failure", async () => {
  const { db, mocks } = await setup();
  const route = await load("app/api/agent/program/route.ts", mocks);
  assert.equal((await (await route.GET()).json()).commissionRate, .01);
  db.seed("marketplaceConfig/agents", { commissionRate: .025, privateField: "must-not-leak" });
  assert.deepEqual(await (await route.GET()).json(), { commissionRate: .025 });
  db.seed("marketplaceConfig/agents", { commissionRate: "broken" });
  assert.equal((await route.GET()).status, 503);
});
test("become-agent intent replaces stale referral intent and survives refresh without unsafe destinations", async () => {
  const storage = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) }; };
  const browser = { sessionStorage: storage(), localStorage: storage(), location: { search: "" } };
  const paths = await load("utils/acquisition-return.ts", {}, { window: browser });
  paths.rememberAcquisitionReturn("/join/old-worker-referral");
  paths.rememberAcquisitionReturn("/become-agent");
  browser.sessionStorage = storage();
  assert.equal(paths.acquisitionReturnPath("/dashboard"), "/become-agent");
  assert.equal(paths.recruitmentVerificationPath("/become-agent"), "/verify-email?returnTo=%2Fbecome-agent");
  for (const path of ["https://evil.test/become-agent", "/become-agent?agentId=owner", "/become-agent/other"]) assert.equal(paths.safeAcquisitionPath(path), null);
  paths.clearAcquisitionReturn();
  assert.equal(paths.acquisitionReturnPath("/dashboard"), "/dashboard");
  assert.equal(agentDestination(true), "/agent");
  assert.equal(agentDestination(false), "/become-agent");
  assert.equal(agentDestination(), "/become-agent");
});
test("Admin access checks real profile permissions and revoked/locked sessions", async () => {
  const { db, mocks } = await setup();
  const guard = await load("lib/admin-security.ts", mocks);
  const request = new NextRequest("https://copic.example/api/admin/stats", { headers: { Authorization: "Bearer test", "X-Temp-Role": "admin" } });
  await assert.rejects(guard.requireAdmin(request), /Admin access required/);
  db.seed("users/person", { role: "admin", adminRole: "moderator" });
  await assert.rejects(guard.requireAdmin(request, "admins:manage"), /cannot perform/);
  db.seed("users/person", { role: "admin", adminRole: "super_admin", isLocked: true });
  await assert.rejects(guard.requireAdmin(request), /Admin access required/);
  db.seed("users/person", { role: "admin", adminRole: "super_admin" });
  assert.equal((await guard.requireAdmin(request, "admins:manage")).uid, "person");
  const revokedGuard = await load("lib/admin-security.ts", { ...mocks, "@/lib/firebase-admin": { adminDb: () => db, adminAuth: () => ({ verifyIdToken: async (_token: string, checkRevoked: boolean) => { assert.equal(checkRevoked, true); throw new Error("revoked"); } }) } });
  await assert.rejects(revokedGuard.requireAdmin(request), /invalid or expired/);
});
