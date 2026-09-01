"use client";

import { AppModal } from "@/components/ui/AppModal";
import { Button } from "@/components/ui/Button";
import { jobCategoryOptions } from "@/lib/jobCategories";
import { saveWorkerSkill } from "@/services/worker-skills";
import type { WorkerSkillCategory, WorkerSkillLevel, WorkerSkillProofType, WorkerSkillProfile } from "@/types";
import { payPerUnitLabel } from "@/utils/direct-hire-pricing";
import { durationUnits, type DurationUnit } from "@/utils/duration";
import { unitsForCategory } from "@/utils/jobUnits";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

const suggestions: Record<WorkerSkillCategory, string[]> = {
  tools_software: ["Python", "Salesforce", "QuickBooks", "Excavator", "Industrial Sewing Machine", "Photoshop"],
  services_trades: ["Financial Auditing", "Copywriting", "Bricklaying", "House Cleaning", "Hair Braiding"],
  credentials_licenses: ["CPA", "Project Management Professional (PMP)", "Driver's License", "Food Handler's Permit", "Electrician License"]
};

export function AddSkillModal({ onClose, onSaved, skill }: { onClose: () => void; onSaved?: (skillProfiles: WorkerSkillProfile[] | null, savedSkill: WorkerSkillProfile) => void; skill?: WorkerSkillProfile | null }) {
  const [name, setName] = useState(skill?.name ?? "");
  const [category, setCategory] = useState<WorkerSkillCategory>(skill?.category ?? "services_trades");
  const [level, setLevel] = useState<WorkerSkillLevel>(skill?.level ?? "independent");
  const [proofType, setProofType] = useState<WorkerSkillProofType>(skill?.proofType ?? "reference");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [chargeCategory, setChargeCategory] = useState(skill?.chargeCategory ?? "");
  const [chargeUnit, setChargeUnit] = useState(skill?.chargeUnit ?? "");
  const [chargeCustomUnit, setChargeCustomUnit] = useState(skill?.chargeCustomUnit ?? "");
  const [chargePayType, setChargePayType] = useState<"fixed" | "timeline" | "unit">(skill?.chargePayType ?? "fixed");
  const [chargeTimelineUnit, setChargeTimelineUnit] = useState<DurationUnit>(skill?.chargeTimelineUnit ?? "hours");
  const [saving, setSaving] = useState(false);
  const unitOptions = useMemo(() => unitsForCategory(chargeCategory || name), [chargeCategory, name]);
  const unitPayLabel = payPerUnitLabel(chargeUnit, chargeCustomUnit);
  const filtered = useMemo(() => Object.entries(suggestions).flatMap(([group, items]) =>
    items.filter(item => !name || item.toLowerCase().includes(name.toLowerCase())).map(item => ({ group: group as WorkerSkillCategory, item }))
  ).slice(0, 8), [name]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fallbackSkill: WorkerSkillProfile = {
      id: skill?.id ?? crypto.randomUUID(),
      name,
      ...(description ? { description } : {}),
      category,
      level,
      proofType,
      verificationStatus: "pending",
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      completedJobs: skill?.completedJobs ?? 0,
      ratingAverage: skill?.ratingAverage ?? 0,
      ratingCount: skill?.ratingCount ?? 0,
      createdAt: skill?.createdAt ?? null,
      chargeAmount: Number(form.get("chargeAmount")),
      chargeCategory: chargeCategory || name,
      chargeQuantity: Number(form.get("chargeQuantity")) || null,
      chargeUnit: chargeUnit || null,
      chargeCustomUnit: chargeCustomUnit.trim() || null,
      chargeTimeline: Number(form.get("chargeTimeline")) || null,
      chargeTimelineUnit,
      chargePayType
    };
    setSaving(true);
    try {
      const skillProfiles = await saveWorkerSkill({
        id: fallbackSkill.id,
        name,
        description,
        category,
        level,
        proofType,
        licenseNumber: String(form.get("licenseNumber") ?? "").trim(),
        referencePhone: String(form.get("referencePhone") ?? "").trim(),
        proofFile: form.get("proofFile") instanceof File ? form.get("proofFile") as File : null,
        chargeAmount: Number(form.get("chargeAmount")),
        chargeCategory: chargeCategory || name,
        chargeQuantity: Number(form.get("chargeQuantity")) || null,
        chargeUnit,
        chargeCustomUnit: chargeCustomUnit.trim(),
        chargeTimeline: Number(form.get("chargeTimeline")) || null,
        chargeTimelineUnit,
        chargePayType
      });
      toast.success(skill ? "Skill updated and queued for verification." : "Skill added. Pending admin verification.");
      onSaved?.(skillProfiles, fallbackSkill);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save this skill.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal eyebrow="Worker profile" title={skill ? "Edit skill" : "Add a skill"} onClose={onClose}>
        <form onSubmit={submit} className="add-skill-form mt-6 grid gap-5">
          <label className="temp-label">Skill type
            <input value={name} onChange={event => setName(event.target.value)} required className="temp-input p-3 outline-none" placeholder="Start typing a skill" />
          </label>
          <label className="temp-label">Description optional
            <textarea value={description} onChange={event => setDescription(event.target.value)} className="temp-input min-h-24 p-3 outline-none" placeholder="Describe the work you do with this skill" />
          </label>
          {name && filtered.length > 0 && (
            <div className="grid gap-2 rounded-xl border border-[#4A463F] p-3">
              {filtered.map(({ group, item }) => <button type="button" key={`${group}-${item}`} onClick={() => { setName(item); setCategory(group); setChargeCategory(current => current || item); }} className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#2A2A2B]"><span className="font-black">{item}</span><span className="ml-2 text-xs text-[#959087]">{group.replaceAll("_", " & ")}</span></button>)}
            </div>
          )}
          <label className="temp-label">Skill category<select value={category} onChange={event => setCategory(event.target.value as WorkerSkillCategory)} className="temp-input p-3 outline-none"><option value="tools_software">Tools & Software</option><option value="services_trades">Services & Trades</option><option value="credentials_licenses">Credentials & Licenses</option></select></label>
          <label className="temp-label">Experience level<select value={level} onChange={event => setLevel(event.target.value as WorkerSkillLevel)} className="temp-input p-3 outline-none"><option value="beginner">Learning / Beginner - I need supervision</option><option value="independent">Independent / Intermediate - I work on my own</option><option value="expert">Expert / Advanced - I can teach or solve complex problems</option></select></label>
          <label className="temp-label">Proof of skill<select value={proofType} onChange={event => setProofType(event.target.value as WorkerSkillProofType)} className="temp-input p-3 outline-none"><option value="certificate">Certificate or degree</option><option value="license">Official license number</option><option value="reference">Past client or employer reference</option><option value="work_photo">Photo of past work</option></select></label>
          {proofType === "license" && <label className="temp-label">License number<input name="licenseNumber" required className="temp-input p-3 outline-none" /></label>}
          {proofType === "reference" && <label className="temp-label">Reference phone number<input name="referencePhone" required inputMode="tel" className="temp-input p-3 outline-none" placeholder="07XXXXXXXX" /></label>}
          {(proofType === "certificate" || proofType === "work_photo") && <label className="temp-label">Upload proof{skill?.proofUrl ? " optional" : ""}<input name="proofFile" required={!skill?.proofUrl} type="file" accept={proofType === "certificate" ? "image/*,application/pdf" : "image/*"} className="temp-input p-3" /></label>}
          <div className="add-skill-charge rounded-2xl bg-[#2A2A2B] p-4">
            <p className="text-sm font-black text-[#FFFBFF]">Charge</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="temp-label">How much do you charge?<input name="chargeAmount" required type="number" min={1} defaultValue={skill?.chargeAmount ?? ""} placeholder="KES" className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Category<select value={chargeCategory} onChange={event => setChargeCategory(event.target.value)} required className="temp-input p-3 outline-none"><option value="">Select category</option>{jobCategoryOptions.map((option, index) => <option key={`${option}-${index}`} value={option}>{option}</option>)}</select></label>
              <label className="temp-label">Quantity optional<input name="chargeQuantity" type="number" min={1} defaultValue={skill?.chargeQuantity ?? ""} placeholder="e.g. 1" className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">{chargePayType === "unit" ? "Unit" : "Unit optional"}<select value={chargeUnit ?? ""} onChange={event => setChargeUnit(event.target.value)} required={chargePayType === "unit"} className="temp-input p-3 outline-none"><option value="">No unit</option>{unitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
              {chargeUnit === "Other" && <label className="temp-label sm:col-span-2">Custom unit<input name="chargeCustomUnit" value={chargeCustomUnit} onChange={event => setChargeCustomUnit(event.target.value)} placeholder="e.g. laundry rack, parcel, acre" className="temp-input p-3 outline-none" /></label>}
              <label className="temp-label">Work timeline<input name="chargeTimeline" type="number" min={1} defaultValue={skill?.chargeTimeline ?? ""} placeholder="Work timeline" className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Timeline unit<select value={chargeTimelineUnit} onChange={event => setChargeTimelineUnit(event.target.value as DurationUnit)} className="temp-input p-3 outline-none">{durationUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
              <label className="temp-label sm:col-span-2">Pay type<select value={chargePayType} onChange={event => setChargePayType(event.target.value as "fixed" | "timeline" | "unit")} className="temp-input p-3 outline-none"><option value="fixed">Fixed pay</option><option value="unit">{unitPayLabel}</option><option value="timeline">Timeline pay</option></select></label>
              {chargePayType === "unit" && <p className="rounded-xl border border-[#d8d8d8] bg-white p-3 text-sm font-black text-[#111] dark:border-[#4A463F] dark:bg-[#1F1F20] dark:text-[#FFFBFF] sm:col-span-2">{unitPayLabel}</p>}
            </div>
          </div>
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : skill ? "Save skill" : "Add skill"}</Button>
        </form>
    </AppModal>
  );
}
