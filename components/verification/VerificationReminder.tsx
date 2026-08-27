"use client";

import { Button } from "@/components/ui/Button";
import { useLiveVerificationStatus } from "@/hooks/useLiveVerificationStatus";
import type { UserProfile } from "@/types";
import { ShieldCheck } from "lucide-react";

export function VerificationReminder({ profile, onVerify }: { profile: UserProfile; onVerify: () => void }) {
  const { status, checking } = useLiveVerificationStatus(profile.verificationStatus);
  if (checking || status === "pending" || status === "approved" || profile.role === "admin") return null;
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
