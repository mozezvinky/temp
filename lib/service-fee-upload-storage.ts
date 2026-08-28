import "server-only";

import { adminStorage } from "@/lib/firebase-admin";
import { firebaseStorageBucketCandidates } from "@/lib/firebase-storage-bucket";

const MAX_SERVICE_FEE_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const ALLOWED_SERVICE_FEE_IMAGE_TYPES: ReadonlyMap<string, string> = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
] as const);

export function isServiceFeeScreenshot(value: FormDataEntryValue | null): value is File {
  return value instanceof File && ALLOWED_SERVICE_FEE_IMAGE_TYPES.has(value.type) && value.size > 0 && value.size <= MAX_SERVICE_FEE_SCREENSHOT_BYTES;
}

export async function saveServiceFeeScreenshot(workerId: string, paymentId: string, file: File) {
  const extension = ALLOWED_SERVICE_FEE_IMAGE_TYPES.get(file.type);
  if (!extension) throw new Error("Unsupported service fee screenshot type.");
  const uploadPath = `service-fees/${workerId}/${paymentId}/payment-screenshot-${crypto.randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
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
          metadata: { workerId, paymentId }
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
