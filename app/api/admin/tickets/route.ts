import { adminDb } from "@/lib/firebase-admin";
import { adminErrorStatus, requireAdmin, writeAdminAuditLog } from "@/lib/admin-security";
import { isSqlBackend } from "@/lib/data-backend";
import { localDb } from "@/lib/local-sql";
import type { SupportTicketStatus } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const statuses: SupportTicketStatus[] = ["open", "pending", "resolved", "rejected", "escalated"];

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "tickets:read");
    const { searchParams } = request.nextUrl;
    const status = statuses.includes(searchParams.get("status") as SupportTicketStatus) ? searchParams.get("status") : "";
    const search = (searchParams.get("search") ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 100);

    if (isSqlBackend()) {
      const rows = localDb().prepare(`SELECT * FROM support_tickets ${status ? "WHERE status = ?" : ""} ORDER BY updatedAt DESC LIMIT ?`)
        .all(...(status ? [status, limit] : [limit]));
      return NextResponse.json({ tickets: rows.filter(row => matchesTicketSearch(row, search)) });
    }

    const ref = status
      ? adminDb().collection("supportTickets").where("status", "==", status).orderBy("updatedAt", "desc").limit(limit)
      : adminDb().collection("supportTickets").orderBy("updatedAt", "desc").limit(limit);
    const snapshot = await ref.get();
    const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(ticket => matchesTicketSearch(ticket, search));
    return NextResponse.json({ tickets });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load tickets." }, { status: adminErrorStatus(error) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, "tickets:write");
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!userId || !subject || !message) return NextResponse.json({ error: "User, subject, and message are required." }, { status: 400 });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    if (isSqlBackend()) {
      const user = localDb().prepare("SELECT * FROM users WHERE uid = ?").get(userId);
      if (!user) return NextResponse.json({ error: "User was not found." }, { status: 404 });
      localDb().prepare(`
        INSERT INTO support_tickets (id, userId, userName, userEmail, userPhone, userRole, subject, status, lastMessage, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
      `).run(id, userId, String(user.displayName ?? "User"), typeof user.email === "string" ? user.email : null, typeof user.phoneNumber === "string" ? user.phoneNumber : null, String(user.role), subject, message, now, now);
      localDb().prepare("INSERT INTO ticket_messages (id, ticketId, senderId, senderRole, body, attachments, createdAt) VALUES (?, ?, ?, 'admin', ?, '[]', ?)")
        .run(crypto.randomUUID(), id, admin.uid, message, now);
    } else {
      const user = await adminDb().collection("users").doc(userId).get();
      if (!user.exists) return NextResponse.json({ error: "User was not found." }, { status: 404 });
      const data = user.data() ?? {};
      const ticketRef = adminDb().collection("supportTickets").doc(id);
      const messageRef = ticketRef.collection("messages").doc();
      await adminDb().batch()
        .set(ticketRef, {
          id,
          userId,
          userName: data.displayName ?? "User",
          userEmail: data.email ?? null,
          userPhone: data.phoneNumber ?? null,
          userRole: data.role ?? "worker",
          subject,
          status: "open",
          lastMessage: message,
          unreadForUser: true,
          unreadForAdmin: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        })
        .set(messageRef, { id: messageRef.id, ticketId: id, senderId: admin.uid, senderRole: "admin", body: message, attachments: [], createdAt: FieldValue.serverTimestamp() })
        .commit();
    }

    await writeAdminAuditLog(request, { admin, targetUserId: userId, actionType: "ticket.create", newValue: { ticketId: id, subject }, reason: "Admin created support ticket", linkedTicketId: id });
    return NextResponse.json({ success: true, ticketId: id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create ticket." }, { status: adminErrorStatus(error) });
  }
}

function matchesTicketSearch(ticket: Record<string, unknown>, search: string) {
  if (!search) return true;
  return ["id", "userId", "userName", "userEmail", "userPhone", "relatedJobId", "relatedApplicationId", "relatedPaymentId"]
    .some(key => String(ticket[key] ?? "").toLowerCase().includes(search));
}
