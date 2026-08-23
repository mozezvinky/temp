"use client";

import { Card } from "@/components/ui/Card";
import { subscribeFaqs, type Faq } from "@/services/support";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const fallbackFaqs: Faq[] = [
  { id: "faq-post-work", question: "How do I post work on COPIC?", answer: "Create a client account, open the posting flow, add the service details, location, timeline, worker count, and price, then publish the job for eligible workers to review.", published: true },
  { id: "faq-apply", question: "How do workers apply for jobs?", answer: "Workers can browse available jobs, review the requirements and pay, then submit an application from the job details page when they match the work.", published: true },
  { id: "faq-services", question: "What local services does COPIC support?", answer: "COPIC supports practical local services such as cleaning, moving, gardening, babysitting, shopping, Mama Fua, and other work categories available in the platform.", published: true },
  { id: "faq-payments", question: "How are payments handled?", answer: "Clients and workers agree on the work details, then clients confirm completion and pay workers directly using the payment process shown in the app.", published: true },
  { id: "faq-chat", question: "When does chat become available?", answer: "Secure chat opens after a job request, application, or hire arrangement is accepted, so both sides can coordinate work details in context.", published: true }
];

export default function FaqPage() {
  const [search, setSearch] = useState("");
  const [questions, setQuestions] = useState<Faq[]>([]);
  useEffect(() => subscribeFaqs(setQuestions), []);
  const filtered = useMemo(
    () => {
      const availableQuestions = questions.length ? questions : fallbackFaqs;
      return availableQuestions.filter(item => `${item.question} ${item.answer}`.toLowerCase().includes(search.toLowerCase()));
    },
    [questions, search]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Support</p>
        <h1 className="mt-2 text-4xl font-black text-[#FFFBFF]">Frequently asked questions</h1>
      </div>
      <label className="temp-input flex items-center gap-2 rounded-xl px-4 py-3">
        <Search size={17} />
        <input value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Search FAQs" />
      </label>
      <div className="grid gap-3">
        {filtered.map(item => (
          <Card key={item.id}>
            <h2 className="font-black text-[#FFFBFF]">{item.question}</h2>
            <p className="mt-2 text-sm leading-6 text-[#CCC6BB]">{item.answer}</p>
          </Card>
        ))}
        {!filtered.length && <Card><p className="text-sm text-[#CCC6BB]">No matching questions found.</p></Card>}
      </div>
    </div>
  );
}
