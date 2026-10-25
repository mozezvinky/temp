import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { activeAgent, agentMoney, settled, unresolvedIssue } from "@/functions/src/agent-policy";
import { MarketplaceError } from "@/lib/marketplace-server";

/** Recheck authoritative source inside the same transaction as a payout decision. */
export async function commissionSource(db: Firestore, tx: Transaction, ledger: FirebaseFirestore.DocumentData) {
  const [appSnap, jobSnap, disputes, timelines, agent, identity, reports] = await Promise.all([
    tx.get(db.doc(`applications/${ledger.applicationId}`)), tx.get(db.doc(`jobs/${ledger.jobId}`)),
    tx.get(db.collection("disputes").where("jobId", "==", ledger.jobId)),
    tx.get(db.collection("jobTimelines").where("jobId", "==", ledger.jobId)),
    tx.get(db.doc(`users/${ledger.agentId}`)), tx.get(db.doc(`verifications/${ledger.workerId}`)),
    tx.get(db.collection("reports").where("relatedJobId", "==", ledger.jobId))
  ]);
  const app = appSnap.data(), job = jobSnap.data();
  const identityData = identity.data();
  const claim = identityData?.nationalIdHash ? (await tx.get(db.doc(`identityClaims/${identityData.nationalIdHash}`))).data() : null;
  if (!activeAgent(agent.data()) || identityData?.status !== "approved" || claim?.userId !== ledger.workerId || ledger.agentId === ledger.workerId || ledger.agentId === job?.clientId) throw new MarketplaceError("Agent or worker eligibility requires review before payout.", 409);
  if (!app || !job || app.jobId !== ledger.jobId || app.workerId !== ledger.workerId || !settled(app) || !settled(job) || !app.paymentConfirmedAt || disputes.docs.some(doc => unresolvedIssue(doc.data(), job.clientId, app.workerId, "createdBy")) || reports.docs.some(doc => unresolvedIssue(doc.data(), job.clientId, app.workerId, "userId"))) throw new MarketplaceError("The source job or payment is not eligible for settlement.", 409);
  let net = Number(app.workerEarnings);
  if (["timeline", "pay_per_timeline"].includes(String(job.payType))) {
    const rows = timelines.docs.map(doc => doc.data()).filter(item => item.workerId === app.workerId || item.applicationId === ledger.applicationId);
    if (!rows.length || rows.some(item => item.status !== "paid")) throw new MarketplaceError("All worker timelines must be paid.", 409);
    net = rows.reduce((sum, item) => sum + Number(item.workerAmount ?? 0), 0);
  }
  return { net, ...agentMoney(net) };
}
