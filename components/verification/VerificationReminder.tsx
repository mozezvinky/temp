"use client";

import { Button } from "@/components/ui/Button";
import { loadMyVerification } from "@/services/kyc";
import type { UserProfile } from "@/types";
import type { VerificationStatus } from "@/types";
import { normalizeVerificationStatus } from "@/utils/verification";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export function VerificationReminder({ profile, onVerify }: { profile: UserProfile; onVerify: () => void }) {
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
  const effectiveStatus = liveStatus ?? normalizeVerificationStatus(profile.verificationStatus);
  if (effectiveStatus === "pending" || effectiveStatus === "approved" || profile.role === "admin") return null;
  return (
    <aside className="verification-reminder-card">
      <span className="verification-reminder-icon"><ShieldCheck size={22} /></span>
      <div>
        <h2>Verify Your Identity</h2>
        <p>Verified workers gain more trust and visibility on the platform.</p>
      </div>
      <Button type="button" className="temp-success-button" onClick={onVerify}>Verify Now</Button>
    </aside>
  );
}
