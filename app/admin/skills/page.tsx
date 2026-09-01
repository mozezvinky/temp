"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import type { WorkerSkillProfile, WorkerSkillVerificationStatus } from "@/types";
import { perUnitText } from "@/utils/direct-hire-pricing";
import { kes } from "@/utils/money";
import { skillVerificationLabel } from "@/utils/worker-skills";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type AdminSkill = WorkerSkillProfile & {
  workerId: string;
  workerName: string;
  workerEmail?: string;
};

const filters: Array<WorkerSkillVerificationStatus | "all"> = ["pending", "approved", "rejected", "all"];

export default function AdminSkillsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<WorkerSkillVerificationStatus | "all">("pending");
  const [skills, setSkills] = useState<AdminSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState("");
  const [editing, setEditing] = useState<AdminSkill | null>(null);
  const [removing, setRemoving] = useState("");
  const [error, setError] = useState("");

  const loadSkills = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/skills?status=${filter}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load skills.");
      setSkills(Array.isArray(payload.skills) ? payload.skills : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load skills.");
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [filter, user]);

  useEffect(() => {
    if (!user) return;
    void loadSkills();
  }, [loadSkills, user]);

  async function reviewSkill(skill: AdminSkill, action: "approve" | "reject") {
    if (!user) return;
    const reason = action === "reject" ? window.prompt("Reason for rejection?")?.trim() ?? "" : "";
    if (action === "reject" && !reason) return;
    setReviewing(`${skill.workerId}:${skill.id}:${action}`);
    try {
      const response = await fetch("/api/admin/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken(true)}` },
        body: JSON.stringify({ userId: skill.workerId, skillId: skill.id, action, reason })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to review skill.");
      toast.success(action === "approve" ? "Skill approved." : "Skill rejected.");
      await loadSkills();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to review skill.");
    } finally {
      setReviewing("");
    }
  }

  async function saveSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !editing) return;
    const form = new FormData(event.currentTarget);
    const approveAfterSave = form.get("adminAction") === "approve";
    setReviewing(`${editing.workerId}:${editing.id}:update`);
    try {
      const response = await fetch("/api/admin/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken(true)}` },
        body: JSON.stringify({
          userId: editing.workerId,
          skillId: editing.id,
          action: "update",
          name: form.get("name"),
          description: form.get("description"),
          category: form.get("category"),
          level: form.get("level"),
          proofType: form.get("proofType"),
          chargeAmount: form.get("chargeAmount"),
          chargeCategory: form.get("chargeCategory"),
          chargePayType: form.get("chargePayType"),
          chargeUnit: form.get("chargeUnit"),
          chargeCustomUnit: form.get("chargeCustomUnit")
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to update skill.");
      if (approveAfterSave) await reviewSkill(editing, "approve");
      toast.success(approveAfterSave ? "Skill updated and approved." : "Skill updated.");
      setEditing(null);
      await loadSkills();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to update skill.");
    } finally {
      setReviewing("");
    }
  }

  async function removeSkill(skill: AdminSkill) {
    if (!user) return;
    const confirmed = window.confirm(`Remove ${skill.name} from ${skill.workerName}?`);
    if (!confirmed) return;
    setRemoving(`${skill.workerId}:${skill.id}`);
    try {
      const response = await fetch("/api/admin/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken(true)}` },
        body: JSON.stringify({ userId: skill.workerId, skillId: skill.id, action: "remove" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to remove skill.");
      toast.success("Skill removed.");
      await loadSkills();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to remove skill.");
    } finally {
      setRemoving("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Verification</p>
          <h1 className="mt-2 text-3xl font-black text-[#FFFBFF]">Skills</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map(item => (
            <button key={item} type="button" onClick={() => setFilter(item)} className={`design-chip px-3 py-2 text-sm font-black capitalize ${filter === item ? "bg-bone text-[#1E1B13]" : ""}`}>
              {item === "all" ? "All" : skillVerificationLabel(item)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
      {loading ? <LoadingSpinner label="Loading skills" /> : (
        <div className="grid gap-4">
          {skills.length ? skills.map(skill => (
            <Card key={`${skill.workerId}-${skill.id}`} className="grid gap-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.18em] text-[#959087]">{skillVerificationLabel(skill.verificationStatus)}</p>
                  <h2 className="mt-1 text-xl font-black text-[#FFFBFF]">{skill.name}</h2>
                  <p className="mt-1 text-sm font-bold text-[#CCC6BB]">{formatSkillMeta(skill)}</p>
                </div>
                <div className="text-right text-sm text-[#CCC6BB]">
                  <p className="font-black text-[#FFFBFF]">{skill.workerName}</p>
                  {skill.workerEmail && <p>{skill.workerEmail}</p>}
                </div>
              </div>
              {skill.description && <p className="text-sm text-[#CCC6BB]">{skill.description}</p>}
              <div className="grid gap-3 text-sm md:grid-cols-4">
                <Info label="Proof" value={skill.proofType.replaceAll("_", " ")} />
                <Info label="Submitted" value={formatDate(skill.submittedAt ?? skill.createdAt)} />
                <Info label="Rate" value={skill.chargeAmount ? skillRate(skill) : "Rate not set"} />
                <Info label="Completed" value={`${skill.completedJobs ?? 0} jobs`} />
              </div>
              {skill.rejectionReason && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm font-bold text-red-200">{skill.rejectionReason}</p>}
              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="secondary" disabled={!!reviewing || !!removing} onClick={() => setEditing(skill)}>Edit</Button>
                <Button type="button" variant="secondary" disabled={!!reviewing || !!removing} onClick={() => void removeSkill(skill)}>{removing === `${skill.workerId}:${skill.id}` ? "Removing..." : "Remove"}</Button>
                <Button type="button" variant="secondary" disabled={!!reviewing || skill.verificationStatus === "rejected"} onClick={() => void reviewSkill(skill, "reject")}>{reviewing === `${skill.workerId}:${skill.id}:reject` ? "Rejecting..." : "Reject"}</Button>
                <Button type="button" className="temp-success-button" disabled={!!reviewing || skill.verificationStatus === "approved"} onClick={() => void reviewSkill(skill, "approve")}>{reviewing === `${skill.workerId}:${skill.id}:approve` ? "Approving..." : "Approve"}</Button>
              </div>
            </Card>
          )) : (
            <Card className="p-8 text-center">
              <h2 className="text-xl font-black text-[#FFFBFF]">No skills found</h2>
              <p className="mt-2 text-sm text-[#CCC6BB]">Skills matching this filter will appear here.</p>
            </Card>
          )}
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <form onSubmit={event => void saveSkill(event)} className="grid max-h-[90vh] w-full max-w-2xl gap-4 overflow-y-auto rounded-2xl border border-[#4A463F] bg-[#1E1B13] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#959087]">Edit worker skill</p>
                <h2 className="mt-1 text-2xl font-black text-[#FFFBFF]">{editing.workerName}</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-[#4A463F] px-3 py-1 text-sm font-black text-[#FFFBFF]" aria-label="Close skill editor">×</button>
            </div>
            <label className="temp-label">Skill name<input name="name" defaultValue={editing.name} required className="temp-input p-3 outline-none" /></label>
            <label className="temp-label">Description<textarea name="description" defaultValue={editing.description ?? ""} className="temp-input min-h-24 p-3 outline-none" /></label>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="temp-label">Category<select name="category" defaultValue={editing.category ?? "services_trades"} className="temp-input p-3 outline-none"><option value="services_trades">Services & trades</option><option value="tools_software">Tools & software</option><option value="credentials_licenses">Credentials & licenses</option></select></label>
              <label className="temp-label">Level<select name="level" defaultValue={editing.level ?? "independent"} className="temp-input p-3 outline-none"><option value="beginner">Beginner</option><option value="independent">Independent</option><option value="expert">Expert</option></select></label>
              <label className="temp-label">Proof<select name="proofType" defaultValue={editing.proofType ?? "reference"} className="temp-input p-3 outline-none"><option value="reference">Reference</option><option value="certificate">Certificate</option><option value="license">License</option><option value="work_photo">Work photo</option></select></label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="temp-label">Rate<input name="chargeAmount" type="number" min={50} defaultValue={editing.chargeAmount ?? ""} required className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Rate label<input name="chargeCategory" defaultValue={editing.chargeCategory ?? editing.name} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Pay type<select name="chargePayType" defaultValue={editing.chargePayType ?? "fixed"} className="temp-input p-3 outline-none"><option value="fixed">Fixed</option><option value="unit">Per unit</option><option value="timeline">Per timeline</option></select></label>
              <label className="temp-label">Unit<input name="chargeUnit" defaultValue={editing.chargeUnit ?? ""} placeholder="hour, item, room" className="temp-input p-3 outline-none" /></label>
              <label className="temp-label md:col-span-2">Custom unit<input name="chargeCustomUnit" defaultValue={editing.chargeCustomUnit ?? ""} className="temp-input p-3 outline-none" /></label>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" name="adminAction" value="save" variant="secondary" disabled={reviewing === `${editing.workerId}:${editing.id}:update`}>{reviewing === `${editing.workerId}:${editing.id}:update` ? "Saving..." : "Save"}</Button>
              <Button type="submit" name="adminAction" value="approve" className="temp-success-button" disabled={!!reviewing}>Save & approve</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-3"><p className="text-xs text-[#959087]">{label}</p><p className="mt-1 font-black text-[#FFFBFF]">{value}</p></div>;
}

function formatDate(value: unknown) {
  if (typeof value === "string") return new Date(value).toLocaleDateString();
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate().toLocaleDateString();
  return "Not recorded";
}

function formatSkillMeta(skill: WorkerSkillProfile) {
  const category = String(skill.category ?? "services_trades").replaceAll("_", " & ");
  const level = String(skill.level ?? "independent");
  return `${category} · ${level}`;
}

function skillRate(skill: WorkerSkillProfile) {
  const amount = kes(Number(skill.chargeAmount ?? 0));
  if (skill.chargePayType === "unit") {
    return `${amount} ${perUnitText(skill)}`;
  }
  if (skill.chargePayType === "timeline") return `${amount} per timeline`;
  return amount;
}
