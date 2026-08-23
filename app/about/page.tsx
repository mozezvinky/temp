import { Card } from "@/components/ui/Card";
import type { Metadata } from "next";
import { ClipboardCheck, BriefcaseBusiness, MessageCircle, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "About COPIC | Local Work and Services in Kenya",
  description: "Learn how COPIC connects clients and workers in Kenya for local services, flexible jobs, secure job chat, profiles, ratings, and clear work records.",
  alternates: {
    canonical: "/about"
  }
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Learn more</p>
        <h1 className="mt-2 text-4xl font-black text-[#FFFBFF]">Copic connects people, income, and careers across Kenya.</h1>
        <p className="mt-4 max-w-2xl text-[#CCC6BB]">Clients can post short-term work, workers can find opportunities, and both sides can manage conversations, alerts, profiles, and completion records in one place.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          [BriefcaseBusiness, "Flexible jobs", "Work can run from a few hours to long-term temporary assignments."],
          [ShieldCheck, "Trusted profiles", "Profiles, ratings, and reviews help people make safer choices."],
          [MessageCircle, "Secure chat", "Conversations open after a job request or invitation is accepted."],
          [ClipboardCheck, "Clear work records", "Track applications, accepted jobs, completion status, and reviews."]
        ].map(([Icon, title, body]) => (
          <Card key={String(title)}>
            <Icon className="text-[#D3C4B3]" />
            <h2 className="mt-4 font-black">{String(title)}</h2>
            <p className="mt-2 text-sm text-[#CCC6BB]">{String(body)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
