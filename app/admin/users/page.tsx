import { Card } from "@/components/ui/Card";
import { demoWorkers } from "@/lib/demoData";

export default function AdminUsersPage() {
  return <div className="space-y-3">{demoWorkers.map(user => <Card key={user.id}><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><span className="font-black">{user.displayName}</span><p className="mt-1 text-sm text-smoky/70">{user.role} - {user.kycStatus} - trust score {Math.round(user.ratingAverage * 20)}%</p></div><div className="flex flex-wrap gap-2"><button className="rounded-2xl border border-smoky/20 px-4 py-2 font-semibold">Verify</button><button className="rounded-2xl border border-smoky/20 px-4 py-2 font-semibold">Suspend</button><button className="rounded-2xl bg-smoky px-4 py-2 font-semibold text-floral">Ban</button></div></div></Card>)}</div>;
}
