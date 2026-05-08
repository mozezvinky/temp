import { Card } from "@/components/ui/Card";
import { demoTransactions } from "@/lib/demoData";
import { kes } from "@/utils/money";

export default function AdminTransactionsPage() {
  return <div className="space-y-3">{demoTransactions.map(tx => <Card key={tx.id}><div className="flex justify-between"><span className="font-black">{tx.id}</span><span>{kes(tx.amount)}</span></div><p className="text-sm capitalize text-smoky/70">{tx.type} - {tx.status}</p></Card>)}</div>;
}
