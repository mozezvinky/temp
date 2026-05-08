"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { demoWorkers } from "@/lib/demoData";
import { kes } from "@/utils/money";
import { Search, ShieldCheck, SlidersHorizontal, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function WorkersPage() {
  const { loading, isAuthorized } = useProtectedRoute(["client", "admin"]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const categories = ["All", "Cleaning", "Driving", "Events", "Delivery"];
  const workers = useMemo(() => {
    const normalized = search.toLowerCase();
    return demoWorkers.filter(worker => {
      const matchesSearch = [worker.displayName, worker.bio, ...worker.skills].join(" ").toLowerCase().includes(normalized);
      const matchesCategory = category === "All" || worker.skills.some(skill => skill.toLowerCase().includes(category.toLowerCase()));
      return matchesSearch && matchesCategory;
    });
  }, [category, search]);

  if (loading || !isAuthorized) return <LoadingSpinner label="Checking client access" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-floral/65">Verified talent directory</p>
          <h1 className="text-3xl font-black">Workers</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex items-center gap-2 rounded-2xl border border-bone/20 bg-smoky px-4 py-3">
            <Search size={17} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search skills" className="bg-transparent outline-none" />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-bone/20 bg-smoky px-4 py-3">
            <SlidersHorizontal size={17} />
            <select value={category} onChange={event => setCategory(event.target.value)} className="bg-smoky outline-none">
              {categories.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workers.map(worker => (
          <Card key={worker.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">{worker.displayName}</h2>
                <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-smoky/70"><Star size={16} /> {worker.ratingAverage} ({worker.ratingCount})</p>
              </div>
              {worker.kycStatus === "verified" && <span className="inline-flex items-center gap-1 rounded-full bg-smoky px-3 py-1 text-xs font-bold text-floral"><ShieldCheck size={14} /> Verified</span>}
            </div>
            <p className="mt-4 text-sm text-smoky/70">{worker.bio}</p>
            <div className="mt-4 flex flex-wrap gap-2">{worker.skills.map(skill => <span key={skill} className="rounded-full bg-smoky/10 px-3 py-1 text-xs font-bold">{skill}</span>)}</div>
            <p className="mt-4 text-sm font-bold">{kes(worker.hourlyRate ?? 0)}/hr</p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => toast.success(`Invite sent to ${worker.displayName}`)}>Invite</Button>
              <button onClick={() => toast.success(`${worker.displayName} saved`)} className="rounded-2xl border border-smoky/20 px-4 py-2 font-semibold">Save</button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
