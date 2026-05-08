"use client";

import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { demoWorkers, skillTests } from "@/lib/demoData";
import { BriefcaseBusiness, CalendarCheck, FileBadge, ShieldCheck, Star } from "lucide-react";

export default function ProfilePage() {
  const { user, profile, loading, isAuthorized } = useProtectedRoute();
  const worker = demoWorkers[0];
  if (loading || !isAuthorized || !profile) return <LoadingSpinner label="Opening profile" />;
  return (
    <div className="space-y-4">
      <Card><h1 className="text-3xl font-black">{user?.displayName ?? profile.displayName}</h1><p className="mt-2 text-sm capitalize text-smoky/70">{profile.role} profile</p><p className="mt-3 text-sm text-smoky/70">{profile.bio ?? (profile.role === "worker" ? worker.bio : "Manage company info, posted work, applicants, and payment history.")}</p><div className="mt-4 flex flex-wrap gap-2">{profile.badges?.map(b => <span key={b} className="rounded-full bg-smoky px-3 py-1 text-xs font-bold text-floral">{b}</span>)}<span className="inline-flex items-center gap-1 rounded-full bg-smoky px-3 py-1 text-xs font-bold text-floral"><ShieldCheck size={14} /> {profile.kycStatus}</span></div><p className="mt-4 inline-flex items-center gap-1 font-bold"><Star size={18} /> {profile.ratingAverage ?? 0} ({profile.ratingCount ?? 0})</p></Card>
      {profile.role === "worker" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card><BriefcaseBusiness /><h2 className="mt-3 font-black">Skills and categories</h2><p className="mt-2 text-sm text-smoky/70">{(profile.skills?.length ? profile.skills : worker.skills).join(", ")}</p></Card>
          <Card><CalendarCheck /><h2 className="mt-3 font-black">Availability</h2><p className="mt-2 text-sm text-smoky/70">{profile.availability ?? worker.availability ?? "Available for short-term work"}</p></Card>
          <Card><FileBadge /><h2 className="mt-3 font-black">Certificates and portfolio</h2><p className="mt-2 text-sm text-smoky/70">{(profile.certificates?.length ? profile.certificates : worker.certificates).join(", ")}. Portfolio uploads are stored in Firebase Storage.</p></Card>
          {skillTests.map(test => <Card key={test.id}><h2 className="font-black">{test.title}</h2><p className="mt-2 text-sm text-smoky/70">{test.questions.length} questions, {test.passMark}% pass mark</p></Card>)}
        </div>
      ) : <Card><h2 className="font-black">Client workspace</h2><p className="mt-2 text-sm text-smoky/70">Company details, ratings from workers, posted jobs history, saved workers, and payment reliability are managed from this shared profile shell.</p></Card>}
    </div>
  );
}
