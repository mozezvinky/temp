import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, terminate, updateDoc } from "firebase/firestore";
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { reconcileCompletedApplication } from "../functions/src/marketplace-completions";

const projectId = "demo-copic-dual-agent";
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host) || process.env.GCLOUD_PROJECT !== projectId) {
  throw new Error("Run through the dedicated demo Firestore emulator command; production access is prohibited.");
}
const [hostname, port] = host.split(":"), adminApp = initializeAdminApp({ projectId }, "agent-emulator-admin");
const db = getAdminFirestore(adminApp);
const identities = ["agent", "client", "worker", "other-agent", "unverified", "admin"];
const sessions = identities.map(uid => {
  const app = initializeApp({ projectId, apiKey: "emulator-only" }, `emulator-${uid}`), firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, hostname, Number(port), { mockUserToken: { sub: uid, email_verified: uid !== "unverified" } });
  return { uid, app, firestore };
});
const session = (uid: string) => sessions.find(item => item.uid === uid)!.firestore;
const denied = (promise: Promise<unknown>) => assert.rejects(promise, (error: unknown) => (error as { code?: string }).code === "permission-denied");

before(async () => {
  const batch = db.batch();
  for (const uid of identities) batch.set(db.doc(`users/${uid}`), { role: uid === "admin" ? "admin" : uid === "client" ? "client" : "worker", agentEnabled: uid.includes("agent"), emailVerified: uid !== "unverified", isLocked: false, displayName: uid, skillProfiles: [{ id: "laundry", name: "Laundry" }] });
  batch.set(db.doc("jobs/job"), { clientId: "client", status: "open", title: "Laundry", payType: "fixed", clientAgent: { agentId: "agent", clientUid: "client", status: "approved", reference: "agentLinks/code" } });
  batch.set(db.doc("applications/app"), { jobId: "job", clientId: "client", workerId: "worker", status: "accepted", createdAt: new Date("2026-10-22"), requestSkillName: "Laundry", workerEarnings: 4500, grossAmount: 5000, serviceFeeAmount: 500 });
  batch.set(db.doc("agentReferrals/worker"), { agentId: "other-agent", referredWorkerId: "worker", referredAt: new Date("2026-10-20") });
  batch.set(db.doc("verifications/worker"), { status: "approved", nationalIdHash: "worker-identity", userId: "worker" });
  batch.set(db.doc("identityClaims/worker-identity"), { userId: "worker" });
  for (const collection of ["agentLinks", "agentJobProposals", "agentProposalLimits", "commissionLedger", "commissionStates", "commissionEvents", "agentMetrics"]) batch.set(db.doc(`${collection}/private`), { agentId: "agent", clientUid: "client", commissionAmount: 45, status: "pending" });
  await batch.commit();
});
after(async () => {
  for (const item of sessions) { await terminate(item.firestore); await deleteApp(item.app); }
  await db.terminate(); await deleteAdminApp(adminApp);
});

for (const uid of identities) test(`${uid} cannot read or mutate private financial, referral or approval collections`, async () => {
  for (const path of ["agentLinks/private", "agentReferrals/worker", "agentJobProposals/private", "agentProposalLimits/private", "commissionLedger/private", "commissionStates/private", "commissionEvents/private", "agentMetrics/private"]) {
    await denied(getDoc(doc(session(uid), path)));
    await denied(setDoc(doc(session(uid), path), { agentId: uid, commissionAmount: 999, status: "paid" }));
  }
});
test("ordinary self-profile edits work, but agent flags and balances cannot be changed", async () => {
  await updateDoc(doc(session("agent"), "users/agent"), { displayName: "Updated name" });
  assert.equal((await getDoc(doc(session("agent"), "users/agent"))).data()?.displayName, "Updated name");
  await denied(updateDoc(doc(session("agent"), "users/agent"), { agentEnabled: false }));
  await denied(updateDoc(doc(session("agent"), "users/agent"), { earnedCommission: 999 }));
  await denied(getDoc(doc(session("other-agent"), "users/agent")));
  await denied(updateDoc(doc(session("unverified"), "users/unverified"), { displayName: "Bypass" }));
});
test("job ownership and application privacy work while direct publication/completion is denied", async () => {
  assert.equal((await getDoc(doc(session("client"), "jobs/job"))).data()?.clientId, "client");
  assert.equal((await getDoc(doc(session("worker"), "applications/app"))).data()?.workerId, "worker");
  await denied(getDoc(doc(session("agent"), "applications/app")));
  for (const uid of ["agent", "client", "worker"]) {
    await denied(setDoc(doc(session(uid), "jobs/forged"), { clientId: "client", status: "open" }));
    await denied(updateDoc(doc(session(uid), "jobs/job"), { status: "completed", clientAgent: { agentId: uid } }));
    await denied(updateDoc(doc(session(uid), "applications/app"), { status: "completed", workerEarnings: 999999 }));
  }
});
test("report and dispute identities cannot be forged by another user", async () => {
  await denied(setDoc(doc(session("agent"), "reports/forged"), { userId: "client", relatedJobId: "job", status: "open" }));
  await denied(setDoc(doc(session("agent"), "disputes/forged"), { createdBy: "client", jobId: "job", status: "open" }));
});
test("real concurrent Firestore transactions credit both roles once and reverse on a participant report", async () => {
  await db.doc("jobs/job").update({ status: "completed" });
  await db.doc("applications/app").update({ status: "completed", paymentConfirmedAt: new Date() });
  await Promise.all(Array.from({ length: 6 }, () => reconcileCompletedApplication(db, "app")));
  assert.equal((await db.doc("commissionLedger/job_worker").get()).data()?.commissionAmount, 45);
  assert.equal((await db.doc("commissionLedger/job_worker_CLIENT_AGENT").get()).data()?.commissionAmount, 45);
  assert.equal((await db.doc("agentMetrics/agent").get()).data()?.pendingCommission, 45);
  assert.equal((await db.doc("agentMetrics/other-agent").get()).data()?.pendingCommission, 45);
  await setDoc(doc(session("client"), "reports/real"), { userId: "client", relatedJobId: "job", status: "open" });
  await reconcileCompletedApplication(db, "app");
  await reconcileCompletedApplication(db, "app");
  assert.equal((await db.doc("commissionStates/job_worker_CLIENT_AGENT").get()).data()?.status, "reversed");
  assert.equal((await db.doc("agentMetrics/agent").get()).data()?.pendingCommission, 0);
  assert.equal((await db.doc("commissionLedger/job_worker_CLIENT_AGENT").get()).data()?.commissionAmount, 45);
});
