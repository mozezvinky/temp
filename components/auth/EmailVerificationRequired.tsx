"use client";

import { Card } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { MailCheck } from "lucide-react";
import Link from "next/link";

export function EmailVerificationRequired() {
  const { user } = useAuth();
  if (typeof window !== "undefined" && user && window.sessionStorage.getItem("temp.emailVerified.uid") === user.uid && window.sessionStorage.getItem("temp.emailVerified") === "true") {
    return null;
  }

  return (
    <Card className="mx-auto max-w-lg text-center">
      <MailCheck className="mx-auto text-[#D3C4B3]" size={30} />
      <h2 className="mt-4 text-2xl font-black text-[#FFFBFF]">Verify your email</h2>
      <p className="mt-3 text-sm text-[#CCC6BB]">Please verify your email before using this feature.</p>
      <Link href="/verify-email" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-bone px-5 py-2.5 text-sm font-bold text-[#1E1B13]">
        Verify email
      </Link>
    </Card>
  );
}
