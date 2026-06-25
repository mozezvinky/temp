import { adminDb } from "@/lib/firebase-admin";
import { adminErrorStatus, requireAdmin, writeAdminAuditLog } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { localDb } from "@/lib/local-sql";
import type { SupportTicketStatus } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const statuses: SupportTicketStatus[] = ["open", "pending", "resolved", "rejected", "escalated"];

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request, "tickets:read");
    const { id } = await context.params;

    if (isSqlBackend()) {
      const ticket = localDb().prepare("SELECT * FROM support_tickets WHERE id = ?").get(id);
      if (!ticket) return NextResponse.json({ error: "Ticket was not found." }, { status: 404 });
      const messages = localDb().prepare("SELECT * FROM ticket_messages WHERE ticketId = ? ORDER BY createdAt ASC").all(id);
      const notes = localDb().prepare("SELECT * FROM ticket_internal_notes WHERE ticketId = ? ORDER BY createdAt ASC").all(id);
      const user = localDb().prepare("SELECT * FROM users WHERE uid = ?").get(String(ticket.userId));
      const transactions = localDb().prepare("SELECT * FROM service_fee_payments WHERE workerId = ? ORDER BY submittedAt DESC LIMIT 25").all(String(ticket.userId));
      const applications = localDb().prepare("SELECT * FROM applications WHERE clientId = ? OR workerId = ? ORDER BY updatedAt DESC LIMIT 25").all(String(ticket.userId), String(ticket.userId));
      const notifications = localDb().prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 25").all(String(ticket.userId));
      const logs = localDb().prepare("SELECT * FROM admin_audit_logs WHERE targetUserId = ? OR linkedTicketId = ? ORDER BY createdAt DESC LIMIT 25").all(String(ticket.userId), id);
      return NextResponse.json({ ticket, messages, notes, user, transactions, applications, notifications, logs });
    }

    const ticketSnap = await adminDb().collection("supportTickets").doc(id).get();
    if (!ticketSnap.exists) return NextResponse.json({ error: "Ticket was not found." }, { status: 404 });
    const ticket = { id: ticketSnap.id, ...ticketSnap.data() };
    const userId = String(ticketSnap.data()?.userId ?? "");
    const [messages, notes, user, transactions, applications, notifications, userLogs] = await Promise.all([
      ticketSnap.ref.collection("messages").orderBy("createdAt", "asc").get(),
      ticketSnap.ref.collection("internalNotes").orderBy("createdAt", "asc").get(),
      userId ? adminDb().collection("users").doc(userId).get() : Promise.resolve(null),
      userId ? adminDb().collection("service_fee_payments").where("workerId", "==", userId).limit(25).get() : Promise.resolve(null),
      userId ? Promise.all([
        adminDb().collection("applications").where("workerId", "==", userId).limit(15).get(),
        adminDb().collection("applications").where("clientId", "==", userId).limit(15).get()
      ]) : Promise.resolve(null),
      userId ? adminDb().collection("notifications").where("userId", "==", userId).limit(25).get() : Promise.resolve(null),
      userId ? adminDb().collection("admin_audit_logs").where("targetUserId", "==", userId).limit(25).get() : Promise.resolve(null)
    ]);
    const applicationDocs = applications ? [...applications[0].docs, ...applications[1].docs] : [];
    return NextResponse.json({
      ticket,
      messages: messages.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      notes: notes.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      user: user?.exists ? { id: user.id, ...user.data() } : null,
      transactions: transactions?.docs.map(doc => ({ id: doc.id, ...doc.data() })) ?? [],
      applications: applicationDocs.map(doc => ({ id: doc.id, ...doc.data() })),
      notifications: notifications?.docs.map(doc => ({ id: doc.id, ...doc.data() })) ?? [],
      logs: userLogs?.docs.map(doc => ({ id: doc.id, ...doc.data() })) ?? []
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load ticket." }, { status: adminErrorStatus(error) });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request, "tickets:write");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const reason = String(body.reason ?? action).trim();
    if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });

    if (action === "reply") {
      const message = String(body.message ?? "").trim();
      if (!message) return NextResponse.json({ error: "Reply message is required." }, { status: 400 });
      await addMessage(request, admin, id, message);
      return NextResponse.json({ success: true });
    }

    if (action === "note") {
      const note = String(body.note ?? "").trim();
      if (!note) return NextResponse.json({ error: "Internal note is required." }, { status: 400 });
      await addNote(request, admin, id, note);
      return NextResponse.json({ success: true });
    }

    if (action === "status") {
      const status = String(body.status ?? "") as SupportTicketStatus;
      if (!statuses.includes(status)) return NextResponse.json({ error: "Choose a valid ticket status." }, { status: 400 });
      await updateStatus(request, admin, id, status, reason);
      return NextResponse.json({ success: true });
    }

    if (action === "assign") {
      const assignedAdminId = String(body.assignedAdminId ?? "").trim();
      await assignTicket(request, admin, id, assignedAdminId || null, reason);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unsupported ticket action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update ticket." }, { status: adminErrorStatus(error) });
  }
}

