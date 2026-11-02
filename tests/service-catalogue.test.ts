import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { bookCatalogueService, cataloguePricing, catalogueSchema, sectorForSkill, serviceSectors, type CatalogueEntry } from "../utils/service-catalogue";
import { calculateDirectHirePricing } from "../utils/direct-hire-pricing";
import { resolveJobPaymentBreakdown } from "../utils/money";
import { approvedSkillNames, visibleSkillProfiles } from "../utils/worker-skills";
import { jobSchema } from "../utils/validation";
import type { WorkerSkillProfile } from "../types";

function fixture() {
  const service: CatalogueEntry = { id: randomUUID(), name: "Cornrows", description: "Braiding", sector: "Hair & Beauty", images: ["/api/service-media?id=photo"], price: 700, durationMinutes: 90, available: true, active: true, shopVisit: true, houseCall: true, houseCallFee: 0, publicShopLocation: "Public salon, Nairobi", shopLocation: { county: "Nairobi", town: "Nairobi", estateOrArea: "CBD", nearestLandmark: "KICC", addressText: "Public salon, Nairobi", latitude: -1.2, longitude: 36.8 }, createdAt: "2026-11-02", updatedAt: "2026-11-02", addons: [
    { id: randomUUID(), name: "Hair washing", description: "Wash", price: 100, active: true },
    { id: randomUUID(), name: "Blow-drying", description: "Dry", price: 100, active: true }
  ] };
  const skill: WorkerSkillProfile = { id: "hair", name: "Hair & Beauty", category: "services_trades", level: "expert", proofType: "certificate", proofUrl: "/api/service-media?id=certificate", verificationStatus: "approved", catalogue: [service], completedJobs: 0, ratingAverage: 0, ratingCount: 0 };
  const input = { catalogueId: service.id, addonIds: service.addons.map(extra => extra.id), arrangement: "house", maximumBudget: 1000, preferredAt: "2099-11-02T10:00:00+03:00", serviceLocation: "Client-selected location", instructions: "Please call on arrival", inspirationImages: [] };
  return { service, skill, input };
}

