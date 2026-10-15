import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { load } from "./auth-harness";

test("ID email targets the configured admin with an escaped review link and stable delivery key", async () => {
  const sent: unknown[][] = [];
  const loaded = await load("lib/verification-admin-email.ts", {
    "server-only": {},
    "@/lib/app-email": { sendAppEmail: async (...args: unknown[]) => { sent.push(args); return { attempted: true }; } }
  }, { process: { env: { ADMIN_EMAIL: " admin@example.test " } } });
  const input = { userId: "worker", fullName: "<script>Test</script>", role: "worker", submittedAt: "2026-10-15T10:00:00.000Z" };
  await loaded.sendVerificationAdminEmail(input);
  assert.equal(sent[0][0], "admin@example.test");
  assert.match(String(sent[0][2]), /https:\/\/copic.co.ke\/admin\/verification/);
  assert.match(String(sent[0][2]), /&lt;script&gt;Test&lt;\/script&gt;/);
  assert.doesNotMatch(String(sent[0][2]), /<script>/);
  assert.equal(sent[0][3], `id-verification:worker:${input.submittedAt}`);
});

for (const outcome of ["failed", "skipped"] as const) {
  test(`Email ${outcome} is logged without rejecting a saved submission`, async () => {
    const errors: unknown[][] = [];
    const loaded = await load("lib/verification-admin-email.ts", {
      "server-only": {},
      "@/lib/app-email": { sendAppEmail: async () => { if (outcome === "failed") throw new Error("Resend unavailable"); return { attempted: false, skippedReason: "missing_api_key" }; } }
    }, { console: { error: (...args: unknown[]) => errors.push(args) } });
    await loaded.sendVerificationAdminEmail({ userId: "worker", fullName: "Test", role: "worker", submittedAt: "now" });
    assert.equal(errors.length, 1);
  });
}

for (const sql of [true, false]) {
  test(`${sql ? "SQL" : "Firestore"}: email follows a saved ID submission; duplicate submissions do not email`, async () => {
    let pending = false, emailed = 0;
    const snapshot = () => ({ exists: pending, data: () => pending ? { status: "pending" } : undefined });
    const ref = (id: string) => ({ id, get: async () => id === "worker" ? snapshot() : { exists: false, data: () => undefined } });
    const db = {
      collection: () => ({ doc: ref }),
      runTransaction: async (callback: (tx: unknown) => Promise<void>) => {
        await callback({ get: async () => ({ exists: false }), set() {} });
        pending = true;
      }
    };
    const loaded = await load("app/api/kyc/start/route.ts", {
      "@/lib/identity-security": { nationalIdHash: () => "id-hash" },
      "@/lib/data-backend": { isSqlBackend: () => sql },
      "@/lib/server-auth": { requireVerifiedServerUser: async () => ({ uid: "worker", email: "worker@example.test", profile: { role: "worker" } }), authErrorStatus: () => 500 },
      "@/lib/firebase-storage-bucket": { firebaseStorageBucketCandidates: () => ["test"] },
      "@/lib/firebase-admin": { adminDb: () => db, adminStorage: () => ({ bucket: () => ({ file: () => ({ save: async () => {}, getMetadata: async () => [{}] }) }) }) },
      "@/lib/local-sql": { localDb: () => ({ prepare: (query: string) => ({ get: () => query.includes("SELECT status") && pending ? { status: "pending" } : undefined, run: () => { pending = true; } }) }) },
      "@/lib/verification-admin-email": { sendVerificationAdminEmail: async (input: { userId: string }) => { assert.equal(pending, true); assert.equal(input.userId, "worker"); emailed++; } }
    }, { File, Buffer, crypto: { randomUUID } });
    const invalidRequest = { headers: new Headers({ "content-type": "multipart/form-data" }), formData: async () => new FormData() };
    assert.equal((await loaded.POST(invalidRequest)).status, 400);
    assert.equal(emailed, 0);
    const form = new FormData();
    form.set("fullName", "Test Worker"); form.set("phoneNumber", "0700000000"); form.set("nationalId", "12345678");
    for (const field of ["idFront", "idBack", "selfieWithId"]) form.set(field, new File(["image"], "id.png", { type: "image/png" }));
    const request = { headers: new Headers({ "content-type": "multipart/form-data" }), formData: async () => form };
    assert.equal((await loaded.POST(request)).status, 200);
    assert.equal(emailed, 1);
    assert.equal((await loaded.POST(request)).status, 409);
    assert.equal(emailed, 1);
  });
}
