"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { defaultKenyaLocation } from "@/lib/location";
import { jobCategoryOptions } from "@/lib/jobCategories";
import { createJob } from "@/services/jobs";
import type { LocationFields, UserProfile } from "@/types";
import { matchJobCategory } from "@/utils/jobCategoryMatcher";
import { durationLabel, durationToHours, durationUnits, perDurationUnit, type DurationUnit } from "@/utils/duration";
import { displayJobQuantity, unitsForCategory } from "@/utils/jobUnits";
import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

const MapPicker = dynamic(() => import("@/components/location/MapPicker"), { ssr: false });

type Draft = {
  title: string;
  description: string;
  budget: string;
  timeline: string;
  workersNeeded: string;
  quantity: string;
  unit: string;
  customUnit: string;
  category: string;
  timelineUnit: DurationUnit;
  payType: "fixed" | "pay_per_timeline";
};

const emptyDraft: Draft = { title: "", description: "", budget: "", timeline: "", timelineUnit: "hours", workersNeeded: "1", quantity: "", unit: "", customUnit: "", category: "", payType: "fixed" };

export function PostWorkWizard({ profile, onClose, onPosted }: { profile: UserProfile; onClose: () => void; onPosted?: () => void }) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [location, setLocation] = useState<LocationFields>(defaultKenyaLocation);
  const [posting, setPosting] = useState(false);
  const unitOptions = useMemo(() => unitsForCategory(draft.category), [draft.category]);

  function setValue<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function nextFromTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep(2);
  }

  function nextFromDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep(3);
  }

  async function post() {
    setPosting(true);
    try {
      const durationValue = Number(draft.timeline);
      const timelineCount = Math.max(1, Math.trunc(durationValue || 1));
      const duration = durationLabel(durationValue, draft.timelineUnit);
      await createJob(profile.id, {
        title: draft.title,
        description: draft.description,
        category: draft.category,
        duration,
        durationValue,
        durationUnit: draft.timelineUnit,
        durationHours: durationToHours(durationValue, draft.timelineUnit),
        payType: draft.payType,
        payAmount: draft.budget,
        timelineCount: draft.payType === "pay_per_timeline" ? timelineCount : undefined,
        clientPayPerTimeline: draft.payType === "pay_per_timeline" ? draft.budget : undefined,
        workersNeeded: draft.workersNeeded,
        quantity: draft.quantity || undefined,
        unit: draft.unit || undefined,
        customUnit: draft.unit === "Other" ? draft.customUnit : undefined,
        location: location.addressText,
        county: location.county,
        locationDetails: location,
        requiredSkills: []
      });
      toast.success("Work posted and matching workers alerted.");
      onPosted?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to post work right now.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="temp-modal-backdrop fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/70 p-4">
      <Card role="dialog" aria-modal="true" className="no-visible-scrollbar max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Post work · Step {step} of 3</p>
            <h2 className="mt-2 text-2xl font-black text-[#FFFBFF]">{step === 1 ? "What work do you need?" : step === 2 ? "Set the job details" : "Choose the job location"}</h2>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        </div>

        {step === 1 && (
          <form onSubmit={nextFromTitle} className="popup-form mt-6 grid gap-4">
            <label className="temp-label">Job title<input autoFocus value={draft.title} onChange={event => {
              const title = event.target.value;
              setDraft(current => ({ ...current, title, category: matchJobCategory(title) }));
            }} required placeholder="e.g. House cleaner" className="temp-input p-3 outline-none" /></label>
            <label className="temp-label">Description<textarea value={draft.description} onChange={event => setValue("description", event.target.value)} required placeholder="Describe the work and required skills" className="temp-input min-h-32 p-3 outline-none" /></label>
            <Button type="submit">Next</Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={nextFromDetails} className="popup-form mt-6 grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="temp-label">{draft.payType === "pay_per_timeline" ? `Client pay per ${perDurationUnit(draft.timelineUnit)}` : "Budget"}<input value={draft.budget} onChange={event => setValue("budget", event.target.value)} required type="number" min={draft.payType === "pay_per_timeline" ? 101 : 50} placeholder="KES" className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Work timeline<div className="grid grid-cols-[1fr_auto] gap-2"><input value={draft.timeline} onChange={event => setValue("timeline", event.target.value)} required type="number" min={1} placeholder="Work timeline" className="temp-input min-w-0 p-3 outline-none" /><select value={draft.timelineUnit} onChange={event => setValue("timelineUnit", event.target.value as DurationUnit)} className="temp-input p-3 outline-none">{durationUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></div></label>
              <label className="temp-label">Workers needed<input value={draft.workersNeeded} onChange={event => setValue("workersNeeded", event.target.value)} required type="number" min={1} max={100} className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Category<select value={draft.category} onChange={event => setValue("category", event.target.value)} required className="temp-input p-3 outline-none"><option value="">Select category</option>{jobCategoryOptions.map((option, index) => <option key={`${option}-${index}`} value={option}>{option}</option>)}</select></label>
              <label className="temp-label">Quantity optional<input value={draft.quantity} onChange={event => setValue("quantity", event.target.value)} type="number" min={1} placeholder="e.g. 12" className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Unit optional<select value={draft.unit} onChange={event => setValue("unit", event.target.value)} className="temp-input p-3 outline-none"><option value="">No unit</option>{unitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
              {draft.unit === "Other" && <label className="temp-label sm:col-span-2">Custom unit<input value={draft.customUnit} onChange={event => setValue("customUnit", event.target.value)} placeholder="e.g. Flower Beds" className="temp-input p-3 outline-none" /></label>}
              <label className="temp-label sm:col-span-2">Pay type<select value={draft.payType} onChange={event => setValue("payType", event.target.value as Draft["payType"])} className="temp-input p-3 outline-none"><option value="fixed">Fixed pay</option><option value="pay_per_timeline">Pay per {perDurationUnit(draft.timelineUnit)}</option></select></label>
            </div>
            {draft.payType === "pay_per_timeline" && Number(draft.budget) > 100 && Number(draft.timeline) > 0 && (
              <p className="rounded-xl bg-emerald-400/10 p-3 text-sm font-black text-emerald-100">
                Worker will receive KES {Number(draft.budget).toLocaleString()} per {perDurationUnit(draft.timelineUnit)} · Total KES {(Number(draft.budget) * Math.max(1, Math.trunc(Number(draft.timeline)))).toLocaleString()}
              </p>
            )}
            {displayJobQuantity(Number(draft.quantity), draft.unit, draft.customUnit) && <p className="rounded-xl bg-emerald-400/10 p-3 text-sm font-black text-emerald-100">Quantity: {displayJobQuantity(Number(draft.quantity), draft.unit, draft.customUnit)}</p>}
            <div className="flex gap-3"><Button type="button" variant="secondary" onClick={() => setStep(1)} className="flex-1">Back</Button><Button type="submit" className="flex-1">Next</Button></div>
          </form>
        )}

        {step === 3 && (
          <div className="mt-6 grid gap-4">
            <MapPicker value={location} onChange={setLocation} />
            <div className="flex gap-3"><Button type="button" variant="secondary" onClick={() => setStep(2)} className="flex-1">Back</Button><Button type="button" disabled={posting} onClick={() => void post()} className="temp-success-button flex-1">{posting ? "Posting..." : "Post work"}</Button></div>
          </div>
        )}
      </Card>
    </div>
  );
}
