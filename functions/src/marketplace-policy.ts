/** Pure marketplace policies shared by server routes, Functions and tests. */
export function serviceKey(name: string) {
  return encodeURIComponent(name.trim().toLowerCase().replace(/\s+/g, " ")).replace(/\./g, "%2E");
}
export function timestampMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value === "object" && "seconds" in value) return Number(value.seconds) * 1000;
  return typeof value === "string" || typeof value === "number" ? new Date(value).getTime() : NaN;
}
export function applicationsOpen(deadline: unknown, now = Date.now()) {
  return deadline == null || deadline === "" || timestampMillis(deadline) > now;
}
export function validLicence(status: unknown, expiry: unknown, now = Date.now()) {
  return ["approved", "verified"].includes(String(status).toLowerCase()) && timestampMillis(expiry) > now;
}
export type PricingPolicy = {
  recommendedRate: number; unit: string; newWorkerMin: number; newWorkerMax: number;
  establishedMin: number; establishedMax: number; fullPricingUnlockJobs: number; widerPricingUnlockJobs: number;
};
export function pricingLevel(completed: number, goodStanding: boolean, policy: PricingPolicy): 1 | 2 | 3 {
  return goodStanding && completed >= policy.fullPricingUnlockJobs ? 3 : completed >= policy.widerPricingUnlockJobs ? 2 : 1;
}
export function allowedPrice(amount: number, unit: string, completed: number, goodStanding: boolean, policy: PricingPolicy, initial?: { rate: number; unit: string }) {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const level = pricingLevel(completed, goodStanding, policy);
  if (level === 3) return true;
  if (level === 1 && initial) return amount === initial.rate && unit === initial.unit;
  return unit === policy.unit && amount >= (level === 1 ? policy.newWorkerMin : policy.establishedMin) && amount <= (level === 1 ? policy.newWorkerMax : policy.establishedMax);
}
export function commissionAmount(earnings: number, rate: number) {
  if (!Number.isFinite(earnings) || earnings <= 0 || !Number.isFinite(rate) || rate < 0 || rate > 1) return 0;
  return Math.round(earnings * rate * 100) / 100;
}
export const funnelStages = ["link_clicked", "signup_started", "account_created", "skill_added", "id_verification_started", "id_verification_submitted", "id_verified", "first_application", "first_job", "first_completed_job"] as const;
export type FunnelStage = typeof funnelStages[number];
export const cellSizes = [45, 10, 1, 0.1, 0.02] as const;
export function cellId(size: number, latitude: number, longitude: number) {
  return `${size}_${Math.floor((latitude + 90) / size)}_${Math.floor((longitude + 180) / size)}`;
}
export function visibleCells(west: number, south: number, east: number, north: number) {
  if (![west, south, east, north].every(Number.isFinite) || west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) throw new Error("Invalid map bounds.");
  const size = [...cellSizes].reverse().find(step => (Math.floor((east + 180) / step) - Math.floor((west + 180) / step) + 1) * (Math.floor((north + 90) / step) - Math.floor((south + 90) / step) + 1) <= 180);
  if (!size) throw new Error("Zoom in to view marketplace coverage.");
  const cells: Array<{ id: string; latitude: number; longitude: number }> = [];
  for (let y = Math.floor((south + 90) / size); y <= Math.floor((north + 90) / size); y++) {
    for (let x = Math.floor((west + 180) / size); x <= Math.floor((east + 180) / size); x++) cells.push({ id: `${size}_${y}_${x}`, latitude: (y + 0.5) * size - 90, longitude: (x + 0.5) * size - 180 });
  }
  return { size, cells };
}
