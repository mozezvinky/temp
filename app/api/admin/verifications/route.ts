import { adminErrorStatus, requireAdmin, writeAdminAuditLog } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { firebaseStorageBucketCandidates } from "@/lib/firebase-storage-bucket";
import { localDb } from "@/lib/local-sql";
import { localVerificationUploadUrl, shouldUseLocalVerificationStorage } from "@/lib/verification-local-storage";
import type { VerificationStatus } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "kyc:write");
    const status = request.nextUrl.searchParams.get("status") ?? "pending";
    if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return NextResponse.json({ error: "Invalid verification filter." }, { status: 400 });
    if (isSqlBackend()) {
      const rows = status === "all"
        ? localDb().prepare("SELECT * FROM identity_verifications ORDER BY submittedAt DESC LIMIT 100").all()
        : localDb().prepare("SELECT * FROM identity_verifications WHERE status = ? ORDER BY submittedAt DESC LIMIT 100").all(status);
      return NextResponse.json({ verifications: await Promise.all(rows.map(async row => signDocumentPaths({ ...row, id: row.userId, createdAt: row.submittedAt }))) });
    }
    const collection = adminDb().collection("verifications");
    const snapshot = status === "all" ? await collection.orderBy("createdAt", "desc").limit(100).get() : await collection.where("status", "==", status).limit(100).get();
    const verifications = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
      .sort((first, second) => timestampMillis(second.createdAt) - timestampMillis(first.createdAt));
    return NextResponse.json({ verifications: await Promise.all(verifications.map(record => signDocumentPaths(record))) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load ID verification requests." }, { status: adminErrorStatus(error) });
  }
}

function timestampMillis(value: unknown) {
  return typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis: () => number }).toMillis()
    : typeof value === "string"
      ? new Date(value).getTime() || 0
      : 0;
}

async function signDocumentPaths(record: Record<string, unknown>) {
  const expires = Date.now() + 15 * 60 * 1000;
  async function sign(field: string) {
    const path = String(record[field] ?? "");
    if (!path.startsWith("verification/")) return "";
    if (shouldUseLocalVerificationStorage()) {
      const localUrl = await localVerificationUploadUrl(path);
      if (localUrl) return localUrl;
    }
    for (const bucketName of firebaseStorageBucketCandidates()) {
      try {
        const [url] = await adminStorage().bucket(bucketName).file(path).getSignedUrl({ action: "read", expires });
        return url;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (!message.includes("bucket") && !message.includes("does not exist") && !message.includes("not found")) {
          throw error;
        }
      }
    }
    return "";
  }
  const [idFrontUrl, idBackUrl, selfieWithIdUrl] = await Promise.all([sign("idFrontUrl"), sign("idBackUrl"), sign("selfieWithIdUrl")]);
  return { ...record, idFrontUrl, idBackUrl, selfieWithIdUrl };
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, "kyc:write");
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    const status = String(body.status ?? "") as Extract<VerificationStatus, "approved" | "rejected">;
    const rejectionReason = String(body.rejectionReason ?? "").trim();
    if (!userId) return NextResponse.json({ error: "Choose a verification request." }, { status: 400 });
    if (status !== "approved" && status !== "rejected") return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
    const reason = status === "approved" ? "Manual ID verification approved." : rejectionReason || "The submitted ID images could not be verified.";

    if (isSqlBackend()) {
      const existing = localDb().prepare("SELECT * FROM identity_verifications WHERE userId = ?").get(userId);
      if (!existing) return NextResponse.json({ error: "Verification request not found." }, { status: 404 });
      const now = new Date().toISOString();
      localDb().exec("BEGIN");
      try {
        localDb().prepare("UPDATE identity_verifications SET status = ?, rejectionReason = ?, reviewedBy = ?, reviewedAt = ?, updatedAt = ? WHERE userId = ?")
          .run(status, status === "rejected" ? reason : null, admin.uid, now, now, userId);
        localDb().prepare("UPDATE users SET verificationStatus = ?, updatedAt = ? WHERE uid = ?").run(status, now, userId);
        localDb().prepare("INSERT INTO notifications (id, userId, title, body, href, read, createdAt) VALUES (?, ?, ?, ?, '/profile', 0, ?)")
          .run(crypto.randomUUID(), userId, status === "approved" ? "Account verified" : "ID verification rejected", status === "approved" ? "Your account is now Verified." : reason, now);
        localDb().exec("COMMIT");
      } catch (error) {
        localDb().exec("ROLLBACK");
        throw error;
      }
      await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: "kyc.manual_review", oldValue: { status: existing.status }, newValue: { status, rejectionReason: status === "rejected" ? reason : null }, reason });
      return NextResponse.json({ success: true });
    }

    const db = adminDb();
    const verificationRef = db.collection("verifications").doc(userId);
    const userRef = db.collection("users").doc(userId);
    const existing = await verificationRef.get();
    if (!existing.exists) return NextResponse.json({ error: "Verification request not found." }, { status: 404 });
    const notificationRef = db.collection("notifications").doc();
    await db.runTransaction(async transaction => {
      transaction.set(verificationRef, { status, identityVerificationStatus: status, rejectionReason: status === "rejected" ? reason : null, reviewedBy: admin.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(userRef, { verificationStatus: status, identityVerificationStatus: status, verificationRejectionReason: status === "rejected" ? reason : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(notificationRef, { id: notificationRef.id, userId, title: status === "approved" ? "Account verified" : "ID verification rejected", body: status === "approved" ? "Your account is now Verified." : reason, href: "/profile", read: false, createdAt: FieldValue.serverTimestamp() });
    });
    await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: "kyc.manual_review", oldValue: { status: existing.data()?.status }, newValue: { status, rejectionReason: status === "rejected" ? reason : null }, reason });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to review this verification." }, { status: adminErrorStatus(error) });
  }
}
