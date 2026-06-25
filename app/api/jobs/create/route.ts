import { isSqlBackend } from "@/lib/data-backend";
import { CurrentUserProfileError, getCurrentUserProfile } from "@/lib/current-user-profile";
import { adminDb } from "@/lib/firebase-admin";
import { createLocalJob, markLocalEmailVerified } from "@/lib/local-sql";
import { jobSchema } from "@/utils/validation";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserProfile(request, "client");
    const body = await request.json().catch(() => ({}));
    const parsed = jobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the job details." }, { status: 400 });
    }

    if (isSqlBackend()) {
      const user = currentUser.profile;
      if (currentUser.role && currentUser.role !== "client" && currentUser.role !== "admin") {
        return NextResponse.json({ error: "You do not have permission to post work. Please use a client account." }, { status: 403 });
      }
      if (!user || !currentUser.role) {
        return NextResponse.json({ error: "Local account profile was not found. Open your profile once, then try posting work again." }, { status: 409 });
      }
      if (user.emailVerified !== true && currentUser.emailVerified === true) markLocalEmailVerified(currentUser.uid);
      const data = parsed.data;
      const jobId = randomUUID();
      const job = createLocalJob({
        id: jobId,
        clientId: currentUser.uid,
        clientName: user.displayName ?? currentUser.displayName ?? currentUser.email ?? "Copic client",
        title: data.title,
        description: data.description,
        category: data.category,
        location: data.location,
        county: data.county,
        locationDetails: data.locationDetails,
        payAmount: data.payAmount,
        payType: data.payType,
        duration: data.duration,
        durationValue: data.durationValue,
        durationUnit: data.durationUnit,
        durationHours: data.durationHours,
        workersNeeded: data.workersNeeded,
        quantity: data.quantity,
        unit: data.unit,
        customUnit: data.customUnit,
        paymentMethod: data.paymentMethod,
        requiredSkills: data.requiredSkills
      });
      return NextResponse.json({ success: true, jobId: job?.id });
    }

    const db = adminDb();
    const userRef = db.collection("users").doc(currentUser.uid);
    const userSnap = await userRef.get();
    const user = userSnap.data();
    if (!userSnap.exists || !["client", "admin"].includes(String(user?.role))) {
      return NextResponse.json({ error: "You do not have permission to post work. Please use a client account." }, { status: 403 });
    }
    const userData = user as Record<string, unknown>;

    const jobRef = db.collection("jobs").doc();
    const activityRef = db.collection("activities").doc();
    const data = parsed.data;
    const batch = db.batch();
    batch.set(jobRef, {
      id: jobRef.id,
      ...data,
      clientId: currentUser.uid,
      clientName: userData.displayName ?? currentUser.displayName ?? currentUser.email ?? "Copic client",
      createdBy: currentUser.uid,
      rateType: data.payType,
      rateAmount: data.payAmount,
      applicants: [],
      assignedWorkerId: null,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    batch.set(activityRef, {
      id: activityRef.id,
      userId: currentUser.uid,
      role: "client",
      type: "job_posted",
      title: "Job posted",
      description: `${data.title} is open for applications.`,
      relatedId: jobRef.id,
      read: false,
      createdAt: FieldValue.serverTimestamp()
    });
    if (userData.emailVerified !== true && currentUser.emailVerified === true) {
      batch.set(userRef, { emailVerified: true, emailVerifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();

    return NextResponse.json({ success: true, jobId: jobRef.id });
  } catch (error) {
    if (error instanceof CurrentUserProfileError) {
      return NextResponse.json({ error: error.message === "Sign in is required." ? "Please sign in before posting work." : error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unable to post work right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
