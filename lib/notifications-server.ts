import "server-only";

import { sendAppEmail } from "@/lib/app-email";
import { COPIC_PRODUCTION_APP_URL } from "@/lib/production-env";
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
  return COPIC_PRODUCTION_APP_URL;
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
    await sendNotificationEmail(db, input);
  }
  return { id: ref.id, created };
}

export async function sendNotificationEmail(db: Firestore, input: CopicNotificationInput) {
  if (input.emailEnabled === false) {
    logCopicEmail(input, { recipientEmailFound: false, resendAttempted: false, resendEmailId: null });
    return false;
  }
  const notificationRef = db.collection("notifications").doc(notificationDocId(input.eventId));
  const userSnap = await db.collection("users").doc(input.userId).get();
  const user = userSnap.data() ?? {};
  const email = typeof user.email === "string" ? user.email.trim() : "";
  const recipientEmailFound = !!email;
  if (!recipientEmailFound) {
    logCopicEmail(input, { recipientEmailFound, resendAttempted: false, resendEmailId: null, error: "Recipient email not found." });
    return false;
  }
  if (input.essential !== true && user.emailNotificationsEnabled === false) {
    logCopicEmail(input, { recipientEmailFound, resendAttempted: false, resendEmailId: null, error: "Recipient disabled notification emails." });
    return false;
  }

  let claimed = false;
  await db.runTransaction(async transaction => {
    const notificationSnap = await transaction.get(notificationRef);
    if (!notificationSnap.exists) return;
    const notification = notificationSnap.data() ?? {};
    if (notification.emailSentAt || notification.emailAttemptedAt || notification.emailStatus === "sending") return;
    transaction.set(notificationRef, {
      emailStatus: "sending",
      emailAttemptedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    claimed = true;
  });
  if (!claimed) {
    logCopicEmail(input, { recipientEmailFound, resendAttempted: false, resendEmailId: null, error: "Email already attempted or notification missing." });
    return false;
  }
  try {
    const result = await sendAppEmail(
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
      emailStatus: result.attempted ? "sent" : "skipped",
      emailSentAt: result.attempted ? FieldValue.serverTimestamp() : null,
      resendEmailId: result.resendEmailId,
      emailSkipReason: result.skippedReason ?? null,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    logCopicEmail(input, { recipientEmailFound, resendAttempted: result.attempted, resendEmailId: result.resendEmailId });
    return result.attempted;
  } catch (error) {
    await notificationRef.set({
      emailStatus: "failed",
      emailLastError: error instanceof Error ? error.message : "Unknown email error",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    logCopicEmail(input, {
      recipientEmailFound,
      resendAttempted: true,
      resendEmailId: null,
      error: error instanceof Error ? error.message : "Unknown email error"
    });
    return false;
  }
}

export async function sendNotificationEmailsAfterCommit(db: Firestore, inputs: CopicNotificationInput[]) {
  await Promise.all(inputs.map(input => sendNotificationEmail(db, input).catch(error => {
    logCopicEmail(input, {
      recipientEmailFound: false,
      resendAttempted: false,
      resendEmailId: null,
      error: error instanceof Error ? error.message : "Unknown email error"
    });
    return false;
  })));
}

function logCopicEmail(input: CopicNotificationInput, extra: { recipientEmailFound: boolean; resendAttempted: boolean; resendEmailId: string | null; error?: string }) {
  const payload = {
    eventType: input.type,
    recipientUid: input.userId,
    recipientEmailFound: extra.recipientEmailFound,
    resendAttempted: extra.resendAttempted,
    resendEmailId: extra.resendEmailId,
    ...(extra.error ? { error: extra.error } : {}),
    eventId: input.eventId,
  };
  if (extra.error) console.error("[COPIC EMAIL]", payload);
  else console.info("[COPIC EMAIL]", payload);
}
