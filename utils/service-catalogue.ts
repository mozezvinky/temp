import { normalizeSkillVerificationStatus } from "@/utils/worker-skills";
import { z } from "zod";
import type { WorkerSkillProfile } from "@/types";
import { calculateClientPostedJobPaymentBreakdown } from "@/utils/money";

export const serviceSectors = [
  { name: "Hair & Beauty", certificate: true, items: ["Hair braiding", "Hairdressing", "Cornrows", "Knotless braids", "Twists", "Dreadlocks", "Hair treatment", "Hair washing", "Blow-drying", "Hair styling"], extras: ["Hair washing", "Blow-drying", "Hair treatment", "Finishing and styling"] },
  { name: "Nails & Pedicure", certificate: true, items: ["Manicures", "Pedicures", "Gel polish", "Acrylic nails", "Nail extensions", "Nail art", "Nail removal", "Foot scrubs", "Cuticle treatments"], extras: ["Nail removal", "Nail art", "Gel polish", "Cuticle treatment", "Foot scrub"] },
  { name: "Barber & Grooming", certificate: true, items: ["Haircuts", "Fades", "Beard trimming", "Hairline shaping", "Shaving", "Hair dyeing", "Grooming treatments"], extras: ["Beard trimming", "Hair washing", "Hair dyeing", "Facial treatment", "Hairline design"] },
  { name: "Cleaning / Mama Fua", certificate: false, items: ["House cleaning", "Laundry", "Washing clothes", "Ironing", "Kitchen cleaning", "Bathroom cleaning", "Bedroom cleaning", "General home cleaning"], extras: ["Ironing", "Laundry"] },
  { name: "Private Chef & Cooking", certificate: true, items: ["Home cooking", "Meal preparation", "Personal chef services", "Event cooking", "Family meals", "Special occasion cooking", "Catering services"], extras: ["Additional meal preparation"] }
] as const;

const money = z.number().int().min(0).max(10000000);
const shopLocation = z.object({ county: z.string().trim().min(1).max(100), town: z.string().trim().min(1).max(100), estateOrArea: z.string().trim().min(1).max(150), nearestLandmark: z.string().trim().min(1).max(200), addressText: z.string().trim().min(1).max(500), latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), locationDescription: z.string().max(500).optional() });
export const mediaUrl = z.string().regex(/^\/api\/service-media\?id=[a-zA-Z0-9_-]+$/, "Upload a valid image first.");
export const catalogueSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(100), description: z.string().trim().max(1500),
  sector: z.enum(["Hair & Beauty", "Nails & Pedicure", "Barber & Grooming", "Cleaning / Mama Fua", "Private Chef & Cooking", "Other"]),
  images: z.array(mediaUrl).min(1).max(8), price: money.refine(value => value >= 50),
  durationMinutes: z.number().int().min(5).max(10080), available: z.boolean(), active: z.boolean(),
  shopVisit: z.boolean(), houseCall: z.boolean(), houseCallFee: money,
  publicShopLocation: z.string().trim().max(500),
  shopLocation: shopLocation.optional(),
  addons: z.array(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(100), description: z.string().max(500), price: money, image: mediaUrl.optional(), active: z.boolean() })).max(30),
  createdAt: z.string(), updatedAt: z.string()
}).superRefine((value, ctx) => {
  if (!value.shopVisit && !value.houseCall) ctx.addIssue({ code: "custom", message: "Support at least one service arrangement." });
  if (value.shopVisit && !value.publicShopLocation) ctx.addIssue({ code: "custom", message: "Designate a public shop location." });
  if (value.shopVisit && !value.shopLocation) ctx.addIssue({ code: "custom", message: "Select your public shop location on the location picker." });
  if (new Set(value.addons.map(item => item.id)).size !== value.addons.length) ctx.addIssue({ code: "custom", message: "Duplicate add-ons are invalid." });
});
export type CatalogueEntry = z.infer<typeof catalogueSchema>;
export function sectorForSkill(name: string) {
  const term = name.trim().toLowerCase();
  const exact = serviceSectors.find(sector => sector.name.toLowerCase() === term || sector.items.some(item => item.toLowerCase() === term));
  if (exact) return exact;
  if (/nail|manicure|pedicure/.test(term)) return serviceSectors[1];
  if (/barber|haircut|beard|grooming/.test(term)) return serviceSectors[2];
  if (/hair|braid|cornrow|twist|dreadlock/.test(term)) return serviceSectors[0];
  if (/clean|laundry|mama fua|ironing/.test(term)) return serviceSectors[3];
  if (/chef|cook|catering|meal/.test(term)) return serviceSectors[4];
  return undefined;
}
export type ServiceBooking = { service: CatalogueEntry; skillId: string; addonIds: string[]; arrangement: "shop" | "house"; maximumBudget: number; preferredAt: string; location: string; instructions: string; inspirationImages: string[]; appointmentStatus: "preferred" };

export function cataloguePricing(service: CatalogueEntry, addonIds: string[], arrangement: "shop" | "house") {
  if (new Set(addonIds).size !== addonIds.length) throw new Error("Select each extra once.");
  const extras = addonIds.map(id => {
    const extra = service.addons.find(item => item.id === id && item.active);
    if (!extra) throw new Error("A selected extra is no longer available.");
    return extra;
  });
  if (arrangement !== "shop" && arrangement !== "house") throw new Error("Choose shop visit or house call.");
  if (arrangement === "shop" ? !service.shopVisit : !service.houseCall) throw new Error("This arrangement is unavailable.");
  const amount = service.price + extras.reduce((sum, extra) => sum + extra.price, 0) + (arrangement === "house" ? service.houseCallFee : 0);
  return calculateClientPostedJobPaymentBreakdown(amount);
}

export function bookCatalogueService(skill: WorkerSkillProfile, input: Record<string, unknown>): ServiceBooking {
  const service = skill.catalogue?.find(item => item.id === input.catalogueId && item.active && item.available);
  if (!service || normalizeSkillVerificationStatus(skill.verificationStatus) !== "approved") throw new Error("Choose an active service under an approved skill.");
  const required = serviceSectors.find(item => item.name === service.sector)?.certificate;
  if (required && (skill.proofType !== "certificate" || !skill.proofUrl)) throw new Error("This service requires an approved certificate.");
  const ids = z.array(z.string().uuid()).max(30).parse(input.addonIds ?? []);
  const arrangement = z.enum(["shop", "house"]).parse(input.arrangement);
  const maximumBudget = money.parse(input.maximumBudget);
  const preferredAt = z.string().datetime({ offset: true }).parse(input.preferredAt);
  if (Date.parse(preferredAt) <= Date.now()) throw new Error("Choose a future preferred appointment time.");
  const price = cataloguePricing(service, ids, arrangement);
  if (price.total > maximumBudget) throw new Error("The proposed price exceeds your maximum budget. Revise your selection or budget.");
  return { service: structuredClone(service), skillId: skill.id, addonIds: ids, arrangement, maximumBudget, preferredAt,
    location: arrangement === "shop" ? service.publicShopLocation : z.string().trim().min(1).max(500).parse(input.serviceLocation),
    instructions: z.string().max(2500).parse(input.instructions ?? ""), inspirationImages: z.array(mediaUrl).max(8).parse(input.inspirationImages ?? []), appointmentStatus: "preferred" };
}
