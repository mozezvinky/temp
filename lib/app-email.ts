import "server-only";

import { Resend } from "resend";

export type AppEmailResult = {
  attempted: boolean;
  resendEmailId: string | null;
  skippedReason?: "missing_recipient" | "missing_api_key";
};

export function appEmailSender() {
  return process.env.RESEND_FROM_EMAIL ?? "Copic <onboarding@resend.dev>";
}

export async function sendAppEmail(to: string | undefined | null, subject: string, html: string, idempotencyKey?: string) {
  const recipient = typeof to === "string" ? to.trim() : "";
  const apiKey = process.env.RESEND_API_KEY;
  if (!recipient) return { attempted: false, resendEmailId: null, skippedReason: "missing_recipient" } satisfies AppEmailResult;
  if (!apiKey) return { attempted: false, resendEmailId: null, skippedReason: "missing_api_key" } satisfies AppEmailResult;
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from: appEmailSender(),
      to: recipient,
      subject,
      html
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );
  if (error) throw new Error("Unable to send email. Check Resend sender settings.");
  const resendEmailId = typeof data?.id === "string" ? data.id : null;
  return { attempted: true, resendEmailId } satisfies AppEmailResult;
}
