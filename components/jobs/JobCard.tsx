"use client";

import type { Job } from "@/types";
import { kes } from "@/utils/money";
import { Clock, MapPin } from "lucide-react";
import Link from "next/link";

export function JobCard({ job }: { job: Job }) {
  return (
    <Link href={`/jobs/${job.id}`} className="bone-card block rounded-2xl p-5 transition hover:-translate-y-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-olive">{job.category}</p>
          <h3 className="mt-1 text-xl font-black">{job.title}</h3>
        </div>
        <span className="rounded-full bg-smoky px-3 py-1 text-xs font-bold text-floral">{job.rateType}</span>
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-smoky/75">{job.description}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {job.requiredSkills.slice(0, 4).map(skill => <span key={skill} className="rounded-full bg-smoky/10 px-3 py-1 text-xs font-semibold">{skill}</span>)}
      </div>
      <div className="mt-5 flex items-center justify-between text-sm font-semibold">
        <span>{kes(job.rateAmount)}</span>
        <span className="inline-flex items-center gap-1"><Clock size={16} /> {job.durationHours}h</span>
        <span className="inline-flex items-center gap-1"><MapPin size={16} /> {job.location}</span>
      </div>
    </Link>
  );
}
