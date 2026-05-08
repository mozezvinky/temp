"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { demoTransactions } from "@/lib/demoData";
import { markPaidInCash, completeMpesaJob } from "@/services/wallet";
import { calculateServiceFee, calculateWorkerNet, kes } from "@/utils/money";
import { ArrowDownToLine, ArrowUpFromLine, Clock, WalletCards } from "lucide-react";
import { toast } from "sonner";

export default function WalletPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute();
  const gross = 1050;
  if (loading || !isAuthorized || !profile) return <LoadingSpinner label="Opening wallet" />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><WalletCards /><p className="mt-4 text-sm text-smoky/70">Available balance</p><p className="text-3xl font-black">{kes(profile.role === "worker" ? calculateWorkerNet(gross) : gross)}</p></Card>
        <Card><Clock /><p className="mt-4 text-sm text-smoky/70">Pending payments</p><p className="text-3xl font-black">{kes(calculateServiceFee(gross))}</p></Card>
        <Card><ArrowUpFromLine /><p className="mt-4 text-sm text-smoky/70">Wallet activity</p><p className="text-3xl font-black">{demoTransactions.length}</p></Card>
      </div>
      <Card>
        <h1 className="text-2xl font-black">{profile.role === "client" ? "Client wallet actions" : "Worker wallet actions"}</h1>
        <div className="mt-4 flex flex-wrap gap-3">
          {profile.role === "client" && <Button onClick={() => completeMpesaJob("demo", "client-1", "worker-ama", gross, "DEMO-MPESA").then(() => toast.success("Wallet credited")).catch(error => toast.error(error.message))}>Complete with M-Pesa</Button>}
          {profile.role === "client" && <button className="rounded-2xl border border-smoky/20 px-5 py-3 font-semibold" onClick={() => markPaidInCash("demo", "client-1", "worker-ama", gross).then(() => toast.success("Worker locked until service fee is paid")).catch(error => toast.error(error.message))}>Paid in cash</button>}
          <button className="inline-flex items-center gap-2 rounded-2xl border border-smoky/20 px-5 py-3 font-semibold" onClick={() => toast.success("Deposit prompt opened")}><ArrowDownToLine size={17} /> Deposit</button>
          <button className="inline-flex items-center gap-2 rounded-2xl border border-smoky/20 px-5 py-3 font-semibold" onClick={() => toast.success("Withdrawal request submitted for review")}><ArrowUpFromLine size={17} /> Withdraw</button>
        </div>
      </Card>
      <div className="space-y-3">
        {demoTransactions.map(tx => <Card key={tx.id}><div className="flex items-center justify-between"><span className="font-black">{tx.type}</span><span>{kes(tx.amount)}</span></div><p className="mt-1 text-sm capitalize text-smoky/70">{tx.status} via {tx.paymentType}</p></Card>)}
      </div>
    </div>
  );
}
