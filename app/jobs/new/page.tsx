"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { jobCategoryOptions } from "@/lib/jobCategories";
import { createJob } from "@/services/jobs";
import { matchJobCategory } from "@/utils/jobCategoryMatcher";
import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import type { LocationFields } from "@/types";
import { defaultKenyaLocation } from "@/lib/location";
import { durationLabel, durationToHours, durationUnits, type DurationUnit } from "@/utils/duration";
import { unitsForCategory } from "@/utils/jobUnits";

const MapPicker = dynamic(() => import("@/components/location/MapPicker"), { ssr: false });

export default function NewJobPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute(["client", "admin"]);
  const [category, setCategory] = useState("");
  const [posting, setPosting] = useState(false);
  const [location, setLocation] = useState<LocationFields>(defaultKenyaLocation);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("hours");
  const [unit, setUnit] = useState("");
  const unitOptions = useMemo(() => unitsForCategory(category), [category]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPosting(true);
    try {
      await createJob(profile.id, {
        title: form.get("title"),
        description: form.get("description"),
        category: form.get("category"),
        duration: durationLabel(Number(form.get("durationValue")), durationUnit),
        durationValue: form.get("durationValue"),
        durationUnit,
        durationHours: durationToHours(Number(form.get("durationValue")), durationUnit),
        payType: form.get("payType"),
        payAmount: form.get("payAmount"),
        quantity: form.get("quantity") || undefined,
        unit: unit || undefined,
        customUnit: unit === "Other" ? form.get("customUnit") : undefined,
        location: location.addressText,
        county: location.county,
        locationDetails: location,
        requiredSkills: []
      });
      formElement.reset();
      setCategory("");
      setLocation(defaultKenyaLocation);
      setUnit("");
      toast.success("Job posted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to publish job right now.");
    } finally {
      setPosting(false);
    }
  }
  if (loading || !isAuthorized) return <LoadingSpinner label="Checking client access" />;
  return (
    <Card className="mx-auto max-w-2xl">
      <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Client workspace</p>
      <h1 className="mt-2 text-3xl font-black text-[#FFFBFF]">Create temporary job</h1>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <label className="temp-label">Job title<input name="title" required placeholder="e.g. Event usher" onChange={event => setCategory(matchJobCategory(event.target.value))} className="temp-input p-3 outline-none" /></label>
        <label className="temp-label">Description<textarea name="description" required placeholder="Describe the work clearly" className="temp-input min-h-32 p-3 outline-none" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="temp-label">Category<select name="category" value={category} onChange={event => setCategory(event.target.value)} required className="temp-input p-3 outline-none">
              <option value="">Select category</option>
              {jobCategoryOptions.map((option, index) => <option key={`${option}-${index}`} value={option}>{option}</option>)}
            </select></label>
          <label className="temp-label">Work timeline<div className="grid grid-cols-[1fr_auto] gap-2"><input name="durationValue" required type="number" min={1} placeholder="Work timeline" className="temp-input min-w-0 p-3 outline-none" /><select value={durationUnit} onChange={event => setDurationUnit(event.target.value as DurationUnit)} className="temp-input p-3 outline-none">{durationUnits.map(unit => <option key={unit}>{unit}</option>)}</select></div></label>
          <label className="temp-label">Budget<input name="payAmount" required type="number" min={50} placeholder="KES" className="temp-input p-3 outline-none" /></label>
          <label className="temp-label">Pay type<select name="payType" className="temp-input p-3 outline-none"><option value="fixed">Fixed pay</option><option value="timeline">Per timeline</option></select></label>
          <label className="temp-label">Quantity optional<input name="quantity" type="number" min={1} placeholder="e.g. 12" className="temp-input p-3 outline-none" /></label>
          <label className="temp-label">Unit optional<select value={unit} onChange={event => setUnit(event.target.value)} className="temp-input p-3 outline-none"><option value="">No unit</option>{unitOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
          {unit === "Other" && <label className="temp-label sm:col-span-2">Custom unit<input name="customUnit" placeholder="e.g. Flower Beds" className="temp-input p-3 outline-none" /></label>}
        </div>
        <MapPicker value={location} onChange={setLocation} />
        <Button type="submit" disabled={posting} className="mt-2">{posting ? "Publishing..." : "Publish job"}</Button>
      </form>
    </Card>
  );
}
