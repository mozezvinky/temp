import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth } from "@/lib/firebase-admin";
export class EmailVerificationError extends Error {
  readonly status = 403;
  constructor() { super("EMAIL_NOT_VERIFIED"); }
}
/** Fresh Firebase Auth state, never profile flags or browser-provided booleans. */
export async function verifyVerifiedIdToken(token: string): Promise<DecodedIdToken> {
  const decoded = await adminAuth().verifyIdToken(token, true);
  const account = await adminAuth().getUser(decoded.uid);
  if (account.disabled || !account.emailVerified) throw new EmailVerificationError();
  return { ...decoded, email_verified: true, email: account.email };
}
