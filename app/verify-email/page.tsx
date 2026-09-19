"use client";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { RecruitmentEmailVerification } from "@/components/auth/RecruitmentEmailVerification";
import { verificationReturnPath } from "@/utils/verification-return";

export default function VerifyEmailPage() {
  const [destination, setDestination] = useState<string | null>(null);
  useEffect(() => { setDestination(verificationReturnPath()); }, []);
  return destination === null ? <LoadingSpinner label="Opening email verification" /> : <RecruitmentEmailVerification returnPath={destination} />;
}
