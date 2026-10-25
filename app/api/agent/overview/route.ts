import { resolveJobPaymentBreakdown } from "@/utils/money";
import { NextRequest, NextResponse } from "next/server";
import { requireServerUser } from "@/lib/server-auth";
import { adminDb } from "@/lib/firebase-admin";
import { activeAgent } from "@/functions/src/agent-policy";
import { clientAgentCode } from "@/lib/client-agent";

export async function GET(request: NextRequest) {
  try {
    const user = await requireServerUser(request), db = adminDb();
    if (!activeAgent(user.profile)) return NextResponse.json({ enabled: false });
    const linkRef = db.doc(`agentLinks/${clientAgentCode(user.uid)}`);
    await db.runTransaction(async tx => { if (!(await tx.get(linkRef)).exists) tx.create(linkRef, {agentId:user.uid,roleType:"CLIENT_AGENT",active:true,name:"Post work with my referral"}); });
    const [ledger, jobs, workers, links, metrics, proposals] = await Promise.all([
      db.collection("commissionLedger").where("agentId", "==", user.uid).get(),
      db.collection("jobs").where("clientAgent.agentId", "==", user.uid).get(),
      db.collection("agentReferrals").where("agentId", "==", user.uid).get(),
      db.collection("agentLinks").where("agentId", "==", user.uid).get(),
      db.doc(`agentMetrics/${user.uid}`).get(),
      db.collection("agentJobProposals").where("agentId", "==", user.uid).get()
    ]);
    const workerProfiles = workers.empty ? [] : await db.getAll(...workers.docs.map(doc => db.doc(`users/${doc.id}`)));
    const activeWorkers = workerProfiles.filter(doc => { const p = doc.data(); return p && !p.isLocked && (p.skillProfiles?.length || p.skills?.length); }).length;
    const states = ledger.empty ? [] : await db.getAll(...ledger.docs.map(doc => db.doc(`commissionStates/${doc.id}`)));
    const records = ledger.docs.map((doc, i) => { const value = doc.data(); return { id: doc.id, jobId: value.jobId, workerId: value.workerId, grossJobAmount: Number(value.grossJobAmount ?? 0), roleType: value.roleType ?? "WORKER_AGENT", eligibleWorkerAmount: Number(states[i]?.data()?.eligibleWorkerAmount ?? value.eligibleWorkerAmount ?? 0), commissionAmount: Number(states[i]?.data()?.commissionAmount ?? value.commissionAmount ?? 0), status: states[i]?.data()?.status ?? value.status ?? "pending" }; });
    function summary(role: string) {
      const rows = records.filter(row => row.roleType === role && row.status !== "reversed");
      return { earned: rows.reduce((s, r) => s + Math.round(r.commissionAmount * 100), 0) / 100,
        available: rows.filter(r => r.status === "available").reduce((s, r) => s + Math.round(r.commissionAmount * 100), 0) / 100,
        pending: rows.filter(r => r.status === "pending").reduce((s, r) => s + Math.round(r.commissionAmount * 100), 0) / 100,
        completedJobs: new Set(rows.map(r => r.jobId)).size,
        net: rows.reduce((s, r) => s + Math.round(r.eligibleWorkerAmount * 100), 0) / 100 };
    }
    const client = { ...summary("CLIENT_AGENT"), generatedValue: records.filter(r => r.roleType === "CLIENT_AGENT" && r.status !== "reversed").reduce((sum, r) => sum + Math.round(r.grossJobAmount * 100), 0) / 100, eligibleJobs: jobs.docs.filter(doc => !["cancelled", "draft"].includes(String(doc.data().status)) && !doc.data().invalid && !doc.data().fraudulent).length }, worker = summary("WORKER_AGENT");
    return NextResponse.json({ enabled: true, client, worker, combined: { earned: client.earned + worker.earned, available: client.available + worker.available },
      metrics: { ...metrics.data(), activeWorkers }, clientCode: clientAgentCode(user.uid),
      links: links.docs.filter(doc => doc.data().roleType !== "CLIENT_AGENT").map(doc => ({ id: doc.id, name: doc.data().name })),
      workers: workers.docs.map(doc => ({ id: doc.id, status: doc.data().attributionStatus ?? "referred" })),
      clients: [...new Set(jobs.docs.map(doc => String(doc.data().clientId)))].map(id => ({ id })),
      jobs: jobs.docs.map(doc => { const j = doc.data(), earned = records.filter(r => r.jobId === doc.id && r.roleType === "CLIENT_AGENT"); const estimate = ["timeline", "pay_per_timeline"].includes(String(j.payType)) ? Number(j.totalWorkerAmount ?? 0) * Number(j.workersNeeded ?? 1) : resolveJobPaymentBreakdown(j).workerEarnings * Number(j.workersNeeded ?? 1); return { estimatedCommission: Math.floor((Math.round(estimate * 100) + 50) / 100) / 100, id: doc.id, title: j.title, clientId: j.clientId, gross: j.totalClientAmount ?? j.payAmount, status: j.status, workerNet: earned.reduce((s, r) => s + r.eligibleWorkerAmount, 0), commission: earned.filter(r => r.status !== "reversed").reduce((s, r) => s + r.commissionAmount, 0), paymentStatus: [...new Set(earned.map(r => r.status))].join(", ") || "potential" }; }),
      proposals: proposals.docs.map(doc => ({ id: doc.id, title: doc.data().job?.title, status: doc.data().status })), records
    });
  } catch { return NextResponse.json({ error: "Unable to load your agent overview. Verify your sign-in and try again." }, { status: 403 }); }
}
