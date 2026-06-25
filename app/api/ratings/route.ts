import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { createLocalRating, getLocalUser, localDb } from "@/lib/local-sql";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const decoded = await adminAuth().verifyIdToken(token);
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
  } catch (error) {
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
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(token);
    const body = await request.json().catch(() => ({}));
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const toUserId = typeof body.toUserId === "string" ? body.toUserId : "";
    const stars = Number(body.stars);
    const review = typeof body.review === "string" ? body.review.trim() : "";
    if (!jobId || !toUserId || !Number.isInteger(stars) || stars < 1 || stars > 5) {
      return NextResponse.json({ error: "Choose a rating from 1 to 5 stars." }, { status: 400 });
    }

    if (isSqlBackend()) {
      const user = getLocalUser(decoded.uid);
      if (!user || (user.role !== "worker" && user.role !== "client")) return NextResponse.json({ error: "This account cannot submit ratings." }, { status: 403 });
      const application = user.role === "client"
        ? localDb().prepare("SELECT id FROM applications WHERE jobId = ? AND clientId = ? AND workerId = ? AND status IN ('payment_sent', 'completed') LIMIT 1").get(jobId, decoded.uid, toUserId)
        : localDb().prepare("SELECT id FROM applications WHERE jobId = ? AND workerId = ? AND clientId = ? AND status IN ('accepted', 'completion_requested', 'payment_sent', 'completed') LIMIT 1").get(jobId, decoded.uid, toUserId);
      if (!application) return NextResponse.json({ error: "This completed job could not be verified." }, { status: 403 });
      const id = createLocalRating({ id: crypto.randomUUID(), jobId, fromUserId: decoded.uid, toUserId, stars, review });
      if (user.role === "client") localDb().prepare("UPDATE applications SET clientRating = ? WHERE id = ?").run(stars, String(application.id));
      return NextResponse.json({ success: true, id });
    }

    const db = adminDb();
    const raterProfile = await db.collection("users").doc(decoded.uid).get();
    const raterRole = raterProfile.data()?.role;
    const applicationSnap = raterRole === "client"
      ? await db.collection("applications").where("jobId", "==", jobId).where("clientId", "==", decoded.uid).where("workerId", "==", toUserId).limit(1).get()
      : await db.collection("applications").where("jobId", "==", jobId).where("workerId", "==", decoded.uid).where("clientId", "==", toUserId).limit(1).get();
    const applicationStatus = String(applicationSnap.docs[0]?.data().status ?? "");
    const canRate = raterRole === "client" ? ["payment_sent", "completed"].includes(applicationStatus) : ["accepted", "completion_requested", "payment_sent", "completed"].includes(applicationStatus);
    if (applicationSnap.empty || !canRate) {
      return NextResponse.json({ error: "This completed job could not be verified." }, { status: 403 });
    }
    const existing = await db.collection("ratings").where("jobId", "==", jobId).where("fromUserId", "==", decoded.uid).where("toUserId", "==", toUserId).limit(1).get();
    if (!existing.empty) return NextResponse.json({ success: true, id: existing.docs[0].id });
    const ratingRef = db.collection("ratings").doc();
    const userRef = db.collection("users").doc(toUserId);
    await db.runTransaction(async transaction => {
      const userSnap = await transaction.get(userRef);
      const currentCount = Number(userSnap.data()?.ratingCount ?? 0);
      const currentAverage = Number(userSnap.data()?.ratingAverage ?? 0);
      const nextCount = currentCount + 1;
      const nextAverage = ((currentAverage * currentCount) + stars) / nextCount;
      transaction.set(ratingRef, { id: ratingRef.id, jobId, fromUserId: decoded.uid, toUserId, stars, review, createdAt: FieldValue.serverTimestamp() });
      transaction.set(userRef, { ratingAverage: nextAverage, ratingCount: nextCount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (raterRole === "client") transaction.set(applicationSnap.docs[0].ref, { clientRating: stars, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return NextResponse.json({ success: true, id: ratingRef.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save rating." }, { status: 500 });
  }
}
