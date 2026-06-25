import { adminDb } from "@/lib/firebase-admin";
import { adminAuth } from "@/lib/firebase-admin";
import { adminErrorStatus, requireAdmin, writeAdminAuditLog } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { localDb } from "@/lib/local-sql";
import type { ApplicationStatus, JobStatus, Role } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

const editableUserFields = ["displayName", "email", "phoneNumber", "bio", "companyName", "availability", "verificationStatus", "outstandingServiceFee", "completedJobs", "ratingAverage", "ratingCount"] as const;
const applicationStatuses: ApplicationStatus[] = ["pending", "accepted", "completion_requested", "payment_sent", "completed", "rejected", "cancelled", "withdrawn"];
const cancellableJobStatuses: JobStatus[] = ["draft", "open", "pending", "live", "assigned", "active", "in_progress", "disputed", "moderated"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    if (["wallet_adjustment", "escrow_review", "refund_review"].includes(action)) {
      return NextResponse.json({ error: "Wallet, escrow, refunds, deposits, withdrawals, and payouts have been removed. Use Service Fee Payments for worker fee review." }, { status: 410 });
    }
    if (action === "suspend_user" || action === "unsuspend_user") return moderateUser(request, body, action);
    if (action === "update_user_profile") return updateUserProfile(request, body);
    if (action === "update_user_role") return updateUserRole(request, body);
    if (action === "set_application_status") return setApplicationStatus(request, body);
    if (action === "cancel_job") return cancelJob(request, body);
    if (action === "reset_password_email") return resetPasswordEmail(request, body);
    if (action === "force_logout") return forceLogout(request, body);
    if (action === "resend_verification_email") return resendVerificationNotice(request, body);
    return NextResponse.json({ error: "Unsupported admin action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to perform admin action." }, { status: adminErrorStatus(error) });
  }
}

async function resetPasswordEmail(request: NextRequest, body: Record<string, unknown>) {
  const admin = await requireAdmin(request, "users:write");
  const userId = requiredString(body.userId, "User is required.");
  const reason = requiredString(body.reason, "Reason is required.");
  const user = await readUser(userId);
  const email = String(user?.email ?? "").trim();
  if (!email) return NextResponse.json({ error: "This user has no email address for a password reset." }, { status: 400 });
  const resetLink = await adminAuth().generatePasswordResetLink(email);
  const sent = await sendAdminEmail(email, "Reset your Copic password", `
    <div style="font-family:Arial,sans-serif;background:#11120D;color:#FFFBF4;padding:32px;">
      <h1 style="font-size:24px;margin:0 0 16px;">Reset your password</h1>
      <p style="color:#D8CFBC;">An admin reviewed your support request and sent this secure password reset link.</p>
      <p><a href="${resetLink}" style="display:inline-block;background:#FFFBF4;color:#11120D;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;">Reset password</a></p>
      <p style="color:#D8CFBC;">If you did not request this, contact support immediately.</p>
    </div>
  `);
  await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: "auth.password_reset_email", oldValue: null, newValue: { emailSent: sent, email }, reason, linkedTicketId: optionalString(body.ticketId) });
  return NextResponse.json({ success: true, message: sent ? "Password reset email sent." : "Password reset link generated. Email sending is not configured locally." });
}

async function forceLogout(request: NextRequest, body: Record<string, unknown>) {
  const admin = await requireAdmin(request, "moderation:write");
  const userId = requiredString(body.userId, "User is required.");
  const reason = requiredString(body.reason, "Reason is required.");
  if (!isSqlBackend()) await adminAuth().revokeRefreshTokens(userId);
  await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: "auth.force_logout", oldValue: null, newValue: { refreshTokensRevoked: !isSqlBackend() }, reason, linkedTicketId: optionalString(body.ticketId) });
  return NextResponse.json({ success: true });
}

