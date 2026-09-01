"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import type { WorkerSkillProfile, WorkerSkillVerificationStatus } from "@/types";
import { perUnitText } from "@/utils/direct-hire-pricing";
import { kes } from "@/utils/money";
import { skillVerificationLabel } from "@/utils/worker-skills";
import { useCallback, useEffect, useState } from "react";
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
                  <p className="mt-1 text-sm font-bold text-[#CCC6BB]">{skill.category.replaceAll("_", " & ")} · {skill.level}</p>
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

function skillRate(skill: WorkerSkillProfile) {
  const amount = kes(Number(skill.chargeAmount ?? 0));
  if (skill.chargePayType === "unit") {
    return `${amount} ${perUnitText(skill)}`;
  }
  if (skill.chargePayType === "timeline") return `${amount} per timeline`;
  return amount;
}
