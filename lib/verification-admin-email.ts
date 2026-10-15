import "server-only";

import { sendAppEmail } from "@/lib/app-email";
import { copicEmailLayout } from "@/lib/notifications-server";

export async function sendVerificationAdminEmail(input: { userId: string; fullName: string; role: string; submittedAt: string }) {
  try {
    const result = await sendAppEmail(
      process.env.ADMIN_EMAIL?.trim() || "kelvinodiambo@gmail.com",
      "New ID verification awaiting review on COPIC",
      copicEmailLayout({
        title: "ID verification awaiting review",
        greetingName: "Admin",
        message: `${input.fullName} (${input.role}) has submitted their ID for verification. Sign in to the admin dashboard to review the submission.`,
        ctaLabel: "Review ID verifications",
        ctaHref: "/admin/verification"
      }),
      `id-verification:${input.userId}:${input.submittedAt}`
    );
    if (!result.attempted) {
      console.error("[kyc-admin-email] Notification skipped", { userId: input.userId, reason: result.skippedReason });
    }
  } catch (error) {
    console.error("[kyc-admin-email] Notification failed", { userId: input.userId, message: error instanceof Error ? error.message : "Unknown email error" });
  }
}
