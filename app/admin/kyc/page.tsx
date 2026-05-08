import { Card } from "@/components/ui/Card";
import { demoWorkers } from "@/lib/demoData";

export default function AdminKycPage() {
  return <div className="space-y-3">{demoWorkers.map(worker => <Card key={worker.id}><div className="flex items-center justify-between"><span className="font-black">{worker.displayName}</span><span className="capitalize">{worker.kycStatus}</span></div></Card>)}</div>;
}
