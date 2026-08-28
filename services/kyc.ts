"use client";

import { requireAuth } from "@/lib/firebase";
import type { VerificationKind, VerificationRecord } from "@/types";

export interface VerificationSubmission {
  userId: string;
  role: "client" | "worker";
  kind?: VerificationKind;
  fullName: string;
  phoneNumber: string;
  nationalId: string;
  idFrontFile: File;
  idBackFile: File;
  selfieWithIdFile: File;
}

const ALLOWED_VERIFICATION_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validateUpload(file: File) {
  if (file.size > 8 * 1024 * 1024 || !ALLOWED_VERIFICATION_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Each verification upload must be a JPEG, PNG, or WebP image under 8 MB.");
  }
}

export async function submitVerification(input: VerificationSubmission, onProgress?: (field: "idFront" | "idBack" | "selfieWithId", progress: number) => void) {
  validateUpload(input.idFrontFile);
  validateUpload(input.idBackFile);
  validateUpload(input.selfieWithIdFile);
  const user = requireAuth().currentUser;
  if (!user || user.uid !== input.userId) throw new Error("Please sign in before submitting verification.");
  const token = await user.getIdToken();

  const form = new FormData();
  form.set("kind", input.kind ?? "identity");
  form.set("fullName", input.fullName);
  form.set("phoneNumber", input.phoneNumber);
  form.set("nationalId", input.nationalId);
  form.set("idFront", input.idFrontFile);
  form.set("idBack", input.idBackFile);
  form.set("selfieWithId", input.selfieWithIdFile);

  const setAllProgress = (value: number) => {
    onProgress?.("idFront", value);
    onProgress?.("idBack", value);
    onProgress?.("selfieWithId", value);
  };
  setAllProgress(1);

  return new Promise<{ success?: boolean; message?: string; error?: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/kyc/start");
    xhr.timeout = 120000;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      setAllProgress(Math.min(95, Math.max(5, Math.round((event.loaded / event.total) * 95))));
    };
    xhr.onload = () => {
      let result: { success?: boolean; message?: string; error?: string };
      try {
        result = JSON.parse(xhr.responseText || "{}") as { success?: boolean; message?: string; error?: string };
      } catch {
        reject(new Error("Upload failed. Please try again."));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300 || !result.success) {
        reject(new Error(result.error ?? "Unable to submit verification right now."));
        return;
      }
      setAllProgress(100);
      resolve(result);
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("Upload took too long. Try smaller images or a stronger connection."));
    xhr.send(form);
  });
}

export async function loadMyVerification(kind: VerificationKind = "identity") {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before loading verification.");
  const response = await fetch(`/api/kyc/start?kind=${kind}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
  const result = await response.json().catch(() => ({})) as { verification?: VerificationRecord | null; error?: string };
  if (!response.ok) throw new Error(result.error ?? "Unable to load verification.");
  return result.verification ?? null;
}