async function resendVerificationNotice(request: NextRequest, body: Record<string, unknown>) {
  const admin = await requireAdmin(request, "users:write");
  const userId = requiredString(body.userId, "User is required.");
  const reason = requiredString(body.reason, "Reason is required.");
  const user = await readUser(userId);
  const email = String(user?.email ?? "").trim();
  if (!email) return NextResponse.json({ error: "This user has no email address." }, { status: 400 });
  const sent = await sendAdminEmail(email, "Verify your Copic email", `
    <div style="font-family:Arial,sans-serif;background:#11120D;color:#FFFBF4;padding:32px;">
      <h1 style="font-size:24px;margin:0 0 16px;">Verify your email</h1>
      <p style="color:#D8CFBC;">Please sign in to Copic and open the email verification page to request a fresh verification code.</p>
    </div>
  `);
  await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: "auth.verification_notice", oldValue: { emailVerified: user?.emailVerified ?? null }, newValue: { emailSent: sent, email }, reason, linkedTicketId: optionalString(body.ticketId) });
  return NextResponse.json({ success: true, message: sent ? "Verification email sent." : "Verification reminder logged. Email sending is not configured locally." });
}

async function updateUserProfile(request: NextRequest, body: Record<string, unknown>) {
  const admin = await requireAdmin(request, "users:write");
  const userId = requiredString(body.userId, "User is required.");
  const reason = requiredString(body.reason, "Reason is required.");
  const ticketId = optionalString(body.ticketId);
  const patchInput = typeof body.patch === "object" && body.patch ? body.patch as Record<string, unknown> : {};
  const patch = Object.fromEntries(editableUserFields
    .filter(field => field in patchInput)
    .map(field => {
      const value = patchInput[field];
      return ["outstandingServiceFee", "completedJobs", "ratingAverage", "ratingCount"].includes(field)
        ? [field, Number(value ?? 0)]
        : [field, String(value ?? "").trim()];
    }));
  if (!Object.keys(patch).length) return NextResponse.json({ error: "No safe profile fields were provided." }, { status: 400 });
  const oldValue = await readUser(userId);
  await writeUserPatch(userId, { ...patch, updatedAt: timestampValue() });
  await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: "user.profile.update", oldValue: pickOldValues(oldValue, Object.keys(patch)), newValue: patch, reason, linkedTicketId: ticketId });
  return NextResponse.json({ success: true });
}

async function updateUserRole(request: NextRequest, body: Record<string, unknown>) {
  const admin = await requireAdmin(request, "admins:manage");
  const userId = requiredString(body.userId, "User is required.");
  const reason = requiredString(body.reason, "Reason is required.");
  const role = String(body.role ?? "") as Role;
  if (!["worker", "client"].includes(role)) return NextResponse.json({ error: "Choose worker or client. Admin accounts must be provisioned through the secured admin login flow." }, { status: 400 });
  const oldValue = await readUser(userId);
  await writeUserPatch(userId, { role, updatedAt: timestampValue() });
  await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: "user.role.update", oldValue: { role: oldValue?.role }, newValue: { role }, reason, linkedTicketId: optionalString(body.ticketId) });
  return NextResponse.json({ success: true });
}

async function moderateUser(request: NextRequest, body: Record<string, unknown>, action: string) {
  const admin = await requireAdmin(request, "moderation:write");
  const userId = requiredString(body.userId, "User is required.");
  const reason = requiredString(body.reason, "Reason is required.");
  const isLocked = action === "suspend_user";
  const oldValue = await readUser(userId);
  await writeUserPatch(userId, { isLocked, lockReason: isLocked ? reason : null, updatedAt: timestampValue() });
  await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: action, oldValue: { isLocked: oldValue?.isLocked, lockReason: oldValue?.lockReason }, newValue: { isLocked, lockReason: isLocked ? reason : null }, reason, linkedTicketId: optionalString(body.ticketId) });
  return NextResponse.json({ success: true });
}

