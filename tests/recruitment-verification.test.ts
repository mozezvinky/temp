import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import { NextRequest } from "next/server";
import { MemoryFirestore } from "./memory-firestore";
import { serviceKey } from "../functions/src/marketplace-policy";

const require = createRequire(resolve("package.json"));

// Execute the actual route/client module with only external services substituted.
async function load(entry: string, mocks: Record<string, unknown> = {}, browser: Record<string, unknown> = {}) {
  const result = await build({
    absWorkingDir: process.cwd(), tsconfig: resolve("tsconfig.json"),
    entryPoints: [resolve(entry)], bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "test-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path === "server-only" || args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: `module.exports = mocks[${JSON.stringify(args.path)}] || {};`, loader: "js" }));
    } }]
  });
  const loaded = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module: loaded, exports: loaded.exports, require, mocks, console, process, Buffer, URL, URLSearchParams, ...browser });
  return loaded.exports as Record<string, (...args: any[]) => any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
}

test("admin and agent context survives refresh, a closed tab, and safe email returns", async () => {
  const browser = { sessionStorage: storage(), localStorage: storage(), location: { search: "" } };
  const paths = await load("utils/acquisition-return.ts", {}, { window: browser });
  for (const path of ["/recruit/admin_campaign-1", "/join/agent_link-2"]) {
    paths.rememberAcquisitionReturn(path);
    assert.equal(paths.acquisitionReturnPath("/dashboard"), path);
    browser.sessionStorage = storage(); // Reopened browser tab.
    assert.equal(paths.acquisitionReturnPath("/dashboard"), path);
    browser.location.search = `?returnTo=${encodeURIComponent(path)}`;
    assert.equal(paths.acquisitionReturnPath("/dashboard"), path);
    assert.equal(paths.recruitmentVerificationPath(path), `/verify-email?returnTo=${encodeURIComponent(path)}`);
    browser.location.search = "";
    paths.clearAcquisitionReturn();
    assert.equal(paths.acquisitionReturnPath("/dashboard"), "/dashboard");
  }
  for (const unsafe of ["https://evil.test/join/a", "//evil.test", "/\\evil.test", "/join/../admin", "/join/%2f%2fevil.test", "/join/a?rate=1", "/recruit/a#evil", "/join/a\n", "/dashboard", "javascript:alert(1)"]) {
    assert.equal(paths.safeAcquisitionPath(unsafe), null);
    browser.location.search = `?returnTo=${encodeURIComponent(unsafe)}`;
    assert.equal(paths.acquisitionReturnPath("/dashboard"), "/dashboard");
  }
});

test("A/B/C/D/F: checks freshly reloaded Firebase email state, refreshes token, and rejects account changes", async () => {
  let verifiedOnServer = false, reloads = 0, refreshes = 0;
  const user = { uid: "worker", email: "worker@example.test", emailVerified: true,
    reload: async () => { reloads++; user.emailVerified = verifiedOnServer; },
    getIdToken: async (force: boolean) => { assert.equal(force, true); refreshes++; return "fresh-token"; }
  };
  const auth: { currentUser: typeof user | null } = { currentUser: user };
  let settings: { url: string; handleCodeInApp: boolean } | undefined;
  const services = await load("services/emailVerification.ts", {
    "@/lib/firebase": { requireAuth: () => auth },
    "firebase/auth": { sendEmailVerification: async (_user: unknown, options: typeof settings) => { settings = options; } }
  }, { window: { location: { origin: "https://copic.example" } } });
  assert.equal(await services.reloadVerifiedRecruitmentUser(), false); // Cached true must not bypass verification.
  assert.equal(refreshes, 0);
  verifiedOnServer = true; // Verification in a separate tab/device, or a verified Google account.
  assert.equal(await services.reloadVerifiedRecruitmentUser(), true);
  assert.equal(reloads, 2);
  assert.equal(refreshes, 1);
  await services.sendRecruitmentVerificationEmail("/join/original-agent");
  assert.equal(settings?.url, "https://copic.example/verify-email?returnTo=%2Fjoin%2Foriginal-agent");
  assert.equal(settings?.handleCodeInApp, false);
  await assert.rejects(services.sendRecruitmentVerificationEmail("https://evil.test"), /Invalid recruitment/);
  user.reload = async () => { auth.currentUser = null; };
  await assert.rejects(services.reloadVerifiedRecruitmentUser(), /account changed/);
  await assert.rejects(services.reloadVerifiedRecruitmentUser(), /sign in again/);
});

class Database extends MemoryFirestore {
  doc(path: string) { const ref = super.doc(path); return Object.assign(ref, { get: async () => this.snapshot(ref) }); }
  collection(path: string) { return Object.assign(super.collection(path), { doc: (id: string) => this.doc(`${path}/${id}`) }); }
}

