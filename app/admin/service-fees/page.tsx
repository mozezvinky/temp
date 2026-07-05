"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import type { ServiceFeePayment } from "@/types";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function AdminServiceFeesPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<ServiceFeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const loadPayments = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/admin/service-fee-payments", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load payments.");
      setPayments(Array.isArray(payload.payments) ? payload.payments : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load payments.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadPayments();
    const intervalId = window.setInterval(() => void loadPayments(false), 5_000);
    return () => window.clearInterval(intervalId);
  }, [loadPayments]);

  async function review(id: string, action: "approve" | "reject") {
    if (!user) return;
    const reason = action === "reject" ? window.prompt("Reason for rejection") ?? "" : "Service fee payment approved";
    if (action === "reject" && !reason.trim()) return;
    setBusy(id);
    try {
      const response = await fetch("/api/admin/service-fee-payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken(true)}` },
        body: JSON.stringify({ id, action, reason })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to review payment.");
      toast.success(action === "approve" ? "Worker unlocked." : "Payment rejected.");
      await loadPayments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to review payment.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <LoadingSpinner label="Loading service fee payments" />;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Admin</p>
        <h1 className="mt-2 text-3xl font-black">Service Fee Payments</h1>
      </div>
      {payments.length ? payments.map(payment => {
        const waitingForWorker = payment.requiresWorkerSubmission || payment.status === "service_fee_due";
        const canReview = !waitingForWorker && payment.status !== "approved";
        return (
          <Card key={payment.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-[#FFFBFF]">{payment.workerName ?? payment.username}</h2>
                <p className="mt-1 text-sm text-[#CCC6BB]">Username: {payment.username}</p>
                <p className="mt-1 text-sm text-[#CCC6BB]">Transaction: {payment.transactionCode}</p>
                <p className="mt-1 text-sm text-[#CCC6BB]">Amount: KES {payment.amount.toLocaleString()}</p>
                {waitingForWorker && <p className="mt-2 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm font-bold text-amber-100">Worker has an outstanding service fee but has not submitted payment proof yet.</p>}
                {payment.jobId && <p className="mt-1 text-sm text-[#959087]">Job: {payment.jobId}</p>}
                {payment.screenshotUrl && <p className="mt-1 text-sm text-[#959087]">Screenshot: {payment.screenshotUrl}</p>}
                {payment.rejectionReason && <p className="mt-2 text-sm text-red-200">Rejected: {payment.rejectionReason}</p>}
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black capitalize">{payment.status.replaceAll("_", " ")}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" disabled={busy === payment.id || !canReview} onClick={() => void review(payment.id, "approve")}>Approve Payment</Button>
              <Button type="button" variant="danger" disabled={busy === payment.id || !canReview} onClick={() => void review(payment.id, "reject")}>Reject Payment</Button>
            </div>
          </Card>
        );
      }) : <EmptyState title="No service fee payments" body="Worker submissions and outstanding service-fee requests will appear here for verification." />}
    </div>
  );
}
