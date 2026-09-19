/** Format validation only; Firebase verification establishes mailbox ownership. */
export function validSignupEmail(email: string) {
  return /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email.trim());
}
