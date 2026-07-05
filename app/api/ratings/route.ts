import { isSqlBackend } from "@/lib/data-backend";
import { CurrentUserProfileError, getCurrentUserProfile } from "@/lib/current-user-profile";
import { adminDb } from "@/lib/firebase-admin";
import { createLocalRating, getLocalUser, localDb } from "@/lib/local-sql";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserProfile(request);
    const decoded = currentUser.decoded;
    const toUserId = request.nextUrl.searchParams.get("toUserId") ?? decoded.uid;
    if (isSqlBackend()) {
      return NextResponse.json(localRatingsResponse(toUserId));
    }
    const db = adminDb();
    const snapshot = await db.collection("ratings").where("toUserId", "==", toUserId).get();
    const ratings = await Promise.all(snapshot.docs.map(async item => {
      const data = item.data();
      const [job, fromUser] = await Promise.all([
        db.collection("jobs").doc(String(data.jobId)).get(),
        db.collection("users").doc(String(data.fromUserId)).get()
      ]);
      return { id: item.id, ...data, fromUserRole: fromUser.data()?.role, stars: Number(data.stars), jobTitle: job.data()?.title ?? "Completed job" };
    }));
    return NextResponse.json({ ratings, aggregate: ratingAggregate(ratings) });
  } catch {
    return NextResponse.json({ error: "Unable to load ratings." }, { status: 500 });
  }
}

function localRatingsResponse(toUserId: string) {
  const rows = localDb().prepare(`
    SELECT ratings.*, jobs.title AS jobTitle, users.role AS fromUserRole
    FROM ratings
    LEFT JOIN jobs ON jobs.id = ratings.jobId
    LEFT JOIN users ON users.uid = ratings.fromUserId
    WHERE ratings.toUserId = ?
    ORDER BY ratings.createdAt DESC
  `).all(toUserId);
  const ratings = rows.map(row => ({ ...row, stars: Number(row.stars), createdAt: null }));
  return { ratings, aggregate: ratingAggregate(ratings) };
}

