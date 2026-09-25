/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import vm from "node:vm";
import { accountDestination } from "../utils/onboarding";

const uid = "otp-test-user";
const email = "copic@example.test";
let docs: Map<string, Record<string, any>>;
let currentUser: { emailVerified: boolean; disabled: boolean; email: string };
let sentHtml: string[];
const token = "test-token";
const nodeRequire = createRequire(`${process.cwd()}/tests/email-otp.test.ts`);

async function loadRoute(name: string) {
  const auth = {
    verifyIdToken: async (value: string) => { assert.equal(value, token); return { uid }; },
    getUser: async () => currentUser,
    updateUser: async (_uid: string, update: { emailVerified: boolean }) => { currentUser.emailVerified = update.emailVerified; }
  };
  const db = {
    collection: (collection: string) => ({ doc: (key: string) => {
      assert.equal(collection, "emailVerificationCodes");
      return { key: `${collection}/${key}` };
    } }),
    runTransaction: async (callback: (transaction: any) => any) => {
      const tx = {
        get: async (ref: { key: string }) => ({ data: () => docs.get(ref.key), exists: docs.has(ref.key) }),
        set: (ref: { key: string }, data: Record<string, any>) => docs.set(ref.key, data),
        update: (ref: { key: string }, data: Record<string, any>) => docs.set(ref.key, { ...docs.get(ref.key), ...data }),
        delete: (ref: { key: string }) => docs.delete(ref.key)
      };
      return callback(tx);
    },
    collectionUser: () => ({ doc: () => ({ set: async () => undefined }) })
  };
  const firestore = { FieldValue: { serverTimestamp: () => "server-time" } };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "firebase-admin/firestore": { FieldValue: firestore.FieldValue },
    "@/lib/firebase-admin": { adminAuth: () => auth, adminDb: () => ({ ...db, collection: (name: string) => name === "users" ? { doc: () => ({ set: async () => undefined }) } : db.collection(name) }) },
    "@/lib/app-email": { sendAppEmail: async (_to: string, _subject: string, html: string) => { sentHtml.push(html); return { attempted: true }; } },
    "@/lib/email-otp": loadOtpHelpers()
  };
  const entry = `app/api/auth/${name}/route.ts`;
  const source = ts.transpileModule(readFileSync(entry, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as Record<string, any> };
  const mockedRequire = (path: string) => path === "next/server" ? { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }) } } : path in mocks ? mocks[path] : nodeRequire(path);
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: mockedRequire, process, Buffer, console, Date, URL });
  return loaded.exports;
}

function loadOtpHelpers() {
  const source = ts.transpileModule(readFileSync("lib/email-otp.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as Record<string, any> };
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: (path: string) => path === "server-only" ? {} : nodeRequire(path), process, Buffer, console });
  return loaded.exports;
}

function request(body: Record<string, unknown> = {}) { return { headers: { get: () => `Bearer ${token}` }, json: async () => body }; }

test("six-digit code is hashed server-side, expires, limits retries, resends and verifies idempotently", async () => {
  process.env.OTP_SECRET = "a-long-random-test-secret-value-at-least-32-characters";
  docs = new Map(); currentUser = { emailVerified: false, disabled: false, email }; sentHtml = [];
  const send = await loadRoute("send-email-otp");
  const verify = await loadRoute("verify-email-otp");
  assert.equal((await send.POST(request())).status, 200);
  const ref = "emailVerificationCodes/otp-test-user";
  const record = docs.get(ref)!;
  assert.match(record.codeHash, /^[a-f0-9]{64}$/);
  const code = sentHtml.at(-1)!.match(/>(\d{6})</)![1];
  const incorrectCode = code === "000000" ? "000001" : "000000";
  assert.notEqual(record.codeHash, code);
  assert.equal((await send.POST(request())).status, 429);
  assert.equal((await verify.POST(request({ code: "abc123" }))).status, 400);
  assert.equal((await verify.POST(request({ code: incorrectCode }))).status, 400);
  assert.equal(docs.get(ref)!.attempts, 1);

  docs.set(ref, { ...docs.get(ref)!, expiresAt: 0 });
  assert.equal((await verify.POST(request({ code }))).status, 400);
  assert.equal(docs.has(ref), false);

  assert.equal((await send.POST(request())).status, 200);
  assert.equal(sentHtml.length, 2);
  const secondCode = sentHtml.at(-1)!.match(/>(\d{6})</)![1];
  const secondIncorrectCode = secondCode === "000000" ? "000001" : "000000";
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await verify.POST(request({ code: secondIncorrectCode }));
    assert.equal(response.status, attempt === 5 ? 429 : 400);
  }
  docs.set(ref, { ...docs.get(ref)!, resendAt: 0 });
  assert.equal((await send.POST(request())).status, 200);
  const finalCode = sentHtml.at(-1)!.match(/>(\d{6})</)![1];
  assert.equal((await verify.POST(request({ code: finalCode }))).status, 200);
  assert.equal(currentUser.emailVerified, true);
  const repeat = await (await verify.POST(request({ code: finalCode }))).json();
  assert.equal(repeat.verified, true); assert.equal(repeat.alreadyVerified, true);
  assert.equal((await (await send.POST(request())).json()).alreadyVerified, true);
});

test("role-specific signup intent survives verification and new accounts continue to role onboarding", () => {
  assert.equal(accountDestination(null, "/complete-profile?role=client"), "/complete-profile?role=client");
  assert.equal(accountDestination(null, "/complete-profile?role=worker"), "/complete-profile?role=worker");
  assert.equal(accountDestination(null, "/join/referral"), "/complete-profile?returnTo=%2Fjoin%2Freferral");
});
