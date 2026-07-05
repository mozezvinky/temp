import { isSqlBackend } from "@/lib/data-backend";
import { adminDb } from "@/lib/firebase-admin";
import { localDb } from "@/lib/local-sql";
import { authErrorStatus, requireVerifiedServerUser } from "@/lib/server-auth";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireVerifiedServerUser(request);
    if (user.profile.role === "admin") return NextResponse.json({ error: "Use the admin tools for moderation reports." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const completedJobId = String(body.completedJobId ?? "").trim();
    const relatedJobId = String(body.jobId ?? "").trim();
    const relatedApplicationId = String(body.applicationId ?? "").trim();
    const title = String(body.title ?? "Completed job issue").trim().slice(0, 120);
    const reason = String(body.reason ?? "").trim().slice(0, 2000);
    if (!completedJobId || !reason) return NextResponse.json({ error: "Completed job ID and report reason are required." }, { status: 400 });
    const id = crypto.randomUUID();
    const ticketId = crypto.randomUUID();
    const now = new Date().toISOString();
    const message = `${reason}\n\nCompleted Job ID: ${completedJobId}${relatedJobId ? `\nJob ID: ${relatedJobId}` : ""}${relatedApplicationId ? `\nApplication ID: ${relatedApplicationId}` : ""}`;

    if (isSqlBackend()) {
      localDb().prepare(`
        INSERT INTO reports (id, userId, userName, userRole, title, reason, status, completedJobId, relatedJobId, relatedApplicationId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
      `).run(id, user.uid, user.profile.displayName ?? "User", user.profile.role, title, reason, completedJobId, relatedJobId || null, relatedApplicationId || null, now, now);
      localDb().prepare(`
        INSERT INTO support_tickets (id, userId, userName, userEmail, userPhone, userRole, subject, status, relatedJobId, relatedApplicationId, lastMessage, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
      `).run(ticketId, user.uid, user.profile.displayName ?? "User", user.email ?? user.profile.email ?? null, user.profile.phoneNumber ?? null, user.profile.role, title, relatedJobId || null, relatedApplicationId || null, message, now, now);
      localDb().prepare("INSERT INTO ticket_messages (id, ticketId, senderId, senderRole, body, attachments, createdAt) VALUES (?, ?, ?, ?, ?, '[]', ?)")
        .run(crypto.randomUUID(), ticketId, user.uid, user.profile.role, message, now);
      return NextResponse.json({ success: true, reportId: id, ticketId });
    }

    const db = adminDb();
    const reportRef = db.collection("reports").doc(id);
    const ticketRef = db.collection("supportTickets").doc(ticketId);
    const messageRef = ticketRef.collection("messages").doc();
    await db.batch()
      .set(reportRef, {
        id,
        userId: user.uid,
        userName: user.profile.displayName ?? "User",
        userRole: user.profile.role,
        title,
        reason,
        status: "open",
        completedJobId,
        relatedJobId: relatedJobId || null,
        relatedApplicationId: relatedApplicationId || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      })
      .set(ticketRef, {
        id: ticketId,
        userId: user.uid,
        userName: user.profile.displayName ?? "User",
        userEmail: user.email ?? user.profile.email ?? null,
        userPhone: user.profile.phoneNumber ?? null,
        userRole: user.profile.role,
        subject: title,
        status: "open",
        relatedJobId: relatedJobId || null,
        relatedApplicationId: relatedApplicationId || null,
        lastMessage: message,
        unreadForUser: false,
        unreadForAdmin: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      })
      .set(messageRef, { id: messageRef.id, ticketId, senderId: user.uid, senderRole: user.profile.role, body: message, attachments: [], createdAt: FieldValue.serverTimestamp() })
      .commit();
    return NextResponse.json({ success: true, reportId: id, ticketId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit report." }, { status: authErrorStatus(error) });
  }
}
