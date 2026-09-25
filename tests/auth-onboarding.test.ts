/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "node:test";
import { hooks, load, nodes } from "./auth-harness";
import { accountDestination, accountRole, onboardingState } from "../utils/onboarding";

function storage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => map.set(k, v), removeItem: (k: string) => map.delete(k) };
}

test("onboarding distinguishes loading, unverified, missing role, saved roles and read errors", () => {
  const user = { emailVerified: true };
  assert.equal(onboardingState(null, null, true), "loading");
  assert.equal(onboardingState(null, null, false), "signed_out");
  assert.equal(onboardingState({ emailVerified: false }, null, false), "email_unverified");
  assert.equal(onboardingState(user, null, true), "loading");
  assert.equal(onboardingState(user, null, false, "offline"), "error");
  assert.equal(onboardingState(user, null, false), "role_required");
  for (const role of ["worker", "client", "admin"]) {
    assert.equal(onboardingState(user, { role }, false), "ready");
    assert.equal(onboardingState(user, { roles: [role] }, false), "ready");
  }
  assert.equal(accountRole({ role: "client", roles: ["worker", "client"] }), "client");
  assert.equal(accountDestination({ role: "client" }, "/complete-profile"), "/find-work");
  assert.equal(accountDestination({ role: "worker" }, "/complete-profile"), "/dashboard");
  assert.equal(accountDestination(null, "/join/referral"), "/complete-profile?returnTo=%2Fjoin%2Freferral");
  assert.equal(accountDestination({ role: "worker" }, "/join/referral"), "/join/referral");
});

test("provider waits for profile, reports failed reads, and discards a response after logout", async () => {
  const h = hooks();
  let callback: (u: any) => void = () => {};
  const user = { uid: "existing", emailVerified: true, reload: async () => {}, getIdToken: async () => "token" };
  const firebase = { currentUser: user as any };
  let resolveFetch: (value: any) => void = () => {};
  const provider = await load("context/AuthContext.tsx", {
    react: h.react, "@/lib/firebase": { auth: firebase, db: null },
    "firebase/auth": { onIdTokenChanged: (_: any, cb: any) => { callback = cb; return () => {}; } },
    "firebase/firestore": {}, "@/lib/data-backend": { isSqlBackend: () => false }
  }, { window: { localStorage: storage(), sessionStorage: storage() }, fetch: () => new Promise(resolve => { resolveFetch = resolve; }) });
  const render = () => h.render(() => provider.AuthProvider({ children: null })).props.value;
  render(); await h.flush(); callback(user); await h.flush();
  assert.equal(render().state, "loading");
  resolveFetch({ ok: true, json: async () => ({ profile: { role: "client" } }) });
  await h.flush(); assert.equal(render().state, "ready"); assert.equal(render().homePath, "/find-work");
  const refresh = render().resolveProfile(); await h.flush();
  resolveFetch({ ok: false, json: async () => ({ error: "offline" }) });
  await assert.rejects(refresh); assert.equal(render().state, "error");
  const late = render().resolveProfile(); await h.flush();
  firebase.currentUser = null; callback(null);
  resolveFetch({ ok: true, json: async () => ({ profile: { role: "worker" } }) });
  await assert.rejects(late);
  assert.equal(render().state, "signed_out"); assert.equal(render().profile, null);
});

test("unverified sessions never load profiles or prematurely select a role", async () => {
  const h = hooks(); let callback: (u: any) => void = () => {};
  const user = { uid: "new", emailVerified: false, reload: async () => {} };
  const provider = await load("context/AuthContext.tsx", {
    react: h.react, "@/lib/firebase": { auth: { currentUser: user }, db: null },
    "firebase/auth": { onIdTokenChanged: (_: any, cb: any) => { callback = cb; return () => {}; } }, "firebase/firestore": {}
  }, { fetch: () => { throw new Error("Profile must not load"); } });
  const render = () => h.render(() => provider.AuthProvider({ children: null })).props.value;
  render(); await h.flush(); callback(user); await h.flush();
  assert.equal(render().state, "email_unverified");
});