function ratingAggregate(ratings: Array<{ stars?: unknown }>) {
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const rating of ratings) {
    const stars = Number(rating.stars) as 1 | 2 | 3 | 4 | 5;
    if (stars >= 1 && stars <= 5) breakdown[stars] += 1;
  }
  const count = ratings.length;
  const total = (Object.entries(breakdown) as Array<[string, number]>).reduce((sum, [stars, value]) => sum + (Number(stars) * value), 0);
  return { average: count ? total / count : 0, count, breakdown };
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserProfile(request);
    const decoded = currentUser.decoded;
    const body = await request.json().catch(() => ({}));
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const toUserId = typeof body.toUserId === "string" ? body.toUserId : "";
    const ratingScopeId = typeof body.ratingScopeId === "string" && body.ratingScopeId.trim() ? body.ratingScopeId.trim() : jobId;
    const stars = Number(body.stars);
    const review = typeof body.review === "string" ? body.review.trim() : "";
    if (!jobId || !toUserId || !Number.isInteger(stars) || stars < 1 || stars > 5) {
      return NextResponse.json({ error: "Choose a rating from 1 to 5 stars." }, { status: 400 });
    }

    if (isSqlBackend()) {
      const user = getLocalUser(decoded.uid);
      const raterRole = currentUser.profile?.role;
      if (!user || (raterRole !== "worker" && raterRole !== "client")) return NextResponse.json({ error: "This account cannot submit ratings." }, { status: 403 });
      const application = raterRole === "client"
        ? localDb().prepare("SELECT applications.*, jobs.payType as jobPayType FROM applications LEFT JOIN jobs ON jobs.id = applications.jobId WHERE applications.jobId = ? AND applications.clientId = ? AND applications.workerId = ? AND applications.status IN ('accepted', 'completion_requested', 'payment_sent', 'completed') LIMIT 1").get(jobId, decoded.uid, toUserId)
        : localDb().prepare("SELECT id FROM applications WHERE jobId = ? AND workerId = ? AND clientId = ? AND status IN ('accepted', 'completion_requested', 'payment_sent', 'completed') LIMIT 1").get(jobId, decoded.uid, toUserId);
      const timelinePaid = raterRole === "client"
        ? localDb().prepare("SELECT id FROM job_timelines WHERE jobId = ? AND workerId = ? AND status = 'paid' LIMIT 1").get(jobId, toUserId)
        : null;
      const clientCanRate = raterRole !== "client" || ["payment_sent", "completed"].includes(String(application?.status ?? "")) || (!!timelinePaid && String(application?.jobPayType ?? "") === "pay_per_timeline");
      if (!application || !clientCanRate) return NextResponse.json({ error: "This completed job could not be verified." }, { status: 403 });
      const id = createLocalRating({ id: crypto.randomUUID(), jobId, fromUserId: decoded.uid, toUserId, stars, review, ratingScopeId });
      if (raterRole === "client") localDb().prepare("UPDATE applications SET clientRating = ? WHERE id = ?").run(stars, String(application.id));
      return NextResponse.json({ success: true, id });
    }

    const db = adminDb();
    const raterRole = currentUser.profile?.role;
    const applicationSnap = raterRole === "client"
      ? await db.collection("applications").where("jobId", "==", jobId).where("clientId", "==", decoded.uid).where("workerId", "==", toUserId).limit(1).get()
      : await db.collection("applications").where("jobId", "==", jobId).where("workerId", "==", decoded.uid).where("clientId", "==", toUserId).limit(1).get();
    const applicationStatus = String(applicationSnap.docs[0]?.data().status ?? "");
    const jobSnap = await db.collection("jobs").doc(jobId).get();
    const paidTimelineSnap = raterRole === "client"
      ? await db.collection("jobTimelines").where("jobId", "==", jobId).where("workerId", "==", toUserId).where("status", "==", "paid").limit(1).get()
      : null;
    const canRate = raterRole === "client"
      ? ["payment_sent", "completed"].includes(applicationStatus) || (String(jobSnap.data()?.payType) === "pay_per_timeline" && !!paidTimelineSnap && !paidTimelineSnap.empty)
      : ["accepted", "completion_requested", "payment_sent", "completed"].includes(applicationStatus);
    if (applicationSnap.empty || !canRate) {
      return NextResponse.json({ error: "This completed job could not be verified." }, { status: 403 });
    }
    const existing = await db.collection("ratings").where("jobId", "==", jobId).where("fromUserId", "==", decoded.uid).where("toUserId", "==", toUserId).limit(20).get();
    const existingForScope = existing.docs.find(doc => String(doc.data().ratingScopeId ?? doc.data().jobId) === ratingScopeId);
    if (existingForScope) return NextResponse.json({ success: true, id: existingForScope.id });
    const ratingRef = db.collection("ratings").doc();
    const userRef = db.collection("users").doc(toUserId);
    await db.runTransaction(async transaction => {
      const userSnap = await transaction.get(userRef);
      const currentCount = Number(userSnap.data()?.ratingCount ?? 0);
      const currentAverage = Number(userSnap.data()?.ratingAverage ?? 0);
      const nextCount = currentCount + 1;
      const nextAverage = ((currentAverage * currentCount) + stars) / nextCount;
      transaction.set(ratingRef, { id: ratingRef.id, jobId, ratingScopeId, fromUserId: decoded.uid, toUserId, stars, review, createdAt: FieldValue.serverTimestamp() });
      transaction.set(userRef, { ratingAverage: nextAverage, ratingCount: nextCount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (raterRole === "client") transaction.set(applicationSnap.docs[0].ref, { clientRating: stars, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return NextResponse.json({ success: true, id: ratingRef.id });
  } catch (error) {
    if (error instanceof CurrentUserProfileError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save rating." }, { status: 500 });
  }
}
