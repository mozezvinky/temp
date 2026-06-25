import { adminErrorStatus, requireAdmin, writeAdminAuditLog } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { adminDb } from "@/lib/firebase-admin";
import { localDb } from "@/lib/local-sql";
import type { JobStatus } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function dateMillis(value: unknown) {
  if (typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "jobs:write");
    if (isSqlBackend()) {
      const jobs = localDb().prepare("SELECT * FROM jobs ORDER BY createdAt DESC LIMIT 120").all();
      const applications = localDb().prepare("SELECT * FROM applications ORDER BY createdAt DESC LIMIT 500").all();
      return NextResponse.json({ jobs, applications });
    }
    const [jobSnapshot, applicationSnapshot] = await Promise.all([
      adminDb().collection("jobs").limit(150).get(),
      adminDb().collection("applications").limit(500).get()
    ]);
    const jobs = jobSnapshot.docs
      .map<Record<string, unknown>>(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt))
      .slice(0, 120);
    const applications = applicationSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ jobs, applications });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load admin jobs." }, { status: adminErrorStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, "jobs:write");
    const body = await request.json().catch(() => ({}));
    const jobId = String(body.jobId ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    if (!jobId) return NextResponse.json({ error: "Choose a job to update." }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Add a reason for the audit log." }, { status: 400 });
    const patch = normalizeJobPatch(body.patch);
    if (!Object.keys(patch).length) return NextResponse.json({ error: "No job fields were provided." }, { status: 400 });

    const oldValue = isSqlBackend()
      ? localDb().prepare("SELECT * FROM jobs WHERE id = ?").get(jobId)
      : await adminDb().collection("jobs").doc(jobId).get().then(snapshot => snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as Record<string, unknown>) : null);
    if (!oldValue) return NextResponse.json({ error: "Job was not found." }, { status: 404 });

    if (isSqlBackend()) {
      const now = new Date().toISOString();
      const allowed = Object.entries(patch);
      for (const [key, value] of allowed) {
        localDb().prepare(`UPDATE jobs SET ${key} = ?, updatedAt = ? WHERE id = ?`).run(value == null ? null : value as string | number, now, jobId);
      }
    } else {
      await adminDb().collection("jobs").doc(jobId).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await writeAdminAuditLog(request, { admin, targetUserId: String(oldValue.clientId ?? ""), actionType: "job.admin_update", oldValue, newValue: patch, reason });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update this job." }, { status: adminErrorStatus(error) });
  }
}

function normalizeJobPatch(input: unknown) {
  const body = typeof input === "object" && input ? input as Record<string, unknown> : {};
  const patch: Record<string, string | number | null> = {};
  for (const key of ["title", "description", "category", "location", "county", "duration", "payType", "paymentMethod"] as const) {
    if (typeof body[key] === "string") patch[key] = body[key].trim();
  }
  if (typeof body.status === "string" && ["draft", "open", "pending", "live", "assigned", "active", "in_progress", "completed", "disputed", "cancelled", "moderated"].includes(body.status)) patch.status = body.status as JobStatus;
  for (const key of ["payAmount", "durationHours", "durationValue", "workersNeeded", "quantity"] as const) {
    if (key in body) {
      const value = Number(body[key]);
      if (Number.isFinite(value)) patch[key] = value;
    }
  }
  return patch;
}