test("verification UI sends an OTP, verifies it, preserves onboarding and supports sign out", async () => {
  const h = hooks(), destinations: string[] = [];
  let verified = false, sends = 0, signedOut = false;
  const user: any = { uid: "new", email: "test@example.com", emailVerified: false, reload: async () => { user.emailVerified = verified; }, getIdToken: async () => "fresh" };
  const firebase = { currentUser: user as any };
  const component = await load("components/auth/RecruitmentEmailVerification.tsx", {
    react: h.react, "@/lib/firebase": { requireAuth: () => firebase },
    "@/context/AuthContext": { useAuth: () => ({ user, resolveProfile: async () => null }) },
    "@/components/ui/Button": { Button: "button" }, "@/components/ui/Card": { Card: "card" },
    "@/services/auth": { logout: async () => { signedOut = true; firebase.currentUser = null; } },
    "@/services/emailVerification": {
      sendEmailVerificationCode: async () => { sends++; return { sent: true, retryAfter: 60 }; },
      verifyEmailCode: async () => { verified = true; return { verified: true }; }
    }
  }, { window: { location: { replace: (p: string) => destinations.push(p) }, sessionStorage: storage(), localStorage: storage(), setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} } });
  const render = () => h.render(() => component.RecruitmentEmailVerification({ returnPath: "/complete-profile" }));
  render(); await h.flush(); let tree = render();
  assert.equal(nodes(tree).find(n => n.type === "input")!.props.inputMode, "numeric");
  assert.equal(sends, 1); assert.match(JSON.stringify(tree), /6-digit verification code/);
  const input = nodes(tree).find(n => n.type === "input")!;
  input.props.onChange({ target: { value: "123456" } }); await h.flush(); tree = render();
  await nodes(tree).find(n => n.type === "button" && n.props.children === "Verify email")!.props.onClick(); await h.flush(); tree = render();
  assert.equal(destinations[0], "/complete-profile");
  await nodes(tree).find(n => n.type === "button" && n.props.children === "Sign out")!.props.onClick(); await h.flush();
  assert.equal(signedOut, true); assert.equal(destinations.at(-1), "/auth/login?returnTo=%2Fcomplete-profile");
});

test("role selection awaits durable persistence, never activates from a cached role", async () => {
  const browser = { localStorage: storage(), sessionStorage: storage() };
  const user = { uid: "person", emailVerified: true, getIdToken: async () => "fresh" };
  browser.localStorage.setItem("temp.profile.roles.person", '["worker"]');
  let resolveFetch: (v: any) => void = () => {}, settled = false;
  const service = await load("services/auth.ts", { "@/lib/firebase": { requireAuth: () => ({ currentUser: user }) }, "firebase/auth": {}, "firebase/firestore": {} }, {
    window: browser, fetch: () => new Promise(resolve => { resolveFetch = resolve; })
  });
  const pending = service.activateProfileRole(user, "worker", "Test").then((r: string) => { settled = true; return r; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false);
  resolveFetch({ ok: true, json: async () => ({ role: "worker", roles: ["worker"] }) });
  assert.equal(await pending, "worker");
  assert.equal(browser.localStorage.getItem("temp.profile.role.person"), "worker");
});

test("verification service calls only the server OTP endpoints", async () => {
  const user = { getIdToken: async () => "fresh" };
  const paths: string[] = [];
  const service = await load("services/emailVerification.ts", { "@/lib/firebase": { requireAuth: () => ({ currentUser: user }) } }, {
    fetch: async (path: string) => { paths.push(path); return { ok: true, json: async () => ({ sent: true, verified: true }) }; }
  });
  await service.sendEmailVerificationCode();
  await service.verifyEmailCode("123456");
  assert.deepEqual(paths, ["/api/auth/send-email-otp", "/api/auth/verify-email-otp"]);
});
