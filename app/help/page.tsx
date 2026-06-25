"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { createSupportTicket, sendSupportMessage, subscribeFaqs, subscribeSupportTickets, subscribeTicketMessages, type Faq, type SupportMessage, type SupportTicket } from "@/services/support";
import { ClipboardCheck, BriefcaseBusiness, MessageCircle, Search, Send, TicketCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const fallbackFaqs: Faq[] = [
  { id: "faq-applications", question: "How do I apply for a job?", answer: "Open a job from the Jobs page, review the details, and submit your application. You can track its status from your dashboard.", published: true },
  { id: "faq-chat", question: "When can I chat with the other person?", answer: "Chat becomes available after a client accepts a worker. The chat closes after the job is completed.", published: true },
  { id: "faq-payments", question: "How are payments confirmed?", answer: "After the client confirms completion, they pay the worker directly outside the platform and mark that payment as done.", published: true },
  { id: "faq-location", question: "How do I choose a job location?", answer: "Use your current location or search for an estate, road, town, or landmark and select the closest matching result.", published: true }
];

export default function HelpPage() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [faqSearch, setFaqSearch] = useState("");

  useEffect(() => {
    if (!profile) return setTickets([]);
    return subscribeSupportTickets(profile.id, items => {
      setTickets(items);
      setSelectedId(current => current || items[0]?.id || "");
    });
  }, [profile]);

  useEffect(() => {
    if (!selectedId) return setMessages([]);
    return subscribeTicketMessages(selectedId, setMessages);
  }, [selectedId]);

  useEffect(() => subscribeFaqs(setFaqs), []);

  const selected = tickets.find(ticket => ticket.id === selectedId);
  const filteredFaqs = useMemo(() => {
    const normalized = faqSearch.trim().toLowerCase();
    const availableFaqs = faqs.length ? faqs : fallbackFaqs;
    return availableFaqs.filter(item => !normalized || `${item.question} ${item.answer}`.toLowerCase().includes(normalized));
  }, [faqSearch, faqs]);

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      if (profile.role === "admin") return;
      const id = await createSupportTicket(profile.id, profile.displayName, profile.role, String(form.get("subject") ?? "").trim(), String(form.get("details") ?? "").trim());
      setSelectedId(id);
      formElement.reset();
      toast.success("Support ticket created.");
    } catch {
      toast.error("Unable to create a support ticket right now.");
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !selected) return;
    const formElement = event.currentTarget;
    const body = String(new FormData(formElement).get("message") ?? "").trim();
    if (!body) return;
    try {
      await sendSupportMessage(selected, profile.id, profile.role, body);
      formElement.reset();
    } catch {
      toast.error("Unable to send your message right now.");
    }
  }

  return (
    <div className="temp-help-page">
      <section className="temp-help-hero text-center">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#959087]">Copic support</p>
        <h1 className="mt-5 text-4xl font-semibold text-[#FFFBFF] md:text-5xl">How can we help you?</h1>
        <p className="mt-4 text-sm text-[#CCC6BB]">Search here to get answers to your questions</p>
        <label className="temp-help-search mx-auto mt-8 flex max-w-xl items-center gap-3 px-5 py-3 text-left">
          <Search size={17} />
          <input value={faqSearch} onChange={event => setFaqSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Search help topics" />
        </label>
        <p className="mt-4 text-xs text-[#959087]">Popular: <span className="ml-2 rounded-full bg-[#2A2A2B] px-3 py-1">Jobs</span><span className="ml-2 rounded-full bg-[#2A2A2B] px-3 py-1">Payments</span><span className="ml-2 rounded-full bg-[#2A2A2B] px-3 py-1">Chat</span></p>
      </section>
      <div className="temp-help-topic-grid">
        <div className="temp-help-topic"><BriefcaseBusiness /><div><h2>Jobs and applications</h2><p>Posting, applying, live work</p></div></div>
        <div className="temp-help-topic"><ClipboardCheck /><div><h2>Direct payment</h2><p>Client payment confirmation, worker receipt checks</p></div></div>
        <div className="temp-help-topic"><MessageCircle /><div><h2>Chat support</h2><p>Accepted and completed work</p></div></div>
        <div className="temp-help-topic"><TicketCheck /><div><h2>Support tickets</h2><p>Create and track requests</p></div></div>
        <div className="temp-help-topic"><Search /><div><h2>Quick answers</h2><p>Search frequently asked questions</p></div></div>
        <div className="temp-help-topic"><MessageCircle /><div><h2>Account support</h2><p>Profile and access help</p></div></div>
      </div>
      <section className="temp-help-recommended">
        <p className="text-center text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Recommended topics</p>
        <h2 className="mt-3 text-center text-3xl font-semibold text-[#FFFBFF]">Quick answers</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {filteredFaqs.slice(0, 4).map(item => <Card key={`recommended-${item.id}`} className="min-h-52"><h3 className="font-semibold text-[#FFFBFF]">{item.question}</h3><p className="mt-4 text-sm leading-6 text-[#CCC6BB]">{item.answer}</p></Card>)}
        </div>
      </section>
      {!profile ? (
        <Card><p className="text-sm text-[#CCC6BB]">Sign in to contact support and track tickets.</p><Link className="mt-4 inline-flex rounded-xl bg-bone px-5 py-3 font-black text-[#1E1B13]" href="/auth/login">Sign in</Link></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-3"><TicketCheck /><h2 className="text-xl font-black">Create ticket</h2></div>
              <form onSubmit={createTicket} className="mt-5 grid gap-3">
                <input name="subject" required className="temp-input rounded-xl p-3 outline-none" placeholder="Ticket subject" />
                <textarea name="details" required className="temp-input min-h-24 rounded-xl p-3 outline-none" placeholder="Describe the issue" />
                <Button type="submit">Create ticket</Button>
              </form>
            </Card>
            <Card>
              <h2 className="text-lg font-black">Your tickets</h2>
              <div className="mt-4 grid gap-2">
                {tickets.map(ticket => (
                  <button key={ticket.id} onClick={() => setSelectedId(ticket.id)} className={`flex items-center justify-between rounded-xl p-3 text-left text-sm ${selectedId === ticket.id ? "bg-bone text-[#1E1B13]" : "bg-[#2A2A2B]"}`}>
                    <span className="truncate font-bold">{ticket.subject}</span>
                    <span className="ml-2 text-xs capitalize">{ticket.status}</span>
                  </button>
                ))}
                {!tickets.length && <p className="text-sm text-[#CCC6BB]">No support tickets yet.</p>}
              </div>
            </Card>
          </div>
          <Card>
            <div className="flex items-center gap-3"><MessageCircle /><h2 className="text-xl font-black">{selected?.subject ?? "Select a ticket"}</h2></div>
            {selected ? (
              <>
                <div className="mt-5 min-h-48 space-y-3">
                  {messages.map(message => (
                    <p key={message.id} className={`max-w-[84%] rounded-xl p-3 text-sm ${message.senderId === profile.id ? "ml-auto bg-bone text-[#1E1B13]" : "bg-[#2A2A2B]"}`}>{message.body}</p>
                  ))}
                </div>
                {selected.status !== "closed" && (
                  <form onSubmit={reply} className="mt-4 flex gap-2">
                    <input name="message" required className="temp-input min-w-0 flex-1 rounded-xl px-4 py-3 outline-none" placeholder="Write a message" />
                    <Button type="submit" aria-label="Send message"><Send size={17} /></Button>
                  </form>
                )}
              </>
            ) : <p className="mt-5 text-sm text-[#CCC6BB]">Create a ticket to start a support conversation.</p>}
          </Card>
        </div>
      )}
      <footer className="temp-help-faq-list">
        <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">FAQs</p>
        <h2 className="mt-2 text-3xl font-semibold text-[#FFFBFF]">How Copic works</h2>
        <div className="mt-6 grid gap-3">
          {filteredFaqs.map(item => (
            <Card key={item.id} className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#2A2A2B] text-[#D8CFBC]"><MessageCircle size={18} /></span>
              <div><h3 className="font-semibold text-[#FFFBFF]">{item.question}</h3>
              <p className="mt-2 text-sm leading-6 text-[#CCC6BB]">{item.answer}</p>
              </div>
            </Card>
          ))}
          {!filteredFaqs.length && <Card><p className="text-sm text-[#CCC6BB]">No matching questions found.</p></Card>}
        </div>
      </footer>
    </div>
  );
}
