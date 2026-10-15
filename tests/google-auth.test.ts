import assert from "node:assert/strict";
import { test } from "node:test";
import { hooks, load, nodes } from "./auth-harness";

test("Google auth uses the configured Firebase provider and reloads the user", async () => {
  const auth = {}, provider = {};
  let reloaded = false;
  const credential = { user: { reload: async () => { reloaded = true; } } };
  const service = await load("services/auth.ts", {
    "@/lib/firebase": { requireAuth: () => auth, googleProvider: provider, authReady: Promise.resolve() },
    "firebase/auth": { signInWithPopup: async (a: unknown, p: unknown) => {
      assert.equal(a, auth); assert.equal(p, provider); return credential;
    } },
    "firebase/firestore": {}
  }, {});
  assert.equal(await service.loginWithGoogle(), credential);
  assert.equal(reloaded, true);
});

for (const mode of ["login", "register"] as const) {
  for (const scenario of ["new", "client", "cancelled", "unverified"] as const) {
    test(`${mode}: Google ${scenario} account routes correctly or permits retry`, async () => {
      const h = hooks();
      const destinations: string[] = [], errors: string[] = [];
      let calls = 0;
      const component = await load("components/auth/AuthForm.tsx", {
        react: h.react,
        "@/components/ui/Button": { Button: "button" },
        "@/hooks/useProtectedRoute": { usePublicOnlyRoute: () => ({ shouldRender: true }) },
        "@/context/AuthContext": { useAuth: () => ({ resolveProfile: async () => scenario === "client" ? { role: "client" } : null }) },
        "@/services/auth": {
          loginWithGoogle: async () => { calls++; if (scenario === "cancelled") throw new Error("Popup closed"); return { user: { emailVerified: scenario !== "unverified" } }; },
          authErrorMessage: (error: Error) => error.message
        },
        "@/utils/verification-return": { verificationReturnPath: () => "", verificationPath: (path: string) => `/verify-email?returnTo=${encodeURIComponent(path)}` },
        sonner: { toast: { error: (message: string) => errors.push(message) } }
      }, { window: { location: { search: "", assign: (path: string) => destinations.push(path) } } });
      const render = () => h.render(() => component.AuthForm({ mode }));
      const button = nodes(render()).find(n => n.type === "button" && n.props.children?.includes?.("Continue with Google"));
      assert.ok(button); assert.equal(button.props.type, "button");
      button.props.onClick(); await h.flush();
      assert.equal(calls, 1);
      if (scenario === "cancelled") {
        assert.deepEqual(errors, ["Popup closed"]); assert.equal(destinations.length, 0);
        assert.ok(nodes(render()).find(n => n.type === "button" && n.props.children?.includes?.("Continue with Google")));
      } else {
        assert.deepEqual(destinations, [scenario === "client" ? "/find-work" : scenario === "unverified" ? "/verify-email?returnTo=%2Fcomplete-profile" : "/complete-profile"]);
      }
    });
  }
}

test("Continue as Client saves the role and opens Posted Work despite a saved return destination", async () => {
  const h = hooks();
  const destinations: string[] = [];
  let saved = false, refreshed = false, cleared = false;
  const component = await load("app/complete-profile/page.tsx", {
    react: h.react,
    "next/navigation": { useRouter: () => ({ replace() {} }) },
    "@/context/AuthContext": { useAuth: () => ({ user: { uid: "new", emailVerified: true }, profile: null, loading: false, resolveProfile: async () => { refreshed = true; } }) },
    "@/services/auth": { createProfile: async (_uid: string, role: string) => { assert.equal(role, "client"); saved = true; return role; } },
    "@/components/auth/AccountRecovery": { AccountRecovery: "recovery" },
    "@/utils/verification-return": { verificationReturnPath: () => "/dashboard", clearVerificationReturn: () => { cleared = true; } },
    sonner: { toast: { success() {}, error(message: string) { assert.fail(message); } } }
  }, { window: { location: { assign: (path: string) => { assert.ok(saved && refreshed && cleared); destinations.push(path); } } } });
  const tree = h.render(() => component.default());
  const button = nodes(tree).find(n => n.type === "button" && nodes(n).some(child => child.props.children === "Continue as Client"));
  assert.ok(button);
  await button.props.onClick(); await h.flush();
  assert.deepEqual(destinations, ["/find-work"]);
});
