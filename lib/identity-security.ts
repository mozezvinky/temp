import "server-only";

import { createHmac } from "node:crypto";

export function nationalIdHash(nationalId: string) {
  const secret = process.env.OTP_SECRET;
  if (!secret) throw new Error("Identity security configuration is missing.");
  return createHmac("sha256", secret).update(nationalId.trim().toUpperCase()).digest("hex");
}
