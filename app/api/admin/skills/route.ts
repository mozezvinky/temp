import { adminDb } from "@/lib/firebase-admin";
import { adminErrorStatus, requireAdmin, writeAdminAuditLog } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { localDb, rowToUser } from "@/lib/local-sql";
import { type CopicNotificationInput, sendNotificationEmailsAfterCommit, setNotification } from "@/lib/notifications-server";
import type { UserProfile, WorkerSkillProfile, WorkerSkillVerificationStatus } from "@/types";
import { approvedSkillNames, normalizeSkillVerificationStatus } from "@/utils/worker-skills";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type AdminSkillRecord = WorkerSkillProfile & {
  workerId: string;
  workerName: string;
  workerEmail?: string;
};

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "users:read");
    const status = normalizeStatusFilter(request.nextUrl.searchParams.get("status"));
    if (isSqlBackend()) return NextResponse.json({ skills: localAdminSkills(status) });

    const [roleSnapshot, rolesSnapshot] = await Promise.all([
      adminDb().collection("users").where("role", "==", "worker").limit(200).get(),
      adminDb().collection("users").where("roles", "array-contains", "worker").limit(200).get()
    ]);
    const docs = new Map([...roleSnapshot.docs, ...rolesSnapshot.docs].map(doc => [doc.id, doc]));
    const skills = [...docs.values()].flatMap(doc => skillsForUser(doc.id, doc.data() as UserProfile, status));
    return NextResponse.json({ skills: sortSkills(skills) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load skills." }, { status: adminErrorStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, "moderation:write");
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    const skillId = String(body.skillId ?? "").trim();
    const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : "";
    const reason = String(body.reason ?? "").trim();
    if (!userId || !skillId || !action) return NextResponse.json({ error: "Choose a skill and review action." }, { status: 400 });
    if (action === "reject" && !reason) return NextResponse.json({ error: "Add a rejection reason." }, { status: 400 });

    if (isSqlBackend()) {
      const updated = reviewLocalSkill(userId, skillId, action === "approve" ? "approved" : "rejected", admin.uid, reason);
      if (!updated) return NextResponse.json({ error: "Skill was not found." }, { status: 404 });
      await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: `skill.${action}`, oldValue: null, newValue: updated, reason: reason || "Skill approved" });
      return NextResponse.json({ success: true, skill: updated });
    }

    const db = adminDb();
    const userRef = db.collection("users").doc(userId);
    let notification: CopicNotificationInput | null = null;
    const updatedSkill = await db.runTransaction(async transaction => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error("Worker was not found.");
      const user = userSnap.data() as UserProfile;
      const existing = Array.isArray(user.skillProfiles) ? user.skillProfiles : [];
      const skill = existing.find(item => item.id === skillId);
      if (!skill) throw new Error("Skill was not found.");
      const verificationStatus: WorkerSkillVerificationStatus = action === "approve" ? "approved" : "rejected";
      const reviewedSkill: WorkerSkillProfile = {
        ...skill,
        verificationStatus,
        reviewedBy: admin.uid,
        reviewedAt: new Date().toISOString(),
        rejectionReason: verificationStatus === "rejected" ? reason : null
      };
      const next = existing.map(item => item.id === skillId ? reviewedSkill : item);
      transaction.set(userRef, {
        skillProfiles: next,
        skills: approvedSkillNames(next),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      notification = {
        userId,
        type: verificationStatus === "approved" ? "skill_approved" : "skill_rejected",
        title: verificationStatus === "approved" ? "Skill verified" : "Skill not approved",
        message: verificationStatus === "approved"
          ? `Your skill '${skill.name}' has been verified.`
          : `Your skill '${skill.name}' was not approved.${reason ? ` Reason: ${reason}` : ""}`,
        link: "/profile",
        emailSubject: verificationStatus === "approved" ? "Your COPIC skill was verified" : "Your COPIC skill was not approved",
        eventId: `skill:${userId}:${skillId}:${verificationStatus}`
      };
      setNotification(transaction, db, notification);
      return { ...reviewedSkill, workerId: userId, workerName: String(user.displayName ?? "Worker"), workerEmail: typeof user.email === "string" ? user.email : undefined };
    });
    if (notification) await sendNotificationEmailsAfterCommit(db, [notification]);
    await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: `skill.${action}`, oldValue: null, newValue: updatedSkill, reason: reason || "Skill approved" });
    return NextResponse.json({ success: true, skill: updatedSkill });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to review skill." }, { status: adminErrorStatus(error) });
  }
}

function normalizeStatusFilter(value: unknown): WorkerSkillVerificationStatus | "all" {
  return value === "approved" || value === "rejected" || value === "all" ? value : "pending";
}

function skillsForUser(workerId: string, user: UserProfile, status: WorkerSkillVerificationStatus | "all"): AdminSkillRecord[] {
  const skillProfiles = Array.isArray(user.skillProfiles) ? user.skillProfiles : [];
  return skillProfiles
    .filter(skill => status === "all" || normalizeSkillVerificationStatus(skill.verificationStatus) === status)
    .map(skill => ({
      ...skill,
      verificationStatus: normalizeSkillVerificationStatus(skill.verificationStatus),
      workerId,
      workerName: String(user.displayName ?? user.email ?? "Worker"),
      workerEmail: typeof user.email === "string" ? user.email : undefined
    }));
}

function localAdminSkills(status: WorkerSkillVerificationStatus | "all") {
  const rows = localDb().prepare("SELECT * FROM users WHERE role = 'worker'").all();
  return sortSkills(rows.flatMap(row => skillsForUser(String(row.uid ?? row.id), rowToUser(row), status)));
}

function reviewLocalSkill(userId: string, skillId: string, verificationStatus: WorkerSkillVerificationStatus, adminId: string, reason: string) {
  const row = localDb().prepare("SELECT * FROM users WHERE uid = ?").get(userId);
  if (!row) return null;
  const user = rowToUser(row);
  const existing = user.skillProfiles ?? [];
  const skill = existing.find(item => item.id === skillId);
  if (!skill) return null;
  const reviewedSkill = { ...skill, verificationStatus, reviewedBy: adminId, reviewedAt: new Date().toISOString(), rejectionReason: verificationStatus === "rejected" ? reason : null };
  const next = existing.map(item => item.id === skillId ? reviewedSkill : item);
  localDb().prepare("UPDATE users SET skills = ?, skillProfiles = ?, updatedAt = ? WHERE uid = ?")
    .run(JSON.stringify(approvedSkillNames(next)), JSON.stringify(next), new Date().toISOString(), userId);
  return { ...reviewedSkill, workerId: userId, workerName: user.displayName, workerEmail: user.email };
}

function sortSkills(skills: AdminSkillRecord[]) {
  return [...skills].sort((a, b) => timestampMillis(b.submittedAt ?? b.createdAt) - timestampMillis(a.submittedAt ?? a.createdAt));
}

function timestampMillis(value: unknown) {
  if (typeof value === "string") return Date.parse(value) || 0;
  if (typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis: () => number }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  return 0;
}
