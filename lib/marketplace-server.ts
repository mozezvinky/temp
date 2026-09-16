import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { flatJobCategories, jobCategories } from "@/lib/jobCategories";
import { serviceKey, timestampMillis } from "@/functions/src/marketplace-policy";
import { z } from "zod";

export class MarketplaceError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const campaignSchema = z.object({
  name: z.string().trim().min(3).max(120), service: z.string().trim().min(1).max(100),
  rate: z.number().finite().positive().max(1000000), unit: z.string().trim().min(1).max(40),
  targetLocation: z.string().trim().min(1).max(100), source: z.string().trim().min(1).max(60),
  active: z.boolean().default(true), startsAt: z.string().datetime().nullable().default(null), endsAt: z.string().datetime().nullable().default(null), adSpend: z.number().finite().nonnegative().default(0)
}).refine(value => !value.startsAt || !value.endsAt || Date.parse(value.endsAt) > Date.parse(value.startsAt), "End date must follow start date.");
export async function resolveService(name: string) {
  const canonical = flatJobCategories.find(item => serviceKey(item) === serviceKey(name));
  if (canonical) return { serviceId: serviceKey(canonical), service: canonical, category: jobCategories.find(group => group.items.includes(canonical))!.group };
  const record = await adminDb().doc(`marketplaceServices/${serviceKey(name)}`).get();
  if (!record.exists) throw new MarketplaceError("Choose an existing COPIC service. Add/review it in Skills first.");
  return { serviceId: record.id, service: String(record.data()!.name), category: String(record.data()!.category) };
}
export function assertActiveLink(link: Record<string, unknown> | undefined) {
  if (!link || link.active !== true || link.startsAt && timestampMillis(link.startsAt) > Date.now() || link.endsAt && timestampMillis(link.endsAt) <= Date.now()) throw new MarketplaceError("This recruitment link is inactive or has ended.", 410);
}
export function validId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new MarketplaceError("Invalid link identifier.");
  return value;
}
