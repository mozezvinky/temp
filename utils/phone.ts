export function normalizeKenyanPhone(value: string) {
  const compact = value.replace(/[\s()-]/g, "");
  if (/^0[17]\d{8}$/.test(compact)) return `254${compact.slice(1)}`;
  if (/^\+254[17]\d{8}$/.test(compact)) return compact.slice(1);
  if (/^254[17]\d{8}$/.test(compact)) return compact;
  return null;
}
