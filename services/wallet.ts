"use client";

import { functions } from "@/lib/firebase";
import { calculateServiceFee, calculateWorkerNet } from "@/utils/money";
import { httpsCallable } from "firebase/functions";

export async function completeMpesaJob(jobId: string, clientId: string, workerId: string, grossAmount: number, receipt: string) {
  void clientId;
  void workerId;
  calculateWorkerNet(grossAmount);
  const complete = httpsCallable(functions, "completeMpesaJob");
  await complete({ jobId, amount: grossAmount, mpesaReceipt: receipt });
}

export async function markPaidInCash(jobId: string, clientId: string, workerId: string, grossAmount: number) {
  void clientId;
  void workerId;
  calculateServiceFee(grossAmount);
  const complete = httpsCallable(functions, "markPaidInCash");
  await complete({ jobId, amount: grossAmount });
}

export async function payOutstandingFee(userId: string, amount: number, receipt: string) {
  void userId;
  const pay = httpsCallable(functions, "payOutstandingFee");
  await pay({ amount, mpesaReceipt: receipt });
}
