"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { enablePush } from "@/services/notifications";
import { submitKyc } from "@/services/kyc";
import { BellRing, ShieldCheck } from "lucide-react";
import { FormEvent } from "react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nationalIdFile = form.get("nationalIdFile");
    const selfieFile = form.get("selfieFile");
    if (!profile || !(nationalIdFile instanceof File) || !(selfieFile instanceof File)) return;
    await submitKyc(profile.id, String(form.get("nationalId")), nationalIdFile, selfieFile).then(() => toast.success("KYC submitted")).catch(error => toast.error(error.message));
  }
  if (loading || !isAuthorized || !profile) return <LoadingSpinner label="Opening settings" />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <ShieldCheck className="mb-4" />
        <h1 className="text-2xl font-black">KYC verification</h1>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input name="nationalId" required placeholder="National ID number" className="w-full rounded-2xl bg-smoky/10 p-3 outline-none" />
          <input name="nationalIdFile" required type="file" accept="image/*,.pdf" className="w-full rounded-2xl bg-smoky/10 p-3" />
          <input name="selfieFile" required type="file" accept="image/*" className="w-full rounded-2xl bg-smoky/10 p-3" />
          <Button>Submit KYC</Button>
        </form>
      </Card>
      <Card>
        <BellRing className="mb-4" />
        <h2 className="text-2xl font-black">Push notifications</h2>
        <p className="mt-2 text-sm text-smoky/70">Enable alerts for chat, applications, KYC updates, and payments.</p>
        <Button className="mt-4" onClick={() => profile && enablePush(profile.id).then(() => toast.success("Push enabled"))}>Enable push</Button>
      </Card>
    </div>
  );
}
