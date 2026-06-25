"use client";

import { Button } from "@/components/ui/Button";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { IdentityVerificationModal } from "@/components/verification/IdentityVerificationModal";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { loadMyVerification } from "@/services/kyc";
import { enablePush } from "@/services/notifications";
import type { VerificationRecord } from "@/types";
import { verificationLabel } from "@/utils/verification";
import { BellRing, CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { profile, loading, isAuthorized, refreshProfile } = useProtectedRoute(["client", "worker"]);
  const [verification, setVerification] = useState<VerificationRecord | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const profileId = profile?.id;

  useEffect(() => {
    if (!profileId) return;
    void loadMyVerification().then(setVerification).catch(() => undefined);
  }, [profileId]);

  if (loading || !isAuthorized || !profile) return <LoadingSpinner label="Opening verification" />;
  if (!profile.emailVerified) return <EmailVerificationRequired />;
  const status = verification?.status ?? profile.verificationStatus;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <Card>
        <ShieldCheck className="mb-4 text-[#D3C4B3]" />
        <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Account verification</p>
        <h1 className="mt-2 text-2xl font-black text-[#FFFBFF]">Manual ID verification</h1>
        <div className="mt-4 flex items-center gap-2 text-sm font-bold">
          {status === "approved" ? <CheckCircle2 className="text-emerald-400" /> : status === "rejected" ? <XCircle className="text-red-400" /> : <Clock3 className="text-amber-300" />}
          {verificationLabel(status)}
        </div>
        <div className="mt-4"><VerificationBadge status={status} /></div>
        {status === "pending" && <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">Your documents are awaiting manual review. You will see the result here.</p>}
        {status === "approved" && <p className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">Your account is Verified.</p>}
        {status === "rejected" && <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100"><strong>Rejected:</strong> {verification?.rejectionReason || profile.verificationRejectionReason || "The submitted images could not be approved."} You may upload new documents below.</p>}
        {(status === "not_submitted" || status === "rejected") && <Button type="button" className="temp-success-button mt-6" onClick={() => setVerificationOpen(true)}>{status === "rejected" ? "Resubmit verification" : "Verify Identity"}</Button>}
      </Card>
      <Card className="h-fit">
        <BellRing className="mb-4 text-[#D3C4B3]" />
        <h2 className="text-2xl font-black">Alerts</h2>
        <p className="mt-2 text-sm text-[#CCC6BB]">Enable alerts for jobs, messages, and account updates.</p>
        <Button className="mt-4" onClick={() => enablePush(profile.id).then(() => toast.success("Alerts enabled")).catch(() => toast.error("Unable to enable alerts."))}>Enable alerts</Button>
      </Card>
      {verificationOpen && <IdentityVerificationModal profile={profile} onClose={() => setVerificationOpen(false)} onSubmitted={async () => {
        await refreshProfile();
        setVerification(await loadMyVerification());
      }} />}
    </div>
  );
}
