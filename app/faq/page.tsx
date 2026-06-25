"use client";

import { Card } from "@/components/ui/Card";
import { subscribeFaqs, type Faq } from "@/services/support";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function FaqPage() {
  const [search, setSearch] = useState("");
  const [questions, setQuestions] = useState<Faq[]>([]);
  useEffect(() => subscribeFaqs(setQuestions), []);
  const filtered = useMemo(
    () => questions.filter(item => `${item.question} ${item.answer}`.toLowerCase().includes(search.toLowerCase())),
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
