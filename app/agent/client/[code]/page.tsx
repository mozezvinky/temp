"use client";
import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { clearAcquisitionReturn } from "@/utils/acquisition-return";
import { rememberVerificationReturn } from "@/utils/verification-return";

export default function ClientReferral({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <div className="mx-auto max-w-xl"><Card><h1 className="text-3xl font-black">Find workers with COPIC</h1><p className="mt-4">An agent invited you to post work. If you confirm their referral, they can earn 1% of eligible worker net earnings when your job is completed and payment is verified. Your price and the worker’s payout stay the same.</p><Button className="mt-5" onClick={() => { sessionStorage.setItem("copic.clientAgentApproved", code); clearAcquisitionReturn(); rememberVerificationReturn("/find-work"); location.assign("/find-work"); }}>Confirm referral and prepare work</Button><p className="mt-4"><Link href="/find-work" className="underline" onClick={() => sessionStorage.removeItem("copic.clientAgentApproved")}>Continue without referral</Link></p></Card></div>;
}
