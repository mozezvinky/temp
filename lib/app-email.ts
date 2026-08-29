import "server-only";

import { Resend } from "resend";

export async function sendAppEmail(to: string | undefined | null, subject: string, html: string, idempotencyKey?: string) {
  const recipient = typeof to === "string" ? to.trim() : "";
  const apiKey = process.env.RESEND_API_KEY;
  if (!recipient || !apiKey) return false;
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(
    {
      from: process.env.RESEND_FROM_EMAIL ?? "COPIC <notifications@copic.co.ke>",
      to: recipient,
      subject,
      html
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );
  if (error) throw new Error("Unable to send email. Check Resend sender settings.");
  return true;
}
