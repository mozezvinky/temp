"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import type { VerificationRecord } from "@/types";
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function AdminKycPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/verifications?status=${filter}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { verifications?: VerificationRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load verification requests.");
      setItems(payload.verifications ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load verification requests.");
    } finally {
      setLoading(false);
    }
  }, [filter, user]);

  useEffect(() => { void load(); }, [load]);

  async function review(item: VerificationRecord, status: "approved" | "rejected") {
    if (!user) return;
    setReviewing(item.userId);
    try {
      const response = await fetch("/api/admin/verifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ userId: item.userId, status, rejectionReason: reasons[item.userId] ?? "" })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to review verification.");
      toast.success(status === "approved" ? "Account verified." : "Verification rejected.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to review verification.");
    } finally {
      setReviewing(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="copic-eyebrow">Manual review</p><h1 className="text-3xl font-black">ID Verification Requests</h1></div>
        <div className="flex gap-2"><Button variant={filter === "pending" ? "primary" : "secondary"} onClick={() => setFilter("pending")}>Pending</Button><Button variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>All requests</Button></div>
      </div>
      {loading ? <LoadingSpinner label="Loading ID verification requests" /> : !items.length ? <EmptyState title="No verification requests" body={filter === "pending" ? "There are no ID submissions waiting for review." : "Submitted ID checks will appear here."} /> : items.map(item => (
        <Card key={item.id || item.userId} className="overflow-hidden">
          <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
            <div>
              <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{item.fullName}</h2><p className="mt-1 text-sm text-[#959087]">@{item.username}</p></div><span className="rounded-full border border-white/15 px-3 py-1 text-xs font-black uppercase">{item.status}</span></div>
              <dl className="mt-5 grid gap-3 text-sm">
                <Info label="Email" value={item.email} />
                <Info label="Phone" value={item.phoneNumber} />
                <Info label="Account" value={item.role} />
                <Info label="Submitted" value={formatDate(item.createdAt)} />
              </dl>
              {item.status === "rejected" && item.rejectionReason && <p className="mt-4 rounded-xl bg-red-400/10 p-3 text-sm text-red-200">Reason: {item.rejectionReason}</p>}
              {item.status === "pending" && <div className="mt-5 grid gap-3">
                <label className="temp-label">Optional rejection reason<textarea value={reasons[item.userId] ?? ""} onChange={event => setReasons(current => ({ ...current, [item.userId]: event.target.value }))} placeholder="Explain what the user should correct" className="temp-input min-h-24 p-3 outline-none" /></label>
                <div className="flex flex-wrap gap-2"><Button disabled={reviewing === item.userId} onClick={() => void review(item, "approved")}><CheckCircle2 size={16} /> Approve verification</Button><button disabled={reviewing === item.userId} onClick={() => void review(item, "rejected")} className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 px-5 py-2.5 text-sm font-bold text-red-200 disabled:opacity-50"><XCircle size={16} /> Reject</button></div>
              </div>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <DocumentImage label="ID front" url={item.idFrontUrl} />
              <DocumentImage label="ID back" url={item.idBackUrl} />
              <DocumentImage label="Selfie holding ID" url={item.selfieWithIdUrl} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) { return <div><dt className="text-xs font-bold uppercase tracking-wide text-[#959087]">{label}</dt><dd className="mt-1 break-all font-semibold text-[#E7E0D5]">{value || "Not provided"}</dd></div>; }

function DocumentImage({ label, url }: { label: string; url?: string }) {
  return <figure className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"><div className="relative aspect-[4/3] bg-black/30">{url ? <Image src={url} alt={label} fill unoptimized className="object-contain" /> : <div className="grid h-full place-items-center text-sm text-[#959087]">Missing image</div>}</div><figcaption className="flex items-center justify-between gap-2 p-3 text-sm font-bold"><span>{label}</span>{url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`}><ExternalLink size={16} /></a>}</figcaption></figure>;
}

function formatDate(value: unknown) {
  if (!value) return "Unknown";
  if (typeof value === "string") return new Date(value).toLocaleString();
  if (typeof value === "object" && value && "_seconds" in value) return new Date(Number((value as { _seconds: number })._seconds) * 1000).toLocaleString();
  return "Unknown";
}
