/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "node:test";
import { load, hooks, nodes } from "./auth-harness";

test("agent terms precede verification, and verification can recover before activation", async () => {
  const h = hooks();
  let verified = false, fail = false, checks = 0, registrations = 0;
  const destinations: string[] = [];
  const user = { uid: "agent", getIdToken: async () => "fresh" };
  const state = { user, profile: { role: "worker" }, loading: true, refreshProfile: async () => {} };
  const page = await load("app/become-agent/page.tsx", {
    react: h.react, "@/context/AuthContext": { useAuth: () => state },
    "@/components/ui/Button": { Button: "button" }, "@/components/ui/Card": { Card: "card" },
    "@/components/auth/AccountRecovery": { AccountRecovery: "recovery" },
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
    "@/components/auth/AccountRecovery": { AccountRecovery: "recovery" },
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
