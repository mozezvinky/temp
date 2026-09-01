import { isSqlBackend, logDataMode } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { countLocalActiveAcceptedApplications, listLocalWorkers } from "@/lib/local-sql";
import type { WorkerSkillProfile } from "@/types";
import { approvedSkillNames, approvedSkillProfiles } from "@/utils/worker-skills";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    logDataMode();
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(token);
    const role = request.nextUrl.searchParams.get("role");
    if (role !== "worker") return NextResponse.json({ users: [] });

    if (isSqlBackend()) {
      return NextResponse.json({ users: localWorkersFor(decoded.uid) });
    }

    const [roleSnapshot, rolesSnapshot] = await Promise.all([
      adminDb().collection("users").where("role", "==", "worker").limit(100).get(),
      adminDb().collection("users").where("roles", "array-contains", "worker").limit(100).get()
    ]);
    const docs = new Map([...roleSnapshot.docs, ...rolesSnapshot.docs].filter(doc => doc.id !== decoded.uid).map(doc => [doc.id, doc]));
    const workerDocs = [...docs.values()];
    const activeJobCounts = await countActiveAcceptedJobsForWorkers(workerDocs.map(doc => doc.id));
    const users: Array<Record<string, unknown>> = workerDocs.map(doc => {
      const activeJobCount = activeJobCounts.get(doc.id) ?? 0;
      return publicWorker({ id: doc.id, ...(doc.data() as Record<string, unknown>), activeJobCount, isOccupied: activeJobCount > 0 });
    });
    return NextResponse.json({ users: users.filter(worker => worker.isLocked !== true && Number(worker.outstandingServiceFee ?? 0) <= 0) });
  } catch (error) {
    console.error("[api/users] load failed", error);
    return NextResponse.json({ success: false, users: [], message: "Unable to load workers.", error: "Unable to load workers." }, { status: 500 });
  }
}

async function countActiveAcceptedJobsForWorkers(workerIds: string[]) {
  const counts = new Map<string, number>();
  if (!workerIds.length) return counts;
  const db = adminDb();
  const applicationDocs = (await Promise.all(chunk(workerIds, 30).map(async workerIdChunk => {
    const snap = await db.collection("applications")
      .where("workerId", "in", workerIdChunk)
      .limit(500)
      .get();
    return snap.docs
      .map(doc => doc.data())
      .filter(application => ["accepted", "completion_requested", "payment_sent"].includes(String(application.status)));
  }))).flat();
  const jobIds = [...new Set(applicationDocs.map(application => String(application.jobId ?? "")).filter(Boolean))];
  const jobSnaps = await Promise.all(jobIds.map(id => db.collection("jobs").doc(id).get()));
  const activeJobIds = new Set(jobSnaps.filter(snapshot => snapshot.exists && snapshot.data()?.status !== "completed").map(snapshot => snapshot.id));
  for (const application of applicationDocs) {
    const workerId = String(application.workerId ?? "");
    const jobId = String(application.jobId ?? "");
    if (workerId && activeJobIds.has(jobId)) counts.set(workerId, (counts.get(workerId) ?? 0) + 1);
  }
  return counts;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function localWorkersFor(uid: string) {
  return listLocalWorkers().filter(worker => worker.id !== uid && worker.uid !== uid).map(worker => {
    const activeJobCount = countLocalActiveAcceptedApplications(worker.id);
    return publicWorker({ ...worker, activeJobCount, isOccupied: activeJobCount > 0 });
  });
}

function publicWorker(worker: Record<string, unknown>) {
  const richSkills = Array.isArray(worker.skillProfiles) ? worker.skillProfiles as WorkerSkillProfile[] : [];
  const legacySkills = richSkills.length ? [] : Array.isArray(worker.skills) ? worker.skills.filter((skill): skill is string => typeof skill === "string" && !!skill.trim()) : [];
  const legacyProfiles: WorkerSkillProfile[] = legacySkills.map((name, index) => ({
    id: `legacy-${String(worker.id ?? worker.uid ?? "worker")}-${index}-${name}`,
    name,
    category: "services_trades",
    level: "independent",
    proofType: "reference",
    chargeAmount: Number(worker.hourlyRate ?? 0) > 0 ? Number(worker.hourlyRate) : undefined,
    chargeCategory: name,
    chargePayType: "fixed",
    completedJobs: Number(worker.completedJobs ?? 0),
    ratingAverage: Number(worker.ratingAverage ?? 0),
    ratingCount: Number(worker.ratingCount ?? 0),
    verificationStatus: "approved"
  }));
  const skillProfiles = approvedSkillProfiles(richSkills.length ? richSkills : legacyProfiles);
  return {
    ...worker,
    skillProfiles,
    skills: skillProfiles.length ? approvedSkillNames(skillProfiles) : legacySkills
  };
}
