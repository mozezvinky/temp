"use client";

import { loadMyVerification } from "@/services/kyc";
import type { VerificationStatus } from "@/types";
import { normalizeVerificationStatus } from "@/utils/verification";
import { CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

export function VerificationBadge({ status, compact = false }: { status?: VerificationStatus; compact?: boolean }) {
  const [liveStatus, setLiveStatus] = useState<VerificationStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMyVerification()
      .then(record => {
        if (!cancelled && record?.status) setLiveStatus(normalizeVerificationStatus(record.status));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const effectiveStatus = liveStatus ?? normalizeVerificationStatus(status);
  if (effectiveStatus === "approved") {
    return <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1.5 text-sm font-black text-emerald-100"><CheckCircle2 size={16} /> Verified Identity</span>;
  }
  if (effectiveStatus === "pending") {
    return <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/15 px-3 py-1.5 text-sm font-black text-amber-100"><Clock3 size={16} /> Pending Review</span>;
  }
  if (effectiveStatus === "rejected") {
    return <span className="inline-flex items-center gap-2 rounded-full border border-red-300/30 bg-red-400/15 px-3 py-1.5 text-sm font-black text-red-100"><XCircle size={16} /> Verification Rejected</span>;
  }
  return <span className="inline-flex items-center gap-2 rounded-full border border-[#4A463F] bg-[#2A2A2B] px-3 py-1.5 text-sm font-black text-[#CCC6BB]"><ShieldCheck size={16} /> {compact ? "Unverified" : "Identity Unverified"}</span>;
}
