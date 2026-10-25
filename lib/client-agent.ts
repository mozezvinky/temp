import "server-only";
import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { activeAgent } from "@/functions/src/agent-policy";
import { MarketplaceError, validId } from "@/lib/marketplace-server";

export function clientAgentCode(uid: string) { return createHash("sha256").update(`client:${uid}`).digest("hex").slice(0, 40); }

/** Explicit client approval of a proposal always takes precedence over a referral link. */
export async function approvedClientAgent(db: Firestore, tx: Transaction, clientUid: string, body: Record<string, unknown>) {
  if (!body.clientAgentCode && !body.agentProposalId) return null;
  let agentId: string, reference: string, sourceType: string;
  if (body.agentProposalId) {
    reference = `agentJobProposals/${validId(body.agentProposalId)}`;
    const proposal = (await tx.get(db.doc(reference))).data();
    if (!proposal || proposal.clientUid !== clientUid || proposal.status !== "pending" || body.approveAgentProposal !== true) throw new MarketplaceError("Only the intended client can review and approve this pending proposal.", 403);
    agentId = String(proposal.agentId); sourceType = "agent_sourced";
  } else {
    reference = `agentLinks/${validId(body.clientAgentCode)}`;
    const link = (await tx.get(db.doc(reference))).data();
    if (!link || link.active !== true || link.roleType !== "CLIENT_AGENT" || body.approveClientAgent !== true) throw new MarketplaceError("Review and confirm the referring agent before posting.", 400);
    agentId = String(link.agentId); sourceType = "referral_link";
  }
  const [agent, client, workerReferral] = await Promise.all([tx.get(db.doc(`users/${agentId}`)), tx.get(db.doc(`users/${clientUid}`)), tx.get(db.doc(`agentReferrals/${clientUid}`))]);
  if (agentId === clientUid || !activeAgent(agent.data()) || client.data()?.agentEnabled || workerReferral.data()?.agentId === agentId) throw new MarketplaceError("This agent attribution is not eligible.", 403);
  return { agentId, clientUid, reference, sourceType, status: "approved" };
}
