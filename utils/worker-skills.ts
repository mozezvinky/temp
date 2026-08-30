import type { WorkerSkillProfile, WorkerSkillVerificationStatus } from "@/types";

export function normalizeSkillVerificationStatus(value: unknown): WorkerSkillVerificationStatus {
  return value === "pending" || value === "rejected" || value === "approved" ? value : "approved";
}

export function isApprovedSkill(skill: WorkerSkillProfile) {
  return normalizeSkillVerificationStatus(skill.verificationStatus) === "approved";
}

export function approvedSkillProfiles(skills: WorkerSkillProfile[] | undefined | null) {
  return (skills ?? []).filter(isApprovedSkill);
}

export function approvedSkillNames(skills: WorkerSkillProfile[] | undefined | null) {
  return Array.from(new Set(approvedSkillProfiles(skills).map(skill => skill.name)));
}

export function skillVerificationLabel(value: unknown) {
  const status = normalizeSkillVerificationStatus(value);
  if (status === "pending") return "Pending verification";
  if (status === "rejected") return "Not approved";
  return "Verified";
}
