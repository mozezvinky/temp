import "server-only";

import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { adminStorage } from "@/lib/firebase-admin";
import { firebaseStorageBucketCandidates } from "@/lib/firebase-storage-bucket";

const LOCAL_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

export function shouldUseLocalServiceFeeStorage() {
  return process.env.SERVICE_FEE_UPLOAD_DRIVER === "local" ||
    (process.env.NODE_ENV !== "production" && process.env.USE_LOCAL_SERVICE_FEE_UPLOADS !== "false");
}

function safeUploadPath(uploadPath: string) {
  if (!uploadPath.startsWith("service-fees/") || uploadPath.includes("..")) {
    throw new Error("Invalid service fee upload path.");
  }
  return path.join(LOCAL_UPLOAD_ROOT, uploadPath);
}

export function isServiceFeeScreenshot(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.type.startsWith("image/") && value.size > 0 && value.size <= 8 * 1024 * 1024;
}

export async function saveServiceFeeScreenshot(workerId: string, paymentId: string, file: File) {
  const extension = safeExtension(file.name, file.type);
  const uploadPath = `service-fees/${workerId}/${paymentId}/payment-screenshot${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (shouldUseLocalServiceFeeStorage()) {
    await saveLocalServiceFeeUpload(uploadPath, buffer);
    return uploadPath;
  }
  const candidates = firebaseStorageBucketCandidates();
  if (!candidates.length) throw new Error("Firebase Storage bucket is not configured.");
  let lastError: unknown = null;
  for (const bucketName of candidates) {
    try {
      await adminStorage().bucket(bucketName).file(uploadPath).save(buffer, {
        resumable: false,
        contentType: file.type,
        metadata: {
          cacheControl: "private, max-age=0, no-transform",
          metadata: { originalName: file.name }
        }
      });
      return uploadPath;
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

export async function serviceFeeScreenshotUrl(uploadPath: string) {
  if (!uploadPath.startsWith("service-fees/")) return uploadPath;
  if (shouldUseLocalServiceFeeStorage() && await localServiceFeeUploadExists(uploadPath)) {
    return `/uploads/${uploadPath}`;
  }
  const expires = Date.now() + 15 * 60 * 1000;
  for (const bucketName of firebaseStorageBucketCandidates()) {
    try {
      const [url] = await adminStorage().bucket(bucketName).file(uploadPath).getSignedUrl({ action: "read", expires });
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

async function saveLocalServiceFeeUpload(uploadPath: string, buffer: Buffer) {
  const target = safeUploadPath(uploadPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
}

async function localServiceFeeUploadExists(uploadPath: string) {
  try {
    await access(safeUploadPath(uploadPath));
    return true;
  } catch {
    return false;
  }
}

function safeExtension(fileName: string, contentType: string) {
  const fromName = path.extname(fileName).toLowerCase();
  if (/^\.(png|jpe?g|webp|gif)$/.test(fromName)) return fromName;
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  return ".jpg";
}