async function setApplicationStatus(request: NextRequest, body: Record<string, unknown>) {
  const admin = await requireAdmin(request, "applications:write");
  const applicationId = requiredString(body.applicationId, "Application is required.");
  const reason = requiredString(body.reason, "Reason is required.");
  const status = String(body.status ?? "") as ApplicationStatus;
  if (!applicationStatuses.includes(status)) return NextResponse.json({ error: "Choose a valid application status." }, { status: 400 });
  const oldValue = isSqlBackend()
    ? localDb().prepare("SELECT * FROM applications WHERE id = ?").get(applicationId)
    : await adminDb().collection("applications").doc(applicationId).get().then(snapshot => snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as Record<string, unknown>) : null);
  if (!oldValue) return NextResponse.json({ error: "Application was not found." }, { status: 404 });
  if (isSqlBackend()) {
    localDb().prepare("UPDATE applications SET status = ?, updatedAt = ? WHERE id = ?").run(status, new Date().toISOString(), applicationId);
  } else {
    await adminDb().collection("applications").doc(applicationId).set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await writeAdminAuditLog(request, { admin, targetUserId: String(oldValue.workerId ?? ""), actionType: "application.status.update", oldValue: { status: oldValue.status }, newValue: { status }, reason, linkedTicketId: optionalString(body.ticketId) });
  return NextResponse.json({ success: true });
}

async function cancelJob(request: NextRequest, body: Record<string, unknown>) {
  const admin = await requireAdmin(request, "jobs:write");
  const jobId = requiredString(body.jobId, "Job is required.");
  const reason = requiredString(body.reason, "Reason is required.");
  const oldValue = isSqlBackend()
    ? localDb().prepare("SELECT * FROM jobs WHERE id = ?").get(jobId)
    : await adminDb().collection("jobs").doc(jobId).get().then(snapshot => snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as Record<string, unknown>) : null);
  if (!oldValue) return NextResponse.json({ error: "Job was not found." }, { status: 404 });
  if (!cancellableJobStatuses.includes(String(oldValue.status) as JobStatus)) return NextResponse.json({ error: "This job status cannot be cancelled by admin action." }, { status: 400 });
  if (isSqlBackend()) {
    localDb().prepare("UPDATE jobs SET status = 'cancelled', updatedAt = ? WHERE id = ?").run(new Date().toISOString(), jobId);
  } else {
    await adminDb().collection("jobs").doc(jobId).set({ status: "cancelled", adminCancelReason: reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await writeAdminAuditLog(request, { admin, targetUserId: String(oldValue.clientId ?? ""), actionType: "job.cancel", oldValue: { status: oldValue.status }, newValue: { status: "cancelled" }, reason, linkedTicketId: optionalString(body.ticketId) });
  return NextResponse.json({ success: true });
}

async function readUser(userId: string) {
  return isSqlBackend()
    ? localDb().prepare("SELECT * FROM users WHERE uid = ?").get(userId)
    : adminDb().collection("users").doc(userId).get().then(snapshot => snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as Record<string, unknown>) : null);
}

async function writeUserPatch(userId: string, patch: Record<string, unknown>) {
  if (isSqlBackend()) {
    const allowed = Object.entries(patch).filter(([key]) => key !== "updatedAt");
    for (const [key, value] of allowed) {
      if (!["displayName", "email", "phoneNumber", "bio", "companyName", "availability", "role", "verificationStatus", "isLocked", "lockReason", "outstandingServiceFee", "completedJobs", "ratingAverage", "ratingCount"].includes(key)) continue;
      localDb().prepare(`UPDATE users SET ${key} = ?, updatedAt = ? WHERE uid = ?`).run(value == null ? null : String(value), new Date().toISOString(), userId);
    }
    return;
  }
  await adminDb().collection("users").doc(userId).set(patch, { merge: true });
}

function requiredString(value: unknown, message: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(message);
  return text;
}

function optionalString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function timestampValue() {
  return isSqlBackend() ? new Date().toISOString() : FieldValue.serverTimestamp();
}

function pickOldValues(value: Record<string, unknown> | null | undefined, keys: string[]) {
  return Object.fromEntries(keys.map(key => [key, value?.[key] ?? null]));
}

async function sendAdminEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Copic <onboarding@resend.dev>",
    to,
    subject,
    html
  });
  if (error) throw new Error("Unable to send email. Check Resend sender settings.");
  return true;
}
