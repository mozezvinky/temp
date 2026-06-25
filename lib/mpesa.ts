import "server-only";

export function normalizeMpesaPhone(input: unknown) {
  const cleaned = String(input ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (/^0[17]\d{8}$/.test(cleaned)) return `254${cleaned.slice(1)}`;
  if (/^254[17]\d{8}$/.test(cleaned)) return cleaned;
  return null;
}
