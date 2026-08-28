import { nationalIdHash } from "@/lib/identity-security";
import { isSqlBackend } from "@/lib/data-backend";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { firebaseStorageBucketCandidates } from "@/lib/firebase-storage-bucket";
import { localDb } from "@/lib/local-sql";
import { authErrorStatus, requireVerifiedServerUser } from "@/lib/server-auth";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_VERIFICATION_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: ReadonlyMap<string, string> = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
] as const);
type VerificationUploadSlot = "id-front" | "id-back" | "selfie";

function usernameFor(fullName: string, email: string, uid: string) {
  return (fullName || email.split("@")[0] || uid)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24) || uid.slice(0, 12);
}

function verificationDocId(uid: string, kind: string) {
  return kind === "driver_license" ? `driver-license-${uid}` : uid;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireVerifiedServerUser(request);
    const kind = request.nextUrl.searchParams.get("kind") === "driver_license" ? "driver_license" : "identity";
    if (isSqlBackend()) {
      const record = kind === "driver_license"
        ? localDb().prepare("SELECT *, licenseNumber as nationalIdHash FROM driver_license_verifications WHERE userId = ?").get(user.uid)
        : localDb().prepare("SELECT * FROM identity_verifications WHERE userId = ?").get(user.uid);
      return NextResponse.json({ verification: publicVerification(record, kind) });
    }
    const snapshot = await adminDb().collection("verifications").doc(verificationDocId(user.uid, kind)).get();
    return NextResponse.json({ verification: snapshot.exists ? publicVerification({ id: snapshot.id, ...snapshot.data() }, kind) : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load verification." }, { status: authErrorStatus(error) });
  }
}

function publicVerification(record: Record<string, unknown> | undefined, kind = "identity") {
  if (!record) return null;
  return {
    id: String(record.id ?? record.userId ?? ""),
    userId: String(record.userId ?? ""),
    kind,
    status: record.status,
    rejectionReason: record.rejectionReason ?? null,
    createdAt: record.createdAt ?? record.submittedAt ?? null,
    reviewedAt: record.reviewedAt ?? null
  };
}

function isAllowedImageFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && ALLOWED_IMAGE_TYPES.has(value.type) && value.size > 0 && value.size <= MAX_VERIFICATION_IMAGE_BYTES;
}

