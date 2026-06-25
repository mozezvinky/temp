"use client";

import { requireAuth } from "@/lib/firebase";
import type { ServiceFeePayment } from "@/types";

let serviceFeePaymentRequest: Promise<ServiceFeePayment | null> | null = null;

export async function loadServiceFeePayment() {
  if (serviceFeePaymentRequest) return serviceFeePaymentRequest;
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in.");
  serviceFeePaymentRequest = fetch("/api/service-fee/payments", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" })
    .then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load payment details.");
      return (payload.payment ?? null) as ServiceFeePayment | null;
    })
    .finally(() => {
      serviceFeePaymentRequest = null;
    });
  return serviceFeePaymentRequest;
}

export async function submitServiceFeePayment(input: { screenshot?: File | null } = {}) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in.");
  const form = new FormData();
  if (input.screenshot) form.set("screenshot", input.screenshot);
  const response = await fetch("/api/service-fee/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${await user.getIdToken(true)}` },
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to submit payment.");
  return payload.payment as ServiceFeePayment;
}
