"use client";

import { requireAuth, requireStorage } from "@/lib/firebase";
import type { WorkerSkillCategory, WorkerSkillLevel, WorkerSkillProofType, WorkerSkillProfile } from "@/types";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

export type WorkerSkillInput = {
  id?: string;
  name: string;
  description?: string;
  category: WorkerSkillCategory;
  level: WorkerSkillLevel;
  proofType: WorkerSkillProofType;
  licenseNumber?: string;
  referencePhone?: string;
  proofFile?: File | null;
  chargeAmount?: number;
  chargeCategory?: string;
  chargeQuantity?: number | null;
  chargeUnit?: string | null;
  chargeCustomUnit?: string | null;
  chargeTimeline?: number | null;
  chargeTimelineUnit?: "minutes" | "hours" | "days" | "weeks" | "months";
  chargePayType?: "fixed" | "timeline" | "unit";
};

export async function loadWorkerSkills() {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before loading skills.");
  const response = await fetch("/api/profile/skills", {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: "no-store",
    credentials: "same-origin"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Unable to load skills.");
  return Array.isArray(result.skillProfiles) ? result.skillProfiles as WorkerSkillProfile[] : [];
}

export async function saveWorkerSkill(input: WorkerSkillInput) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before adding a skill.");
  let proofUrl = "";
  if (input.proofFile) {
    const safeName = input.proofFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storageRef = ref(requireStorage(), `skills/${user.uid}/${crypto.randomUUID()}-${safeName}`);
    await uploadBytes(storageRef, input.proofFile);
    proofUrl = await getDownloadURL(storageRef);
  }
  const response = await fetch("/api/profile/skills", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ ...input, proofFile: undefined, proofUrl })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Unable to save this skill.");
  return Array.isArray(result.skillProfiles) ? result.skillProfiles as WorkerSkillProfile[] : null;
}

export async function deleteWorkerSkill(skillId: string) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in before deleting a skill.");
  const response = await fetch(`/api/profile/skills?id=${encodeURIComponent(skillId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${await user.getIdToken()}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Unable to delete this skill.");
  return Array.isArray(result.skillProfiles) ? result.skillProfiles as WorkerSkillProfile[] : null;
}