async function saveVerificationUpload(userId: string, slot: VerificationUploadSlot, file: File) {
  const extension = ALLOWED_IMAGE_TYPES.get(file.type);
  if (!extension) throw new Error("Unsupported verification image type.");
  const path = `verification/${userId}/${slot}/${crypto.randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const candidates = firebaseStorageBucketCandidates();
  if (!candidates.length) throw new Error("Firebase Storage bucket is not configured.");
  let lastError: unknown = null;
  for (const bucketName of candidates) {
    try {
      await adminStorage().bucket(bucketName).file(path).save(buffer, {
        resumable: false,
        contentType: file.type,
        metadata: {
          cacheControl: "private, max-age=0, no-transform",
          metadata: {
            userId,
            verificationSlot: slot
          }
        }
      });
      return path;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("bucket") && !message.includes("does not exist") && !message.includes("not found")) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Firebase Storage bucket was not found.");
}

async function assertVerificationUploadExists(path: string) {
  const candidates = firebaseStorageBucketCandidates();
  for (const bucketName of candidates) {
    try {
      await adminStorage().bucket(bucketName).file(path).getMetadata();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("bucket") && !message.includes("does not exist") && !message.includes("not found")) {
        throw error;
      }
    }
  }
  throw new Error("Verification upload was not found in Firebase Storage.");
}

async function assertCanSubmitVerification(userId: string, kind: "identity" | "driver_license", nationalIdHashValue: string) {
  if (isSqlBackend()) {
    if (kind === "driver_license") {
      const current = localDb().prepare("SELECT status FROM driver_license_verifications WHERE userId = ?").get(userId);
      if (current?.status === "pending") throw new SubmissionConflictError("Your driver's license is already awaiting review.");
      if (current?.status === "approved") throw new SubmissionConflictError("Your driver's license is already verified.");
      return;
    }
    const current = localDb().prepare("SELECT status FROM identity_verifications WHERE userId = ?").get(userId);
    if (current?.status === "pending") throw new SubmissionConflictError("Your verification is already awaiting review.");
    if (current?.status === "approved") throw new SubmissionConflictError("Your account is already verified.");
    const duplicate = localDb().prepare("SELECT userId FROM identity_verifications WHERE nationalIdHash = ? AND userId <> ?").get(nationalIdHashValue, userId);
    if (duplicate) throw new SubmissionConflictError("This ID is already attached to another account.");
    return;
  }

  const db = adminDb();
  const verificationSnap = await db.collection("verifications").doc(verificationDocId(userId, kind)).get();
  if (verificationSnap.data()?.status === "pending") throw new SubmissionConflictError(kind === "driver_license" ? "Your driver's license is already awaiting review." : "Your verification is already awaiting review.");
  if (verificationSnap.data()?.status === "approved") throw new SubmissionConflictError(kind === "driver_license" ? "Your driver's license is already verified." : "Your account is already verified.");
  if (kind === "identity") {
    const claim = await db.collection("identityClaims").doc(nationalIdHashValue).get();
    if (claim.exists && claim.data()?.userId !== userId) throw new SubmissionConflictError("This ID is already attached to another account.");
  }
}

class SubmissionConflictError extends Error {
  status = 409;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireVerifiedServerUser(request);
    if (!['client', 'worker'].includes(String(user.profile.role))) {
      return NextResponse.json({ error: "This account cannot submit verification." }, { status: 403 });
    }
    const isMultipart = request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data");
    if (!isMultipart) {
      return NextResponse.json({ error: "Verification images must be uploaded with the verification form." }, { status: 415 });
    }
    let kind: "identity" | "driver_license" = "identity";
    let fullName = "";
    let phoneNumber = "";
    let nationalId = "";
    let idFrontUrl = "";
    let idBackUrl = "";
    let selfieWithIdUrl = "";

    const form = await request.formData();
    kind = form.get("kind") === "driver_license" ? "driver_license" : "identity";
    if (kind === "driver_license" && user.profile.role !== "worker") return NextResponse.json({ error: "Only workers can submit a driver's license." }, { status: 403 });
    fullName = String(form.get("fullName") ?? user.profile.displayName ?? "").trim();
    phoneNumber = String(form.get("phoneNumber") ?? user.profile.phoneNumber ?? "").trim();
    nationalId = String(form.get("nationalId") ?? "").replace(/\s+/g, "");
    const idFront = form.get("idFront");
    const idBack = form.get("idBack");
    const selfieWithId = form.get("selfieWithId");
    if (!isAllowedImageFile(idFront) || !isAllowedImageFile(idBack) || !isAllowedImageFile(selfieWithId)) {
      return NextResponse.json({ error: kind === "driver_license" ? "Upload the license front, license back, and a selfie holding the license as JPEG, PNG, or WebP images under 8 MB each." : "Upload the ID front, ID back, and a selfie holding the ID as JPEG, PNG, or WebP images under 8 MB each." }, { status: 400 });
    }
    const email = String(user.email || user.profile.email || "").trim();
    if (!fullName || !email || !phoneNumber || !nationalId) {
      return NextResponse.json({ error: kind === "driver_license" ? "Upload the license front, license back, and a selfie holding the license, then complete your contact details." : "Upload the ID front, ID back, and a selfie holding the ID, then complete your contact details." }, { status: 400 });
    }
    if (kind === "identity" && !/^\d{5,12}$/.test(nationalId)) {
      return NextResponse.json({ error: "Enter a valid ID number." }, { status: 400 });
    }
    if (kind === "driver_license" && !/^[a-z0-9-]{4,24}$/i.test(nationalId)) {
      return NextResponse.json({ error: "Enter a valid driver's license number." }, { status: 400 });
    }
    const idHash = nationalIdHash(nationalId);
    await assertCanSubmitVerification(user.uid, kind, idHash);
    try {
      [idFrontUrl, idBackUrl, selfieWithIdUrl] = await Promise.all([
        saveVerificationUpload(user.uid, "id-front", idFront),
        saveVerificationUpload(user.uid, "id-back", idBack),
        saveVerificationUpload(user.uid, "selfie", selfieWithId)
      ]);
    } catch (error) {
      console.error("[kyc-upload] firebase-storage-save-failed", error instanceof Error ? { name: error.name, message: error.message, bucketsTried: firebaseStorageBucketCandidates() } : { message: "unknown upload error", bucketsTried: firebaseStorageBucketCandidates() });
      return NextResponse.json({ error: "Verification image upload failed. Please try again.", code: "verification_storage_upload_failed" }, { status: 502 });
    }
    if (!fullName || !email || !phoneNumber || !nationalId || !idFrontUrl || !idBackUrl || !selfieWithIdUrl) {
      return NextResponse.json({ error: kind === "driver_license" ? "Upload the license front, license back, and a selfie holding the license, then complete your contact details." : "Upload the ID front, ID back, and a selfie holding the ID, then complete your contact details." }, { status: 400 });
    }
    const ownedPrefix = `verification/${user.uid}/`;
    if (![idFrontUrl, idBackUrl, selfieWithIdUrl].every(path => path.startsWith(ownedPrefix))) {
      return NextResponse.json({ error: "Invalid verification upload path." }, { status: 400 });
    }
    try {
      await Promise.all([idFrontUrl, idBackUrl, selfieWithIdUrl].map(path => assertVerificationUploadExists(path)));
    } catch {
      return NextResponse.json({ error: "One or more verification uploads could not be found. Please upload all three images again." }, { status: 400 });
    }
    const submittedAt = new Date().toISOString();
    const username = usernameFor(fullName, email, user.uid);

    if (isSqlBackend()) {
      if (kind === "driver_license") {
        const current = localDb().prepare("SELECT status FROM driver_license_verifications WHERE userId = ?").get(user.uid);
        if (current?.status === "pending") return NextResponse.json({ error: "Your driver's license is already awaiting review." }, { status: 409 });
        if (current?.status === "approved") return NextResponse.json({ error: "Your driver's license is already verified." }, { status: 409 });
        localDb().prepare(`
          INSERT INTO driver_license_verifications (userId, role, fullName, email, phoneNumber, username, licenseNumber, idFrontUrl, idBackUrl, selfieWithIdUrl, status, rejectionReason, reviewedBy, submittedAt, reviewedAt, updatedAt)
          VALUES (?, 'worker', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, NULL, ?)
          ON CONFLICT(userId) DO UPDATE SET fullName=excluded.fullName, email=excluded.email, phoneNumber=excluded.phoneNumber,
            username=excluded.username, licenseNumber=excluded.licenseNumber, idFrontUrl=excluded.idFrontUrl, idBackUrl=excluded.idBackUrl,
            selfieWithIdUrl=excluded.selfieWithIdUrl, status='pending', rejectionReason=NULL, reviewedBy=NULL, submittedAt=excluded.submittedAt,
            reviewedAt=NULL, updatedAt=excluded.updatedAt
        `).run(user.uid, fullName, email, phoneNumber, username, nationalId, idFrontUrl, idBackUrl, selfieWithIdUrl, submittedAt, submittedAt);
        localDb().prepare("UPDATE users SET driverLicenseVerificationStatus = 'pending', phoneNumber = ?, updatedAt = ? WHERE uid = ?").run(phoneNumber, submittedAt, user.uid);
        return NextResponse.json({ success: true, status: "pending", message: "Your driver's license was submitted for manual review." });
      }
      const current = localDb().prepare("SELECT status FROM identity_verifications WHERE userId = ?").get(user.uid);
      if (current?.status === "pending") return NextResponse.json({ error: "Your verification is already awaiting review." }, { status: 409 });
      if (current?.status === "approved") return NextResponse.json({ error: "Your account is already verified." }, { status: 409 });
      const duplicate = localDb().prepare("SELECT userId FROM identity_verifications WHERE nationalIdHash = ? AND userId <> ?").get(idHash, user.uid);
      if (duplicate) return NextResponse.json({ error: "This ID is already attached to another account." }, { status: 409 });
      localDb().prepare(`
        INSERT INTO identity_verifications (userId, role, fullName, email, phoneNumber, username, nationalIdHash, idFrontUrl, idBackUrl, selfieWithIdUrl, status, rejectionReason, reviewedBy, submittedAt, reviewedAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, NULL, ?)
        ON CONFLICT(userId) DO UPDATE SET role=excluded.role, fullName=excluded.fullName, email=excluded.email, phoneNumber=excluded.phoneNumber,
          username=excluded.username, nationalIdHash=excluded.nationalIdHash, idFrontUrl=excluded.idFrontUrl, idBackUrl=excluded.idBackUrl,
          selfieWithIdUrl=excluded.selfieWithIdUrl, status='pending', rejectionReason=NULL, reviewedBy=NULL, submittedAt=excluded.submittedAt,
          reviewedAt=NULL, updatedAt=excluded.updatedAt
      `).run(user.uid, user.profile.role, fullName, email, phoneNumber, username, idHash, idFrontUrl, idBackUrl, selfieWithIdUrl, submittedAt, submittedAt);
      localDb().prepare("UPDATE users SET verificationStatus = 'pending', phoneNumber = ?, updatedAt = ? WHERE uid = ?").run(phoneNumber, submittedAt, user.uid);
      return NextResponse.json({ success: true, status: "pending", message: "Your ID verification was submitted for manual review." });
    }

    const db = adminDb();
    if (kind === "driver_license") {
      const verificationRef = db.collection("verifications").doc(verificationDocId(user.uid, kind));
      const userRef = db.collection("users").doc(user.uid);
      const currentVerification = await verificationRef.get();
      if (currentVerification.data()?.status === "pending") return NextResponse.json({ error: "Your driver's license is already awaiting review." }, { status: 409 });
      if (currentVerification.data()?.status === "approved") return NextResponse.json({ error: "Your driver's license is already verified." }, { status: 409 });
      await db.runTransaction(async transaction => {
        transaction.set(verificationRef, {
          id: verificationRef.id, userId: user.uid, kind, role: "worker", provider: "manual", fullName, email, phoneNumber, username,
          licenseNumber: nationalId, idFrontUrl, idBackUrl, selfieWithIdUrl, status: "pending", driverLicenseVerificationStatus: "pending",
          idFrontStoragePath: idFrontUrl, idBackStoragePath: idBackUrl, selfieWithIdStoragePath: selfieWithIdUrl,
          rejectionReason: null, reviewedBy: null, reviewedAt: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        transaction.set(userRef, { driverLicenseVerificationStatus: "pending", driverLicenseRejectionReason: null, phoneNumber, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      return NextResponse.json({ success: true, status: "pending", message: "Your driver's license was submitted for manual review." });
    }
    const claimRef = db.collection("identityClaims").doc(idHash);
    const verificationRef = db.collection("verifications").doc(user.uid);
    const userRef = db.collection("users").doc(user.uid);
    const currentVerification = await verificationRef.get();
    if (currentVerification.data()?.status === "pending") return NextResponse.json({ error: "Your verification is already awaiting review." }, { status: 409 });
    if (currentVerification.data()?.status === "approved") return NextResponse.json({ error: "Your account is already verified." }, { status: 409 });
    await db.runTransaction(async transaction => {
      const claim = await transaction.get(claimRef);
      if (claim.exists && claim.data()?.userId !== user.uid) throw new Error("This ID is already attached to another account.");
      transaction.set(claimRef, { userId: user.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(verificationRef, {
        id: user.uid, userId: user.uid, role: user.profile.role, provider: "manual", fullName, email, phoneNumber, username,
        nationalIdHash: idHash, idFrontUrl, idBackUrl, selfieWithIdUrl, status: "pending", identityVerificationStatus: "pending",
        idFrontStoragePath: idFrontUrl, idBackStoragePath: idBackUrl, selfieWithIdStoragePath: selfieWithIdUrl,
        rejectionReason: null, reviewedBy: null, reviewedAt: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      transaction.set(userRef, { verificationStatus: "pending", verificationRejectionReason: null, phoneNumber, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return NextResponse.json({ success: true, status: "pending", message: "Your ID verification was submitted for manual review." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit verification.";
    return NextResponse.json({ error: message }, { status: error instanceof SubmissionConflictError ? error.status : message.includes("already attached") ? 409 : authErrorStatus(error) });
  }
}
