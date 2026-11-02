import { normalizeSkillVerificationStatus } from "@/utils/worker-skills";
import { validateServiceMedia } from "@/lib/service-media-validation";
import { sectorForSkill } from "@/utils/service-catalogue";
import { NextRequest, NextResponse } from "next/server";
import { verifyVerifiedIdToken } from "@/lib/verified-auth";
import { adminDb } from "@/lib/firebase-admin";
import { isSqlBackend } from "@/lib/data-backend";
import { getLocalUser, saveLocalWorkerSkill } from "@/lib/local-sql";
import { catalogueSchema, serviceSectors } from "@/utils/service-catalogue";
import type { WorkerSkillProfile } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const user = await verifyVerifiedIdToken(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
    const body = await request.json();
    const change = (profile: { role?: string; roles?: string[]; isLocked?: boolean; skillProfiles?: WorkerSkillProfile[] }) => {
      if ((profile.role !== "worker" && !profile.roles?.includes("worker")) || profile.isLocked) throw new Error("Worker access required.");
      const skills = profile.skillProfiles ?? [];
      const skill = skills.find(item => item.id === body.skillId);
      if (!skill || normalizeSkillVerificationStatus(skill.verificationStatus) !== "approved") throw new Error("Choose an existing approved skill.");
      const existing = skill.catalogue ?? [];
      if (body.action === "delete") return { ...skill, catalogue: existing.filter(item => item.id !== body.id) };
      const parsed = catalogueSchema.parse(body.entry);
      if (serviceSectors.find(item => item.name === parsed.sector)?.certificate && (skill.proofType !== "certificate" || !skill.proofUrl)) throw new Error("Upload a certificate through Edit skill and have it approved first.");
      const parentSector = sectorForSkill(skill.name);
      if (parentSector && parsed.sector !== parentSector.name) throw new Error("Choose the sector matching this skill.");
      const old = existing.find(item => item.id === parsed.id);
      if (!old && existing.length >= 50) throw new Error("A skill supports up to 50 catalogue entries.");
      const now = new Date().toISOString();
      const entry = { ...parsed, createdAt: old?.createdAt ?? now, updatedAt: now };
      return { ...skill, catalogue: [...existing.filter(item => item.id !== entry.id), entry] };
    };
    if (isSqlBackend()) {
      const profile = getLocalUser(user.uid);
      if (!profile) throw new Error("Worker access required.");
      const next = change(profile);
      await validateServiceMedia((next.catalogue ?? []).flatMap(item => [...item.images, ...item.addons.flatMap(extra => extra.image ? [extra.image] : [])]), user.uid, "catalogue");
      return NextResponse.json({ skillProfiles: saveLocalWorkerSkill(user.uid, next) });
    }
    const ref = adminDb().doc(`users/${user.uid}`);
    const skills = await adminDb().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Worker access required.");
      const profile = snap.data()!;
      const next = change(profile);
      // Uploaded assets must belong to this worker; reusing their existing assets is allowed.
      const urls = (next.catalogue ?? []).flatMap(item => [...item.images, ...item.addons.flatMap(extra => extra.image ? [extra.image] : [])]);
      for (const url of new Set(urls)) {
        const id = new URL(url, "https://copic.co.ke").searchParams.get("id");
        const media = await tx.get(adminDb().doc(`serviceMedia/${id}`));
        if (!media.exists || media.data()?.ownerId !== user.uid || media.data()?.kind !== "catalogue") throw new Error("Use your own uploaded catalogue images.");
      }
      const result = (profile.skillProfiles as WorkerSkillProfile[]).map(item => item.id === next.id ? next : item);
      if (Buffer.byteLength(JSON.stringify(result)) > 750000) throw new Error("Your portfolio is too large. Shorten descriptions or remove unused entries.");
      tx.update(ref, { skillProfiles: result, updatedAt: new Date().toISOString() });
      return result;
    });
    return NextResponse.json({ skillProfiles: skills });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save catalogue." }, { status: 400 });
  }
}
