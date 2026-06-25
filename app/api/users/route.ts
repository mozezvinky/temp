import { isSqlBackend, logDataMode } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { countLocalActiveAcceptedApplications, listLocalWorkers } from "@/lib/local-sql";
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
    const users: Array<Record<string, unknown>> = await Promise.all([...docs.values()].map(async doc => {
      const activeJobCount = await countActiveAcceptedJobs(doc.id);
      return { id: doc.id, ...(doc.data() as Record<string, unknown>), activeJobCount, isOccupied: activeJobCount > 0 };
    }));
    return NextResponse.json({ users: users.filter(worker => worker.isLocked !== true && Number(worker.outstandingServiceFee ?? 0) <= 0) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load users." }, { status: 500 });
  }
}

async function countActiveAcceptedJobs(workerId: string) {
  const db = adminDb();
  const applications = await db.collection("applications").where("workerId", "==", workerId).limit(40).get();
  if (applications.empty) return 0;
  const activeApplications = applications.docs.filter(application => ["accepted", "completion_requested", "payment_sent"].includes(String(application.data().status)));
  const jobSnaps = await Promise.all(activeApplications.map(application => {
    const jobId = String(application.data().jobId ?? "");
    return jobId ? db.collection("jobs").doc(jobId).get() : Promise.resolve(null);
  }));
  return jobSnaps.filter(snapshot => snapshot?.exists && snapshot.data()?.status !== "completed").length;
}

function localWorkersFor(uid: string) {
  return listLocalWorkers().filter(worker => worker.id !== uid && worker.uid !== uid).map(worker => {
    const activeJobCount = countLocalActiveAcceptedApplications(worker.id);
    return { ...worker, activeJobCount, isOccupied: activeJobCount > 0 };
  });
}