async function addMessage(request: NextRequest, admin: Awaited<ReturnType<typeof requireAdmin>>, ticketId: string, message: string) {
  if (isSqlBackend()) {
    localDb().prepare("INSERT INTO ticket_messages (id, ticketId, senderId, senderRole, body, attachments, createdAt) VALUES (?, ?, ?, 'admin', ?, '[]', ?)")
      .run(crypto.randomUUID(), ticketId, admin.uid, message, new Date().toISOString());
    localDb().prepare("UPDATE support_tickets SET lastMessage = ?, unreadForUser = 1, unreadForAdmin = 0, status = 'pending', updatedAt = ? WHERE id = ?")
      .run(message, new Date().toISOString(), ticketId);
  } else {
    const ticketRef = adminDb().collection("supportTickets").doc(ticketId);
    const messageRef = ticketRef.collection("messages").doc();
    await adminDb().batch()
      .set(messageRef, { id: messageRef.id, ticketId, senderId: admin.uid, senderRole: "admin", body: message, attachments: [], createdAt: FieldValue.serverTimestamp() })
      .set(ticketRef, { lastMessage: message, unreadForUser: true, unreadForAdmin: false, status: "pending", updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      .commit();
  }
  await writeAdminAuditLog(request, { admin, actionType: "ticket.reply", newValue: { message }, reason: "Admin replied to ticket", linkedTicketId: ticketId });
}

async function addNote(request: NextRequest, admin: Awaited<ReturnType<typeof requireAdmin>>, ticketId: string, note: string) {
  if (isSqlBackend()) {
    localDb().prepare("INSERT INTO ticket_internal_notes (id, ticketId, adminId, body, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), ticketId, admin.uid, note, new Date().toISOString());
  } else {
    const noteRef = adminDb().collection("supportTickets").doc(ticketId).collection("internalNotes").doc();
    await noteRef.set({ id: noteRef.id, ticketId, adminId: admin.uid, adminEmail: admin.email, body: note, createdAt: FieldValue.serverTimestamp() });
  }
  await writeAdminAuditLog(request, { admin, actionType: "ticket.note", newValue: { note }, reason: "Admin added internal note", linkedTicketId: ticketId });
}

async function updateStatus(request: NextRequest, admin: Awaited<ReturnType<typeof requireAdmin>>, ticketId: string, status: SupportTicketStatus, reason: string) {
  const oldValue = isSqlBackend()
    ? localDb().prepare("SELECT status FROM support_tickets WHERE id = ?").get(ticketId)
    : await adminDb().collection("supportTickets").doc(ticketId).get().then(snapshot => snapshot.data()?.status ?? null);
  if (isSqlBackend()) {
    localDb().prepare("UPDATE support_tickets SET status = ?, updatedAt = ? WHERE id = ?").run(status, new Date().toISOString(), ticketId);
  } else {
    await adminDb().collection("supportTickets").doc(ticketId).set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await writeAdminAuditLog(request, { admin, actionType: "ticket.status", oldValue, newValue: { status }, reason, linkedTicketId: ticketId });
}

async function assignTicket(request: NextRequest, admin: Awaited<ReturnType<typeof requireAdmin>>, ticketId: string, assignedAdminId: string | null, reason: string) {
  if (isSqlBackend()) {
    localDb().prepare("UPDATE support_tickets SET assignedAdminId = ?, updatedAt = ? WHERE id = ?").run(assignedAdminId, new Date().toISOString(), ticketId);
  } else {
    await adminDb().collection("supportTickets").doc(ticketId).set({ assignedAdminId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await writeAdminAuditLog(request, { admin, targetUserId: assignedAdminId, actionType: "ticket.assign", newValue: { assignedAdminId }, reason, linkedTicketId: ticketId });
}
