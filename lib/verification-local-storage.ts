import "server-only";

import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

export function shouldUseLocalVerificationStorage() {
  return process.env.VERIFICATION_UPLOAD_DRIVER === "local" ||
    (process.env.NODE_ENV !== "production" && process.env.USE_LOCAL_VERIFICATION_UPLOADS !== "false");
}

function safeUploadPath(uploadPath: string) {
  if (!uploadPath.startsWith("verification/") || uploadPath.includes("..")) {
    throw new Error("Invalid verification upload path.");
  }
  return path.join(LOCAL_UPLOAD_ROOT, uploadPath);
}

export async function saveLocalVerificationUpload(uploadPath: string, buffer: Buffer) {
  const target = safeUploadPath(uploadPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
}

export async function localVerificationUploadExists(uploadPath: string) {
  try {
    await access(safeUploadPath(uploadPath));
    return true;
  } catch {
    return false;
  }
}

export async function localVerificationUploadUrl(uploadPath: string) {
  return await localVerificationUploadExists(uploadPath)
    ? `/uploads/${uploadPath}`
    : "";
}
