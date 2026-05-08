"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { createJob, uploadJobImages } from "@/services/jobs";
import { FormEvent } from "react";
import { toast } from "sonner";

export default function NewJobPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute(["client", "admin"]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    const files = form.getAll("images").filter((file): file is File => file instanceof File && file.size > 0);
    const imageUrls = files.length ? await uploadJobImages(profile.id, files) : [];
    await createJob(profile.id, {
      title: form.get("title"),
      description: form.get("description"),
      category: form.get("category"),
      durationHours: form.get("durationHours"),
      rateType: form.get("rateType"),
      rateAmount: form.get("rateAmount"),
      location: form.get("location"),
      requiredSkills: String(form.get("requiredSkills")).split(",").map(skill => skill.trim()).filter(Boolean)
    }, imageUrls).then(() => toast.success("Job posted")).catch(error => toast.error(error.message));
  }
  if (loading || !isAuthorized) return <LoadingSpinner label="Checking client access" />;

  return (
    <Card className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-black">Create temporary job</h1>
      <form onSubmit={submit} className="mt-5 grid gap-3">
        <input name="title" required placeholder="Title" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
        <textarea name="description" required placeholder="Description" className="min-h-32 rounded-2xl bg-smoky/10 p-3 outline-none" />
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="category" required placeholder="Category" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
          <input name="location" required placeholder="Location" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
          <input name="durationHours" required type="number" min={2} max={8760} placeholder="Duration hours" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
          <input name="rateAmount" required type="number" min={50} placeholder="Rate amount" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
        </div>
        <select name="rateType" className="rounded-2xl bg-smoky/10 p-3 outline-none"><option value="hourly">Hourly</option><option value="fixed">Fixed</option></select>
        <input name="requiredSkills" required placeholder="Skills, comma separated" className="rounded-2xl bg-smoky/10 p-3 outline-none" />
        <input name="images" type="file" accept="image/*" multiple className="rounded-2xl bg-smoky/10 p-3" />
        <Button>Publish job</Button>
      </form>
    </Card>
  );
}