test("KSh 900 includes KSh 90 fee and KSh 810 net, with no second fee on settlement", () => {
  const { service } = fixture(); const price = cataloguePricing(service, service.addons.map(item => item.id), "house");
  assert.equal(price.total, 900); assert.equal(price.serviceFee, 90); assert.equal(price.workerEarnings, 810);
  const settled = resolveJobPaymentBreakdown({ source: "direct_hire", requestPricing: { total: price.total, subtotal: price.workerEarnings, serviceFee: price.serviceFee } });
  assert.equal(settled.total, 900); assert.equal(settled.workerEarnings, 810); assert.equal(settled.serviceFee, 90);
});
test("new desired-net quotes gross up consistently while saved historical prices stay intact", () => {
  const { skill } = fixture(); const quote = calculateDirectHirePricing({ ...skill, chargeAmount: 900 }, 1);
  assert.equal(quote.total, 1000); assert.equal(quote.subtotal, 900); assert.equal(quote.serviceFee, 100);
  const old = resolveJobPaymentBreakdown({ source: "direct_hire", requestPricing: { total: 990, subtotal: 900, serviceFee: 90 } });
  assert.equal(old.total, 990); assert.equal(old.workerEarnings, 900);
});
test("extras are opt-in and do not mutate the maximum budget", () => {
  const { service, skill, input } = fixture(); const before = structuredClone(input);
  assert.equal(cataloguePricing(service, [], "house").total, 700);
  const booking = bookCatalogueService(skill, input); assert.equal(booking.maximumBudget, 1000); assert.deepEqual(input, before);
});
test("budget conflict rejects the request without dropping extras", () => {
  const { skill, input } = fixture(); input.maximumBudget = 899;
  assert.throws(() => bookCatalogueService(skill, input), /exceeds your maximum budget/); assert.equal(input.addonIds.length, 2);
});
test("price and payout tampering is ignored; only persisted extras can be selected", () => {
  const { service, skill, input } = fixture(); const snapshot = bookCatalogueService(skill, { ...input, price: 1, serviceFee: 0, workerEarnings: 999999 });
  assert.equal(cataloguePricing(snapshot.service, snapshot.addonIds, snapshot.arrangement).total, 900);
  assert.throws(() => cataloguePricing(service, [randomUUID()], "house"), /no longer available/);
  assert.throws(() => cataloguePricing(service, [service.addons[0].id, service.addons[0].id], "house"), /once/);
});
test("hidden entries, unavailable entries and disabled extras cannot be booked", () => {
  const { service, skill, input } = fixture(); service.active = false; assert.throws(() => bookCatalogueService(skill, input), /active service/);
  service.active = true; service.available = false; assert.throws(() => bookCatalogueService(skill, input), /active service/);
  service.available = true; service.addons[0].active = false; assert.throws(() => bookCatalogueService(skill, input), /no longer available/);
});
test("approved certificate is required for new catalogue bookings in regulated platform sectors", () => {
  const { skill, input } = fixture(); skill.verificationStatus = "pending"; assert.throws(() => bookCatalogueService(skill, input), /approved skill/);
  skill.verificationStatus = "approved"; skill.proofType = "reference"; assert.throws(() => bookCatalogueService(skill, input), /certificate/);
});
test("cleaning needs no training certificate; legacy approved skills remain usable", () => {
  const { service, skill, input } = fixture(); service.sector = "Cleaning / Mama Fua"; skill.proofType = "reference"; delete skill.proofUrl; delete skill.verificationStatus;
  assert.equal(bookCatalogueService(skill, input).appointmentStatus, "preferred"); assert.deepEqual(approvedSkillNames([skill]), [skill.name]);
  delete skill.catalogue; assert.equal(visibleSkillProfiles([skill]).length, 1);
});
test("editing or deleting the catalogue cannot change the agreed snapshot", () => {
  const { service, skill, input } = fixture(); const booking = bookCatalogueService(skill, input);
  service.price = 5000; service.addons[0].price = 999; skill.catalogue = [];
  assert.equal(booking.service.price, 700); assert.equal(booking.service.addons[0].price, 100);
});
test("only supported arrangements are accepted and travel is fully included", () => {
  const { service, skill, input } = fixture(); service.houseCall = false; assert.throws(() => bookCatalogueService(skill, input), /unavailable/);
  input.arrangement = "shop"; assert.equal(bookCatalogueService(skill, input).location, "Public salon, Nairobi");
  service.houseCall = true; service.houseCallFee = 100; assert.equal(cataloguePricing(service, input.addonIds, "house").total, 1000);
});
test("preferred dates are validated without pretending to reserve availability", () => {
  const { skill, input } = fixture(); assert.equal(bookCatalogueService(skill, input).appointmentStatus, "preferred");
  assert.throws(() => bookCatalogueService(skill, { ...input, preferredAt: "invalid" }));
  assert.throws(() => bookCatalogueService(skill, { ...input, preferredAt: "2000-01-01T00:00:00Z" }), /future/);
});
test("catalogues support multiple services and images under one skill", () => {
  const { service, skill } = fixture(); service.images.push("/api/service-media?id=second");
  assert.equal(catalogueSchema.parse(service).images.length, 2);
  skill.catalogue!.push({ ...service, id: randomUUID(), name: "Twists" }); assert.equal(skill.catalogue!.length, 2);
});
test("server schema rejects unsafe images, fractional money, duplicates and absent service locations", () => {
  const { service } = fixture();
  for (const bad of [{ ...service, price: -1 }, { ...service, price: 50.5 }, { ...service, images: ["javascript:alert(1)"] }, { ...service, images: [] }, { ...service, publicShopLocation: "" }, { ...service, addons: [service.addons[0], service.addons[0]] }]) assert.equal(catalogueSchema.safeParse(bad).success, false);
});
test("five sectors are additive and chef food safety is certification-required", () => {
  assert.equal(serviceSectors.length, 5); assert.equal(sectorForSkill("Chef")?.certificate, true); assert.equal(sectorForSkill("Laundry helper")?.certificate, false); assert.equal(sectorForSkill("Hair stylist")?.name, "Hair & Beauty"); assert.equal(sectorForSkill("Plumber"), undefined);
});
test("general job validation preserves budget and requested extras without fabricated prices", () => {
  const parsed = jobSchema.parse({ title: "Cornrows", description: "Braiding with wash", category: "Hair & Beauty", payAmount: 900, payType: "fixed", duration: "2 hours", durationValue: 2, durationUnit: "hours", durationHours: 2, location: "Nairobi", county: "Nairobi", locationDetails: { county: "Nairobi", town: "Nairobi", estateOrArea: "CBD", nearestLandmark: "KICC", addressText: "CBD", latitude: -1.2, longitude: 36.8 }, servicePreferences: { arrangement: "house", extras: ["Hair washing", "Blow-drying"], inspirationImages: ["/api/service-media?id=inspiration"], instructions: "Call first" } });
  assert.equal(parsed.payAmount, 900); assert.equal(parsed.servicePreferences!.extras.length, 2); assert.equal("workerEarnings" in parsed, false);
});
