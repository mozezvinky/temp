import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { deleteLocalWorkerSkill, getLocalUser, saveLocalWorkerSkill } from "@/lib/local-sql";
import type { WorkerSkillCategory, WorkerSkillLevel, WorkerSkillProfile, WorkerSkillProofType } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const categories: WorkerSkillCategory[] = ["tools_software", "services_trades", "credentials_licenses"];
const levels: WorkerSkillLevel[] = ["beginner", "independent", "expert"];
const proofTypes: WorkerSkillProofType[] = ["certificate", "license", "reference", "work_photo"];

function removeUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => removeUndefinedFields(item)) as T;
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, removeUndefinedFields(entry)])
  ) as T;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const decoded = await adminAuth().verifyIdToken(token);

    if (isSqlBackend()) {
      const profile = getLocalUser(decoded.uid);
      if (!profile || profile.role !== "worker") return NextResponse.json({ error: "Worker access required." }, { status: 403 });
      return NextResponse.json({ skillProfiles: profile.skillProfiles ?? [] });
    }

    const snapshot = await adminDb().collection("users").doc(decoded.uid).get();
    if (!snapshot.exists || snapshot.data()?.role !== "worker") return NextResponse.json({ error: "Worker access required." }, { status: 403 });
    const skillProfiles = Array.isArray(snapshot.data()?.skillProfiles) ? snapshot.data()!.skillProfiles as WorkerSkillProfile[] : [];
    return NextResponse.json({ skillProfiles: removeUndefinedFields(skillProfiles) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load skills.";
    return NextResponse.json({ error: message }, { status: message.includes("access") ? 403 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const decoded = await adminAuth().verifyIdToken(token);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const category = String(body.category ?? "") as WorkerSkillCategory;
    const level = String(body.level ?? "") as WorkerSkillLevel;
    const proofType = String(body.proofType ?? "") as WorkerSkillProofType;
    const licenseNumber = String(body.licenseNumber ?? "").trim();
    const referencePhone = String(body.referencePhone ?? "").trim();
    const proofUrl = String(body.proofUrl ?? "").trim();
    const description = String(body.description ?? "").trim();
    const chargeAmount = Number(body.chargeAmount);
    const chargeQuantity = Number(body.chargeQuantity);
    const chargeTimeline = Number(body.chargeTimeline);
    const chargeTimelineUnit = String(body.chargeTimelineUnit ?? "hours");
    const chargePayType = String(body.chargePayType ?? "fixed");

    if (!name) return NextResponse.json({ error: "Enter a skill." }, { status: 400 });
    if (!categories.includes(category) || !levels.includes(level) || !proofTypes.includes(proofType)) {
      return NextResponse.json({ error: "Complete the skill details." }, { status: 400 });
    }
    if (proofType === "license" && !licenseNumber) return NextResponse.json({ error: "Enter the official license number." }, { status: 400 });
    if (proofType === "reference" && !referencePhone) return NextResponse.json({ error: "Enter a past client or employer phone number." }, { status: 400 });
    if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) return NextResponse.json({ error: "Enter what you charge for this skill." }, { status: 400 });

    const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : crypto.randomUUID();
    const skill: WorkerSkillProfile = {
      id,
      name,
      ...(description ? { description } : {}),
      category,
      level,
      proofType,
      ...(licenseNumber ? { licenseNumber } : {}),
      ...(referencePhone ? { referencePhone } : {}),
      ...(proofUrl ? { proofUrl } : {}),
      chargeAmount,
      chargeCategory: String(body.chargeCategory ?? name).trim() || name,
      chargeQuantity: Number.isFinite(chargeQuantity) && chargeQuantity > 0 ? chargeQuantity : null,
      chargeUnit: typeof body.chargeUnit === "string" ? body.chargeUnit.trim() || null : null,
      chargeCustomUnit: typeof body.chargeCustomUnit === "string" ? body.chargeCustomUnit.trim() || null : null,
      chargeTimeline: Number.isFinite(chargeTimeline) && chargeTimeline > 0 ? chargeTimeline : null,
      chargeTimelineUnit: ["minutes", "hours", "days", "weeks", "months"].includes(chargeTimelineUnit) ? chargeTimelineUnit as WorkerSkillProfile["chargeTimelineUnit"] : "hours",
      chargePayType: chargePayType === "timeline" ? "timeline" : "fixed",
      completedJobs: 0,
      ratingAverage: 0,
      ratingCount: 0,
      createdAt: null
    };

    if (isSqlBackend()) {
      if (getLocalUser(decoded.uid)?.role !== "worker") return NextResponse.json({ error: "Worker access required." }, { status: 403 });
      const existingSkill = (getLocalUser(decoded.uid)?.skillProfiles ?? []).find(item => item.id === id || item.name.toLowerCase() === name.toLowerCase());
      const skillProfiles = saveLocalWorkerSkill(decoded.uid, {
        ...existingSkill,
        ...skill,
        proofUrl: proofUrl || existingSkill?.proofUrl,
        completedJobs: existingSkill?.completedJobs ?? skill.completedJobs,
        ratingAverage: existingSkill?.ratingAverage ?? skill.ratingAverage,
        ratingCount: existingSkill?.ratingCount ?? skill.ratingCount,
        createdAt: existingSkill?.createdAt ?? skill.createdAt
      });
      return NextResponse.json({ success: true, skillProfiles });
    }

    const ref = adminDb().collection("users").doc(decoded.uid);
    let savedSkillProfiles: WorkerSkillProfile[] = [];
    await adminDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.role !== "worker") throw new Error("Worker access required.");
      const existing = Array.isArray(snapshot.data()?.skillProfiles) ? snapshot.data()!.skillProfiles as WorkerSkillProfile[] : [];
      const existingSkill = existing.find(item => item.id === skill.id || item.name.toLowerCase() === name.toLowerCase());
      const mergedProofUrl = proofUrl || existingSkill?.proofUrl;
      const mergedSkill = {
        ...existingSkill,
        ...skill,
        ...(mergedProofUrl ? { proofUrl: mergedProofUrl } : {}),
        completedJobs: existingSkill?.completedJobs ?? skill.completedJobs,
        ratingAverage: existingSkill?.ratingAverage ?? skill.ratingAverage,
        ratingCount: existingSkill?.ratingCount ?? skill.ratingCount,
        createdAt: existingSkill?.createdAt ?? skill.createdAt
      };
      const next = removeUndefinedFields([...existing.filter(item => item.id !== skill.id && item.name.toLowerCase() !== name.toLowerCase()), mergedSkill]);
      savedSkillProfiles = next;
      transaction.update(ref, {
        skillProfiles: next,
        skills: Array.from(new Set(next.map(item => item.name))),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    return NextResponse.json({ success: true, skillProfiles: savedSkillProfiles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save this skill.";
    return NextResponse.json({ error: message }, { status: message.includes("access") ? 403 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const decoded = await adminAuth().verifyIdToken(token);
    const skillId = request.nextUrl.searchParams.get("id") ?? "";
    if (!skillId) return NextResponse.json({ error: "Choose a skill to delete." }, { status: 400 });

    if (isSqlBackend()) {
      if (getLocalUser(decoded.uid)?.role !== "worker") return NextResponse.json({ error: "Worker access required." }, { status: 403 });
      const skillProfiles = deleteLocalWorkerSkill(decoded.uid, skillId);
      return NextResponse.json({ success: true, skillProfiles });
    }

    const ref = adminDb().collection("users").doc(decoded.uid);
    let savedSkillProfiles: WorkerSkillProfile[] = [];
    await adminDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.role !== "worker") throw new Error("Worker access required.");
      const existing = Array.isArray(snapshot.data()?.skillProfiles) ? snapshot.data()!.skillProfiles as WorkerSkillProfile[] : [];
      const next = existing.filter(item => item.id !== skillId);
      savedSkillProfiles = next;
      transaction.update(ref, {
        skillProfiles: next,
        skills: Array.from(new Set(next.map(item => item.name))),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
    return NextResponse.json({ success: true, skillProfiles: savedSkillProfiles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete this skill.";
    return NextResponse.json({ error: message }, { status: message.includes("access") ? 403 : 500 });
  }
}
