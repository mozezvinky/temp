/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";

const require = createRequire(resolve("package.json"));
async function load(entry: string, mocks: Record<string, any>, globals: Record<string, any>) {
  const result = await build({ entryPoints: [resolve(entry)], tsconfig: resolve("tsconfig.json"), bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", packages: "external", plugins: [{ name: "boundaries", setup(b) {
    b.onResolve({ filter: /.*/ }, a => a.path in mocks ? { path: a.path, namespace: "mock" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "mock" }, a => ({ contents: `module.exports = mocks[${JSON.stringify(a.path)}];`, loader: "js" }));
  } }] });
  const loaded = { exports: {} as any };
  vm.runInNewContext(result.outputFiles[0].text, { module: loaded, exports: loaded.exports, require, mocks, console, process, ...globals });
  return loaded.exports;
}

// Run real component effects with controlled Firebase callbacks and network responses.
function hooks() {
  const slots: any[] = [], pending: (() => void)[] = [];
  let index = 0;
  const same = (a: any[], b: any[]) => a?.length === b.length && a.every((v, i) => v === b[i]);
  return {
    render: (component: () => any) => { index = 0; return component(); },
    flush: async () => { pending.splice(0).forEach(f => f()); await new Promise(resolve => setImmediate(resolve)); },
    react: {
      createContext: () => ({ Provider: "provider" }),
      useState: (initial: any) => { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v: any) => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }]; },
      useRef: (initial: any) => { const i = index++; return slots[i] ??= { current: initial }; },
      useMemo: (fn: () => any) => { index++; return fn(); },
      useCallback: (fn: any, deps: any[]) => { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
      useEffect: (fn: () => any, deps: any[]) => { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) { const prev = slots[i]; slots[i] = { deps }; pending.push(() => { prev?.cleanup?.(); slots[i].cleanup = fn(); }); } }
    }
  };
}
function nodes(tree: any): any[] {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}

test("agent terms precede verification, and verification can recover before activation", async () => {
  const h = hooks();
  let verified = false, fail = false, checks = 0, registrations = 0;
  const destinations: string[] = [];
  const user = { uid: "agent", getIdToken: async () => "fresh" };
  const state = { user, profile: { role: "worker" }, loading: true, refreshProfile: async () => {} };
  const page = await load("app/become-agent/page.tsx", {
    react: h.react, "@/context/AuthContext": { useAuth: () => state },
    "@/components/ui/Button": { Button: "button" }, "@/components/ui/Card": { Card: "card" },
    "@/components/profile/RecruitmentUI": { RecruitmentState: "state", RecruitmentApplyLink: "link" },
    "@/utils/acquisition-return": { rememberAcquisitionReturn() {}, clearAcquisitionReturn() {}, recruitmentVerificationPath: () => "/verify-email?returnTo=%2Fbecome-agent" },
    "@/services/emailVerification": { reloadVerifiedRecruitmentUser: async () => { checks++; if (fail) throw new Error("offline"); return verified; } }
  }, { window: { location: { assign: (path: string) => destinations.push(path) } }, fetch: async (path: string) => { if (path === "/api/agent") registrations++; return { ok: true, json: async () => ({ commissionRate: .01 }) }; } });
  h.render(page.default); await h.flush();
  let tree = h.render(page.default);
  assert.equal(checks, 0, "No email check on opening the Agent page");
  assert.ok(nodes(tree).some(n => n.type === "form"));
  state.loading = false;
  await nodes(tree).find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  await h.flush();
  assert.equal(checks, 0, "Acceptance is required before checking email");
  nodes(tree).find(n => n.type === "input")!.props.onChange({ target: { checked: true } });
  tree = h.render(page.default);
  nodes(tree).find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  await h.flush(); tree = h.render(page.default);
  assert.equal(tree.props.title, "Verify your email");
  assert.equal(registrations, 0);
  assert.equal(nodes(tree).find(n => n.type === "link")?.props.href, "/verify-email?returnTo=%2Fbecome-agent");
  fail = true;
  nodes(tree).find(n => n.type === "button")!.props.onClick();
  h.render(page.default); await h.flush(); tree = h.render(page.default);
  assert.equal(tree.props.error, true);
  assert.ok(nodes(tree).find(n => n.type === "link"));
  fail = false; verified = true;
  nodes(tree).find(n => n.type === "button")!.props.onClick();
  h.render(page.default); await h.flush();
  state.loading = false;
  tree = h.render(page.default);
  assert.equal(registrations, 1, "Verified user activates only after accepting terms");
  assert.deepEqual(destinations, ["/agent"]);
});

