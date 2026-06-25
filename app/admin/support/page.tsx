"use client";

import { AppModal } from "@/components/ui/AppModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import type { SupportTicketStatus } from "@/types";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type AdminTicket = {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  userRole?: string;
  subject: string;
  status: SupportTicketStatus;
  assignedAdminId?: string | null;
  relatedJobId?: string;
  relatedApplicationId?: string;
  relatedPaymentId?: string;
  lastMessage?: string;
};

type TicketMessage = { id: string; senderRole: string; body: string; createdAt?: unknown };
type TicketNote = { id: string; adminId: string; body: string };
type TicketDetail = {
  ticket: AdminTicket;
  messages: TicketMessage[];
  notes: TicketNote[];
  user?: Record<string, unknown> | null;
  transactions: Array<Record<string, unknown>>;
  applications: Array<Record<string, unknown>>;
  logs: Array<Record<string, unknown>>;
  notifications?: Array<Record<string, unknown>>;
};

const statuses: Array<SupportTicketStatus | "all"> = ["all", "open", "pending", "resolved", "rejected", "escalated"];

export default function AdminSupportPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [status, setStatus] = useState<SupportTicketStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionOpen, setActionOpen] = useState<"profile" | "role" | "kyc" | "moderate" | "auth" | "application" | "job" | null>(null);

  const selectedTicket = useMemo(() => detail?.ticket ?? tickets.find(ticket => ticket.id === selectedId), [detail, selectedId, tickets]);

  const adminFetch = useCallback(async (path: string, init?: RequestInit) => {
    if (!user) throw new Error("Admin sign in is required.");
    const token = await user.getIdToken();
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Admin request failed.");
    return payload;
  }, [user]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (status !== "all") query.set("status", status);
      if (search.trim()) query.set("search", search.trim());
      const payload = await adminFetch(`/api/admin/tickets?${query}`);
      const nextTickets = Array.isArray(payload.tickets) ? payload.tickets as AdminTicket[] : [];
      setTickets(nextTickets);
      setSelectedId(current => current && nextTickets.some(ticket => ticket.id === current) ? current : nextTickets[0]?.id ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load tickets.");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, search, status]);

  const loadTicketDetail = useCallback(async (ticketId: string) => {
    try {
      const payload = await adminFetch(`/api/admin/tickets/${ticketId}`);
      setDetail(payload as TicketDetail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open ticket.");
    }
  }, [adminFetch]);

  useEffect(() => {
    if (!user) return;
    const handle = window.setTimeout(() => void loadTickets(), 250);
    return () => window.clearTimeout(handle);
  }, [loadTickets, user]);

  useEffect(() => {
    if (!user || !selectedId) return;
    void loadTicketDetail(selectedId);
  }, [loadTicketDetail, selectedId, user]);

  async function mutateTicket(body: Record<string, unknown>, success: string) {
    if (!selectedId) return;
    try {
      await adminFetch(`/api/admin/tickets/${selectedId}`, { method: "PATCH", body: JSON.stringify(body) });
      await Promise.all([loadTickets(), loadTicketDetail(selectedId)]);
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update ticket.");
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = String(new FormData(form).get("message") ?? "").trim();
    if (!message) return;
    await mutateTicket({ action: "reply", message, reason: "Support reply" }, "Reply sent.");
    form.reset();
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const note = String(new FormData(form).get("note") ?? "").trim();
    if (!note) return;
    await mutateTicket({ action: "note", note, reason: "Internal note" }, "Internal note added.");
    form.reset();
  }

  async function assignTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const assignedAdminId = String(new FormData(form).get("assignedAdminId") ?? "").trim();
    await mutateTicket({ action: "assign", assignedAdminId, reason: assignedAdminId ? `Assigned to ${assignedAdminId}` : "Ticket unassigned" }, "Ticket assignment updated.");
    form.reset();
  }

  async function adminAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data: Record<string, unknown> = Object.fromEntries(new FormData(form).entries());
    if (data.action === "update_user_profile") {
      data.patch = { displayName: data.displayName };
      delete data.displayName;
    }
    try {
      await adminFetch("/api/admin/actions", { method: "POST", body: JSON.stringify(data) });
      setActionOpen(null);
      form.reset();
      if (selectedId) await loadTicketDetail(selectedId);
      toast.success("Admin action completed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Admin action failed.");
    }
  }

  if (loading && !tickets.length) return <LoadingSpinner label="Loading support control center" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#959087]">Admin Support</p>
          <h1 className="mt-1 text-3xl font-black">Support & Control Center</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={search} onChange={event => setSearch(event.target.value)} className="temp-input min-h-11 min-w-72 rounded-xl px-3 outline-none" placeholder="Search user, phone, job, payment, ticket..." />
          <select value={status} onChange={event => setStatus(event.target.value as SupportTicketStatus | "all")} className="temp-input min-h-11 rounded-xl px-3 outline-none">
            {statuses.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card className="p-4">
          <div className="grid gap-2">
            {tickets.map(ticket => (
              <button key={ticket.id} onClick={() => setSelectedId(ticket.id)} className={`rounded-xl p-3 text-left ${ticket.id === selectedId ? "bg-bone text-[#1E1B13]" : "bg-[#2A2A2B]"}`}>
                <div className="flex items-center justify-between gap-2"><p className="font-black">{ticket.subject}</p><StatusBadge status={ticket.status} /></div>
                <p className="mt-1 text-xs">{ticket.userName ?? ticket.userId}</p>
                <p className="mt-1 truncate text-xs opacity-75">{ticket.lastMessage ?? ticket.id}</p>
              </button>
            ))}
            {!tickets.length && <EmptyState title="No tickets found" body="Try a different status or search term." />}
          </div>
        </Card>

        <div className="grid gap-4">
          {selectedTicket && detail ? (
            <>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-black">{selectedTicket.subject}</h2><StatusBadge status={selectedTicket.status} /></div>
                    <p className="mt-2 text-sm text-[#CCC6BB]">Ticket {selectedTicket.id}</p>
                    <p className="mt-1 text-sm text-[#959087]">{selectedTicket.userName} - {selectedTicket.userEmail ?? "No email"} - {selectedTicket.userPhone ?? "No phone"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["open", "pending", "resolved", "rejected", "escalated"] as SupportTicketStatus[]).map(next => (
                      <Button key={next} type="button" variant={next === selectedTicket.status ? "primary" : "secondary"} onClick={() => void mutateTicket({ action: "status", status: next, reason: `Ticket marked ${next}` }, "Ticket status updated.")}>{next}</Button>
                    ))}
                  </div>
                </div>
                <form onSubmit={assignTicket} className="mt-4 flex flex-wrap gap-2">
                  <input name="assignedAdminId" defaultValue={selectedTicket.assignedAdminId ?? ""} className="temp-input min-h-11 min-w-72 rounded-xl px-3 outline-none" placeholder="Assign to admin UID" />
                  <Button type="submit" variant="secondary">Assign ticket</Button>
                </form>
              </Card>

              <div className="grid gap-4 2xl:grid-cols-[1fr_360px]">
                <Card className="p-5">
                  <h3 className="text-lg font-black">Conversation</h3>
                  <div className="mt-4 grid min-h-64 gap-3">
                    {detail.messages.map(message => <div key={message.id} className={`max-w-[86%] rounded-xl p-3 text-sm ${message.senderRole === "admin" ? "ml-auto bg-bone text-[#1E1B13]" : "bg-[#2A2A2B]"}`}><p>{message.body}</p></div>)}
                  </div>
                  <form onSubmit={reply} className="mt-4 flex gap-2"><input name="message" required className="temp-input min-w-0 flex-1 rounded-xl p-3 outline-none" placeholder="Reply to user" /><Button type="submit">Reply</Button></form>
                </Card>

                <Card className="p-5">
                  <h3 className="text-lg font-black">User Context</h3>
                  <Info label="Role" value={String(detail.user?.role ?? selectedTicket.userRole ?? "Unknown")} />
                  <Info label="User ID" value={selectedTicket.userId} />
                  <Info label="Job ID" value={selectedTicket.relatedJobId ?? "None"} />
                  <Info label="Application ID" value={selectedTicket.relatedApplicationId ?? "None"} />
                  <Info label="Payment ID" value={selectedTicket.relatedPaymentId ?? "None"} />
                  <Info label="Verification" value={String(detail.user?.verificationStatus ?? "Unknown")} />
                  <Info label="Service fee status" value={String(detail.user?.lockReason ?? (detail.user?.isLocked ? "Locked" : "Active"))} />
                  <Info label="Payment records" value={String(detail.transactions.length)} />
                  <Info label="Applications" value={String(detail.applications.length)} />
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                    <Button type="button" variant="secondary" onClick={() => setActionOpen("profile")}>Edit profile fields</Button>
                    <Button type="button" variant="secondary" onClick={() => setActionOpen("role")}>Update role</Button>
                    <Button type="button" variant="secondary" onClick={() => setActionOpen("kyc")}>KYC review</Button>
                    <Button type="button" variant="secondary" onClick={() => setActionOpen("moderate")}>Suspend / unsuspend</Button>
                    <Button type="button" variant="secondary" onClick={() => setActionOpen("auth")}>Auth & security</Button>
                    <Button type="button" variant="secondary" onClick={() => setActionOpen("application")}>Fix application</Button>
                    <Button type="button" variant="secondary" onClick={() => setActionOpen("job")}>Cancel job</Button>
                  </div>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-5">
                  <h3 className="text-lg font-black">Internal Notes</h3>
                  <div className="mt-3 grid gap-2">{detail.notes.map(note => <p key={note.id} className="rounded-xl bg-[#2A2A2B] p-3 text-sm">{note.body}</p>)}</div>
                  <form onSubmit={addNote} className="mt-4 grid gap-2"><textarea name="note" required className="temp-input min-h-24 rounded-xl p-3 outline-none" placeholder="Private note for admins only" /><Button type="submit">Add internal note</Button></form>
                </Card>
                <Card className="p-5">
                  <h3 className="text-lg font-black">Action Timeline</h3>
                  <div className="mt-3 grid gap-2">{detail.logs.map(log => <p key={String(log.id)} className="rounded-xl bg-[#2A2A2B] p-3 text-sm"><strong>{String(log.actionType ?? log.action ?? "Admin action")}</strong><br />{String(log.reason ?? log.status ?? "")}</p>)}</div>
                  {!detail.logs.length && <p className="mt-3 text-sm text-[#959087]">No related audit events yet.</p>}
                </Card>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <HistoryCard title="Service fee and payment records" items={detail.transactions} primary="type" secondary="status" />
                <HistoryCard title="Applications" items={detail.applications} primary="jobTitle" secondary="status" />
                <HistoryCard title="Notification history" items={detail.notifications ?? []} primary="title" secondary="body" />
              </div>
            </>
          ) : <EmptyState title="Select a ticket" body="Ticket details, notes, logs, and controlled actions will appear here." />}
        </div>
      </div>

      {actionOpen && selectedTicket && (
        <AppModal title="Confirm admin action" eyebrow="Controlled action" onClose={() => setActionOpen(null)}>
          <form onSubmit={adminAction} className="mt-5 grid gap-3">
            <input type="hidden" name="ticketId" value={selectedTicket.id} />
            <input type="hidden" name="userId" value={selectedTicket.userId} />
            {actionOpen === "profile" && <ProfileActionFields />}
            {actionOpen === "role" && <RoleActionFields />}
            {actionOpen === "kyc" && <KycActionFields />}
            {actionOpen === "moderate" && <ModerationActionFields />}
            {actionOpen === "auth" && <AuthActionFields />}
            {actionOpen === "application" && <ApplicationActionFields />}
            {actionOpen === "job" && <JobActionFields />}
            <textarea name="reason" required className="temp-input min-h-24 rounded-xl p-3 outline-none" placeholder="Required reason. This is written to audit logs." />
            <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">Confirm carefully. This controlled action will be validated server-side and written to the admin audit log.</p>
            <Button type="submit">Confirm action</Button>
          </form>
        </AppModal>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SupportTicketStatus }) {
  return <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-black capitalize">{status}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <p className="mt-3 flex justify-between gap-3 text-sm"><span className="text-[#959087]">{label}</span><strong className="text-right">{value}</strong></p>;
}

function ProfileActionFields() {
  return (
    <>
      <input type="hidden" name="action" value="update_user_profile" />
      <input name="displayName" className="temp-input rounded-xl p-3 outline-none" placeholder="New display name" />
    </>
  );
}

function RoleActionFields() {
  return (
    <>
      <input type="hidden" name="action" value="update_user_role" />
      <select name="role" required className="temp-input rounded-xl p-3 outline-none"><option value="worker">Worker</option><option value="client">Client</option><option value="admin">Admin</option></select>
    </>
  );
}

function KycActionFields() {
  return (
    <>
      <input type="hidden" name="action" value="review_kyc" />
      <select name="status" required className="temp-input rounded-xl p-3 outline-none"><option value="approved">Approve KYC</option><option value="rejected">Reject KYC</option></select>
    </>
  );
}

function ModerationActionFields() {
  return (
    <>
      <select name="action" required className="temp-input rounded-xl p-3 outline-none"><option value="suspend_user">Suspend account</option><option value="unsuspend_user">Unsuspend account</option></select>
    </>
  );
}

function AuthActionFields() {
  return (
    <>
      <select name="action" required className="temp-input rounded-xl p-3 outline-none">
        <option value="reset_password_email">Send password reset email</option>
        <option value="resend_verification_email">Send verification reminder</option>
        <option value="force_logout">Force logout sessions</option>
      </select>
    </>
  );
}

function ApplicationActionFields() {
  return (
    <>
      <input type="hidden" name="action" value="set_application_status" />
      <input name="applicationId" required className="temp-input rounded-xl p-3 outline-none" placeholder="Application ID" />
      <select name="status" required className="temp-input rounded-xl p-3 outline-none"><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="completion_requested">Completion requested</option><option value="payment_sent">Payment sent</option><option value="completed">Completed</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option></select>
    </>
  );
}

function JobActionFields() {
  return (
    <>
      <input type="hidden" name="action" value="cancel_job" />
      <input name="jobId" required className="temp-input rounded-xl p-3 outline-none" placeholder="Job ID to cancel" />
    </>
  );
}

function HistoryCard({ title, items, primary, secondary }: { title: string; items: Array<Record<string, unknown>>; primary: string; secondary: string }) {
  return (
    <Card className="p-5">
      <h3 className="text-lg font-black">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.slice(0, 8).map((item, index) => (
          <div key={String(item.id ?? index)} className="rounded-xl bg-[#2A2A2B] p-3 text-sm">
            <p className="font-black text-[#FFFBFF]">{String(item[primary] ?? item.id ?? "Record")}</p>
            <p className="mt-1 text-[#959087]">{String(item[secondary] ?? "")}</p>
          </div>
        ))}
        {!items.length && <p className="text-sm text-[#959087]">No records found.</p>}
      </div>
    </Card>
  );
}