async function api(verified: boolean) {
  const db = new Database();
  db.seed("users/worker", { role: "worker", roles: ["worker"], emailVerified: true, skillProfiles: [], skills: [] });
  db.seed("recruitmentCampaigns/admin-link", { active: true, service: "Laundry helper", rate: 700, unit: "basket", source: "admin" });
  db.seed("agentLinks/agent-link", { active: true, agentId: "agent", serviceId: "laundry" });
  db.seed("users/agent", { agentEnabled: true });
  const visitId = "12345678-1234-1234-1234-123456789012";
  db.seed(`acquisitionVisits/${visitId}`, { sourceId: "agent-link", sourceType: "agent_referral", startedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 86_400_000) });
  const auth = { verifyIdToken: async () => ({ uid: "worker", email: "worker@example.test", email_verified: true }), getUser: async () => ({ uid: "worker", emailVerified: verified, metadata: { creationTime: new Date().toISOString() } }) };
  const mocks = { "@/lib/firebase-admin": { adminDb: () => db, adminAuth: () => auth }, "@/lib/data-backend": { isSqlBackend: () => false }, "@/lib/local-sql": {} };
  const route = await load("app/api/acquisition/route.ts", mocks);
  const request = (action: string, type = "admin_campaign", extra = {}) => new NextRequest(`https://copic.example/api/acquisition?id=${type === "admin_campaign" ? "admin-link" : "agent-link"}&type=${type}`, {
    method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json", Cookie: `copic_acquisition_visit=${visitId}` }, body: JSON.stringify({ action, ...extra })
  });
  return { db, route, request, mocks };
}

test("G: direct unverified acquisition calls return 403 despite verified profile/token flags", async () => {
  const { db, route, request } = await api(false);
  const before = JSON.stringify([...db.records]);
  for (const type of ["admin_campaign", "agent_referral"]) {
    for (const action of ["attach", "add_skill", "enable_worker", "id_verification_started"]) {
      const response = await route.POST(request(action, type));
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, "EMAIL_NOT_VERIFIED");
    }
  }
  assert.equal(JSON.stringify([...db.records]), before);
  db.records.delete("users/worker"); // New account before profile creation must also get the verification error.
  assert.equal((await route.POST(request("add_skill"))).status, 403);
});

test("I: verified admin recruitment uses current authoritative rate/unit and never creates an agent referral", async () => {
  const { db, route, request } = await api(true);
  assert.equal((await route.POST(request("attach"))).status, 200);
  assert.equal((await route.POST(request("add_skill", "admin_campaign", { rate: 1, unit: "hour" }))).status, 200);
  const origin = db.records.get(`workerServiceOrigins/worker_${serviceKey("Laundry helper")}`)!;
  assert.equal(origin.initialRate, 700);
  assert.equal(origin.initialUnit, "basket");
  assert.equal(origin.campaignId, "admin-link");
  assert.equal(db.records.has("agentReferrals/worker"), false);
});

test("H: verified agent attribution remains source-specific and repeat attachment is idempotent", async () => {
  const { db, route, request } = await api(true);
  assert.equal((await route.POST(request("attach", "agent_referral"))).status, 200);
  assert.equal((await route.POST(request("attach", "agent_referral"))).status, 200);
  assert.equal(db.records.get("agentReferrals/worker")?.agentId, "agent");
  assert.equal(db.records.get("agentReferrals/worker")?.referralLinkId, "agent-link");
  assert.equal(db.records.get("acquisitionAttributions/worker")?.sourceType, "agent_referral");
  assert.equal(db.records.get("acquisitionAttributions/worker")?.campaignId, null);
});

test("disabled/deleted links cannot resume after verification", async () => {
  const { db, route, request } = await api(true);
  db.seed("recruitmentCampaigns/admin-link", { active: false });
  for (const action of ["attach", "add_skill", "enable_worker"]) assert.equal((await route.POST(request(action))).status, 410);
  db.records.delete("agentLinks/agent-link");
  assert.equal((await route.POST(request("attach", "agent_referral"))).status, 410);
});

test("agent self-referral and referring another agent remain prohibited", async () => {
  for (const self of [true, false]) {
    const { db, route, request } = await api(true);
    if (self) db.seed("agentLinks/agent-link", { active: true, agentId: "worker" });
    else db.seed("users/worker", { role: "worker", agentEnabled: true });
    assert.equal((await route.POST(request("attach", "agent_referral"))).status, 403);
    assert.equal(db.records.has("agentReferrals/worker"), false);
  }
});

test("shared agent service endpoint also rejects an attributed unverified account", async () => {
  const { db, mocks } = await api(false);
  db.seed("acquisitionAttributions/worker", { sourceType: "agent_referral", sourceId: "agent-link", agentId: "agent" });
  const route = await load("app/api/profile/skills/route.ts", mocks);
  const response = await route.POST(new NextRequest("https://copic.example/api/profile/skills", { method: "POST", headers: { Authorization: "Bearer test-token" }, body: JSON.stringify({ name: "Laundry helper" }) }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "EMAIL_NOT_VERIFIED");
});
