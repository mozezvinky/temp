import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { createLocalDirectHireRequest, getLocalUser, respondLocalDirectHireRequest } from "@/lib/local-sql";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const decoded = await requireDecodedUser(request);
    const body = await request.json().catch(() => ({}));
    const input = normalizeRequest(body);
    if (!input.workerId || !input.title || !input.category || !input.location || !input.startDate || !input.duration || input.payAmount <= 0) {
      return NextResponse.json({ error: "Complete the direct hire request details." }, { status: 400 });
    }
    if (input.workerId === decoded.uid) return NextResponse.json({ error: "You cannot hire yourself." }, { status: 400 });

    if (isSqlBackend()) {
      const client = getLocalUser(decoded.uid);
      if (!client || client.role !== "client") return NextResponse.json({ error: "Use a client account to send hire requests." }, { status: 403 });
      const application = createLocalDirectHireRequest({
        id: crypto.randomUUID(),
        jobId: crypto.randomUUID(),
        clientId: client.id,
        clientName: client.displayName,
        ...input
      });
      return NextResponse.json({ success: true, request: application });
    }

    const db = adminDb();
    const [clientSnap, workerSnap] = await Promise.all([
      db.collection("users").doc(decoded.uid).get(),
      db.collection("users").doc(input.workerId).get()
    ]);
    const client = clientSnap.data();
    const worker = workerSnap.data();
    if (!clientSnap.exists || client?.role !== "client") return NextResponse.json({ error: "Use a client account to send hire requests." }, { status: 403 });
    if (!workerSnap.exists || worker?.role !== "worker") return NextResponse.json({ error: "Choose a valid worker." }, { status: 404 });
    if (worker?.isLocked === true || Number(worker?.outstandingServiceFee ?? 0) > 0) return NextResponse.json({ error: "This worker is not available for new jobs." }, { status: 400 });
    const activeSnap = await db.collection("applications").where("workerId", "==", input.workerId).limit(40).get();
    const activeApps = activeSnap.docs.filter(doc => ["accepted", "completion_requested", "payment_sent"].includes(String(doc.data().status)));
    if (activeApps.length) return NextResponse.json({ error: "This worker is occupied on another job right now." }, { status: 400 });

    const jobRef = db.collection("jobs").doc();
    const applicationRef = db.collection("applications").doc();
    const notificationRef = db.collection("notifications").doc();
    const payload = {
      id: applicationRef.id,
      jobId: jobRef.id,
      workerId: input.workerId,
      clientId: decoded.uid,
      jobTitle: input.title,
      jobCategory: input.category,
      coverNote: "Direct hire request",
      source: "direct_hire",
      requestLocation: input.location,
      requestStartDate: input.startDate,
      requestDuration: input.duration,
      requestDescription: input.description,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    const batch = db.batch();
    batch.set(jobRef, {
      id: jobRef.id,
      clientId: decoded.uid,
      clientName: String(client?.displayName ?? "Client"),
      createdBy: decoded.uid,
      title: input.title,
      description: input.description,
      category: input.category,
      location: input.location,
      county: "",
      payAmount: input.payAmount,
      payType: "fixed",
      duration: input.duration,
      workersNeeded: 1,
      requiredSkills: [],
      applicants: [],
      assignedWorkerId: null,
      status: "pending",
      rateType: "fixed",
      rateAmount: input.payAmount,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    batch.set(applicationRef, payload);
    batch.set(notificationRef, {
      id: notificationRef.id,
      userId: input.workerId,
      title: "Direct hire request",
      body: `${String(client?.displayName ?? "A client")} sent you a direct hire request for ${input.title}.`,
      read: false,
      href: "/dashboard",
      createdAt: FieldValue.serverTimestamp()
    });
    await batch.commit();
    return NextResponse.json({ success: true, request: payload });
  } catch (error) {
    const status = error instanceof AuthRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to send direct hire request.";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const decoded = await requireDecodedUser(request);
    const body = await request.json().catch(() => ({}));
    const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
    const response = body.response === "accept" ? "accept" : body.response === "reject" ? "reject" : "";
    if (!applicationId || !response) return NextResponse.json({ error: "Choose a request to update." }, { status: 400 });

    if (isSqlBackend()) {
      const worker = getLocalUser(decoded.uid);
      if (!worker || worker.role !== "worker") return NextResponse.json({ error: "Use a worker account to answer hire requests." }, { status: 403 });
      const application = respondLocalDirectHireRequest(applicationId, decoded.uid, response);
      if (!application) return NextResponse.json({ error: "Hire request was not found." }, { status: 404 });
      return NextResponse.json({ success: true, request: application });
    }

    const db = adminDb();
    const applicationRef = db.collection("applications").doc(applicationId);
    const result = await db.runTransaction(async transaction => {
      const applicationSnap = await transaction.get(applicationRef);
      if (!applicationSnap.exists) throw new AuthRouteError("Hire request was not found.", 404);
      const application = applicationSnap.data() ?? {};
      if (application.workerId !== decoded.uid) throw new AuthRouteError("You can only answer your own hire requests.", 403);
      if (application.source !== "direct_hire") throw new AuthRouteError("This is not a direct hire request.", 400);
      if (application.status !== "pending") throw new AuthRouteError("This request has already been answered.", 400);
      if (response === "accept") {
        const workerSnap = await transaction.get(db.collection("users").doc(decoded.uid));
        const worker = workerSnap.data() ?? {};
        if (worker.isLocked === true || Number(worker.outstandingServiceFee ?? 0) > 0) {
          throw new AuthRouteError(String(worker.lockReason ?? "Service Fee Payment Required"), 403);
        }
      }
      const jobRef = db.collection("jobs").doc(String(application.jobId));
      const jobSnap = await transaction.get(jobRef);
      if (!jobSnap.exists) throw new AuthRouteError("Job was not found.", 404);
      const status = response === "accept" ? "accepted" : "rejected";
      transaction.set(applicationRef, { status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(jobRef, { status: response === "accept" ? "live" : "cancelled", assignedWorkerId: response === "accept" ? decoded.uid : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (response === "accept") {
        const conversationRef = db.collection("messages").doc(`${application.jobId}_${application.workerId}`);
        transaction.set(conversationRef, {
          id: conversationRef.id,
          jobId: application.jobId,
          clientId: application.clientId,
          workerId: application.workerId,
          locked: false,
          participants: [application.clientId, application.workerId],
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
      const notificationRef = db.collection("notifications").doc();
      transaction.set(notificationRef, {
        id: notificationRef.id,
        userId: application.clientId,
        title: response === "accept" ? "Direct hire accepted" : "Direct hire rejected",
        body: response === "accept"
          ? `${application.workerName ?? "The worker"} accepted your direct hire request for ${application.jobTitle ?? "the job"}.`
          : `${application.workerName ?? "The worker"} rejected your direct hire request for ${application.jobTitle ?? "the job"}.`,
        read: false,
        href: response === "accept" ? "/find-work" : "/workers",
        createdAt: FieldValue.serverTimestamp()
      });
      return { id: applicationSnap.id, ...application, status };
    });
    return NextResponse.json({ success: true, request: result });
  } catch (error) {
    const status = error instanceof AuthRouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to update hire request.";
    return NextResponse.json({ error: message }, { status });
  }
}

async function requireDecodedUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new AuthRouteError("Sign in is required.", 401);
  return adminAuth().verifyIdToken(token);
}

function normalizeRequest(body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return {
    workerId: typeof input.workerId === "string" ? input.workerId : "",
    title: typeof input.title === "string" ? input.title.trim() : "",
    category: typeof input.category === "string" ? input.category.trim() : "",
    payAmount: Number(input.payAmount),
    location: typeof input.location === "string" ? input.location.trim() : "",
    startDate: typeof input.startDate === "string" ? input.startDate : "",
    duration: typeof input.duration === "string" ? input.duration.trim() : "",
    description: typeof input.description === "string" ? input.description.trim() : ""
  };
}

class AuthRouteError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
