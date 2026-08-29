import "server-only";

import { sendAppEmail } from "@/lib/app-email";
import type { Firestore, Transaction, WriteBatch } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

export type CopicNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  emailSubject?: string;
  emailEnabled?: boolean;
  eventId: string;
  essential?: boolean;
};

function notificationDocId(eventId: string) {
  return eventId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
}

function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? process.env.VERCEL_URL ?? "https://www.copic.co.ke";
  const withProtocol = configured.startsWith("http://") || configured.startsWith("https://") ? configured : `https://${configured}`;
  return withProtocol.replace(/\/+$/, "");
}

export function safeAppLink(path?: string | null) {
  const raw = typeof path === "string" && path.trim() ? path.trim() : "/notifications";
  if (!raw.startsWith("/") || raw.startsWith("//")) return `${appBaseUrl()}/notifications`;
  return `${appBaseUrl()}${raw}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] ?? char));
}

function firstName(displayName: unknown) {
  const name = typeof displayName === "string" ? displayName.trim() : "";
  return name ? name.split(/\s+/)[0] : "there";
}

export function copicEmailLayout(input: { title: string; greetingName?: string; message: string; ctaLabel?: string; ctaHref?: string | null }) {
  const href = safeAppLink(input.ctaHref);
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f6f3;font-family:Arial,Helvetica,sans-serif;color:#17210f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f3;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe7dc;border-radius:18px;overflow:hidden;">
            <tr><td style="padding:26px 28px 12px;font-size:20px;font-weight:900;letter-spacing:.04em;color:#203300;">COPIC</td></tr>
            <tr><td style="padding:0 28px 8px;"><h1 style="margin:0;font-size:24px;line-height:1.25;color:#111827;">${escapeHtml(input.title)}</h1></td></tr>
            <tr><td style="padding:8px 28px 0;font-size:15px;line-height:1.65;color:#334155;">Hi ${escapeHtml(input.greetingName ?? "there")},</td></tr>
            <tr><td style="padding:10px 28px 20px;font-size:15px;line-height:1.65;color:#334155;">${escapeHtml(input.message)}</td></tr>
            <tr><td style="padding:0 28px 28px;"><a href="${href}" style="display:inline-block;background:#9df12d;color:#203300;text-decoration:none;font-weight:900;border-radius:12px;padding:13px 18px;">${escapeHtml(input.ctaLabel ?? "Open COPIC")}</a></td></tr>
            <tr><td style="border-top:1px solid #e5e7eb;padding:18px 28px 24px;font-size:12px;line-height:1.5;color:#64748b;">COPIC<br>People &bull; Income &bull; Careers</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function notificationPayload(input: CopicNotificationInput, id: string) {
  return {
    id,
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.message,
    read: false,
    href: input.link ?? "/notifications",
    eventId: input.eventId,
    createdAt: FieldValue.serverTimestamp()
  };
}

export function setNotification(writer: Transaction | WriteBatch, db: Firestore, input: CopicNotificationInput) {
  const ref = db.collection("notifications").doc(notificationDocId(input.eventId));
  const payload = notificationPayload(input, ref.id);
  if ("commit" in writer) {
    writer.set(ref, payload, { merge: true });
  } else {
    writer.set(ref, payload, { merge: true });
  }
  return ref.id;
}

export async function notifyUser(db: Firestore, input: CopicNotificationInput) {
  const ref = db.collection("notifications").doc(notificationDocId(input.eventId));
  let created = false;
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) return;
    setNotification(transaction, db, input);
    created = true;
  });
  if (created) {
    void sendNotificationEmail(db, input).catch(error => {
      console.error("[COPIC NOTIFICATION] email failed", safeNotificationLog(input, { emailStatus: "failed", error }));
    });
  }
  return { id: ref.id, created };
}

export async function sendNotificationEmail(db: Firestore, input: CopicNotificationInput) {
  if (input.emailEnabled === false) return false;
  const notificationRef = db.collection("notifications").doc(notificationDocId(input.eventId));
  const userSnap = await db.collection("users").doc(input.userId).get();
  const user = userSnap.data() ?? {};
  if (input.essential !== true && user.emailNotificationsEnabled === false) return false;
  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (!email) return false;

  const notificationSnap = await notificationRef.get();
  if (!notificationSnap.exists) return false;
  if (notificationSnap.data()?.emailSentAt) return false;
  await notificationRef.set({ emailAttemptedAt: FieldValue.serverTimestamp() }, { merge: true });
  try {
    const sent = await sendAppEmail(
      email,
      input.emailSubject ?? input.title,
      copicEmailLayout({
        title: input.title,
        greetingName: firstName(user.displayName),
        message: input.message,
        ctaLabel: "Open COPIC",
        ctaHref: input.link
      }),
      input.eventId
    );
    await notificationRef.set({
      emailStatus: sent ? "sent" : "skipped",
      emailSentAt: sent ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    console.info("[COPIC NOTIFICATION]", safeNotificationLog(input, { inAppCreated: true, emailAttempted: true, emailStatus: sent ? "sent" : "skipped" }));
    return sent;
  } catch (error) {
    await notificationRef.set({
      emailStatus: "failed",
      emailLastError: error instanceof Error ? error.message : "Unknown email error",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    console.error("[COPIC EMAIL]", safeNotificationLog(input, { emailStatus: "failed", error }));
    return false;
  }
}

export function sendNotificationEmailsAfterCommit(db: Firestore, inputs: CopicNotificationInput[]) {
  inputs.forEach(input => {
    void sendNotificationEmail(db, input).catch(error => {
      console.error("[COPIC NOTIFICATION] email failed", safeNotificationLog(input, { emailStatus: "failed", error }));
    });
  });
}

function safeNotificationLog(input: CopicNotificationInput, extra: Record<string, unknown>) {
  return {
    eventId: input.eventId,
    type: input.type,
    recipientUserId: input.userId,
    ...extra
  };
}
