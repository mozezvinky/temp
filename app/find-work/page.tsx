"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { createJob, uploadJobImages } from "@/services/jobs";
import { CalendarDays, ReceiptText, UsersRound } from "lucide-react";
import { FormEvent } from "react";
import { toast } from "sonner";

export default function FindWorkPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute(["client", "admin"]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    const files = form.getAll("attachments").filter((file): file is File => file instanceof File && file.size > 0);
    const imageUrls = files.length ? await uploadJobImages(profile.id, files) : [];
    await createJob(profile.id, {
      title: form.get("title"),
      description: form.get("description"),
      category: form.get("category"),
      durationHours: form.get("timeline"),
      rateType: form.get("rateType"),
      rateAmount: form.get("budget"),
      location: form.get("location"),
      requiredSkills: String(form.get("skills")).split(",").map(skill => skill.trim()).filter(Boolean)
    }, imageUrls).then(() => toast.success("Work posted and matching workers alerted")).catch(error => toast.error(error.message));
  }

  if (loading || !isAuthorized) return <LoadingSpinner label="Checking client access" />;

  return (
    <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <div className="space-y-4">
        <Card>
          <UsersRound className="mb-4" />
          <h1 className="text-3xl font-black">Find work support</h1>
          <p className="mt-3 text-sm text-smoky/70">Post a temporary job, set the budget, define the timeline, and review verified applicants from your client dashboard.</p>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Card><ReceiptText /><p className="mt-3 font-black">Budget-led hiring</p><p className="mt-2 text-sm text-smoky/70">Fixed budget jobs route into the same wallet and service-fee flow.</p></Card>
          <Card><CalendarDays /><p className="mt-3 font-black">2 hours to 1 year</p><p className="mt-2 text-sm text-smoky/70">The form enforces temporary work timelines through shared validation.</p></Card>
        </div>
      </div>
      <Card>
        <h2 className="text-2xl font-black">Post work</h2>
        <form onSubmit={submit} className="mt-5 grid gap-3">
          <input name="title" required placeholder="Job title" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
          <textarea name="description" required placeholder="Job description" className="min-h-36 rounded-2xl bg-smoky/10 p-3 outline-none" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="budget" required type="number" min={50} placeholder="Budget in KES" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
            <input name="timeline" required type="number" min={2} max={8760} placeholder="Timeline in hours" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
            <input name="category" required placeholder="Category" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
            <input name="location" required placeholder="Location" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
          </div>
          <select name="rateType" className="rounded-2xl bg-smoky/10 p-3 outline-none"><option value="fixed">Fixed pay</option><option value="hourly">Hourly pay</option></select>
          <input name="skills" required placeholder="Skills, comma separated" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
          <input name="attachments" type="file" accept="image/*,.pdf" multiple className="rounded-2xl bg-smoky/10 p-3" />
          <Button>Post work</Button>
        </form>
      </Card>
    </div>
  );
}