for (const signedIn of [false, true]) test(`${signedIn ? "Incomplete profile" : "Guest"} accepts Agent terms before account setup`, async () => {
  const h = hooks(), destinations: string[] = [];
  let checks = 0;
  const page = await load("app/become-agent/page.tsx", {
    react: h.react,
    "@/context/AuthContext": { useAuth: () => ({ user: signedIn ? { uid: "new-user" } : null, profile: null, loading: false, refreshProfile: async () => {} }) },
    "@/components/ui/Button": { Button: "button" }, "@/components/ui/Card": { Card: "card" },
    "@/components/profile/RecruitmentUI": { RecruitmentState: "state", RecruitmentApplyLink: "link" },
    "@/utils/acquisition-return": { rememberAcquisitionReturn() {}, clearAcquisitionReturn() {}, recruitmentVerificationPath: () => "/verify-email" },
    "@/services/emailVerification": { reloadVerifiedRecruitmentUser: async () => { checks++; return true; } }
  }, { window: { location: { assign: (path: string) => destinations.push(path) } }, fetch: async () => ({ ok: true, json: async () => ({ commissionRate: .01 }) }) });
  h.render(page.default); await h.flush();
  let tree = h.render(page.default);
  assert.equal(checks, 0);
  assert.equal(nodes(tree).find(n => n.type === "button")!.props.disabled, true);
  nodes(tree).find(n => n.type === "input")!.props.onChange({ target: { checked: true } });
  tree = h.render(page.default);
  nodes(tree).find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  await h.flush();
  assert.equal(checks, signedIn ? 1 : 0);
  assert.deepEqual(destinations, [signedIn ? "/complete-profile?returnTo=%2Fbecome-agent" : "/auth/register?returnTo=%2Fbecome-agent"]);
});

test("profile loading settles when the user document arrives before optional verification snapshots", async () => {
  const h = hooks(), callbacks = new Map<string, any>();
  let onUser: (user: any) => void = () => {};
  const user = { uid: "agent", emailVerified: true, email: "agent@example.test" };
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const timers = new Map<number, () => void>(); let timer = 0;
  const auth = await load("context/AuthContext.tsx", {
    react: h.react, "@/lib/firebase": { auth: {}, db: {} }, "@/lib/data-backend": { isSqlBackend: () => false },
    "firebase/auth": { onAuthStateChanged: (_auth: any, callback: any) => { onUser = callback; return () => {}; } },
    "firebase/firestore": { doc: (_db: any, collection: string, id: string) => `${collection}/${id}`, onSnapshot: (path: string, callback: any) => { callbacks.set(path, callback); return () => {}; } }
  }, { window: { localStorage: storage, sessionStorage: storage, setTimeout: (fn: () => void) => { timers.set(++timer, fn); return timer; }, clearTimeout: (id: number) => timers.delete(id) } });
  const render = () => h.render(() => auth.AuthProvider({ children: null }));
  render(); await h.flush(); onUser(user); render(); await h.flush();
  assert.equal(render().props.value.loading, true);
  callbacks.get("users/agent")({ exists: () => true, data: () => ({ role: "worker", agentEnabled: true }) });
  const value = render().props.value;
  assert.equal(value.loading, false);
  assert.equal(value.profile.agentEnabled, true);
  assert.equal(timers.size, 0);
  callbacks.get("verifications/agent")({ exists: () => true, data: () => ({ status: "approved" }) });
  assert.equal(render().props.value.profile.verificationStatus, "approved");
});
