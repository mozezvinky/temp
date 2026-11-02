import type { WorkerSkillProfile } from "../types";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { load } from "./auth-harness";
import { MemoryFirestore } from "./memory-firestore";

class Database extends MemoryFirestore {
  doc(path: string) { const ref = super.doc(path); return Object.assign(ref, { get: async () => this.snapshot(ref) }); }
  collection(path: string) {
    const query = super.collection(path), filters: Array<(data: Record<string, unknown>) => boolean> = [];
    return Object.assign(query, {
      where: (key: string, operator: string, value: unknown) => {
        filters.push(data => {
          const found = key.split(".").reduce<unknown>((result, part) => (result as Record<string, unknown> | undefined)?.[part], data);
          return operator === "array-contains" ? Array.isArray(found) && found.includes(value) : found === value;
        }); return query;
      },
      limit: () => query,
      doc: (id = randomUUID()) => this.doc(`${path}/${id}`),
      get: async () => ({ docs: [...this.records].filter(([key, data]) => key.startsWith(`${path}/`) && filters.every(filter => filter(data))).map(([key]) => this.snapshot(this.doc(key))) })
    });
  }
}
const workerSkills = (db: Database) => db.records.get("users/worker")!.skillProfiles as WorkerSkillProfile[];
const entry = () => ({ id: randomUUID(), name: "Laundry package", description: "Wash and fold", sector: "Cleaning / Mama Fua", images: ["/api/service-media?id=photo"], price: 900, durationMinutes: 60, available: true, active: true, shopVisit: false, houseCall: true, houseCallFee: 0, publicShopLocation: "", addons: [], createdAt: "forged", updatedAt: "forged" });
function fixture() {
  return new Database().seed("users/worker", { role: "worker", skillProfiles: [{ id: "cleaning", name: "Laundry", verificationStatus: "approved", proofType: "reference", chargeAmount: 900 }] })
    .seed("serviceMedia/photo", { ownerId: "worker", kind: "catalogue" });
}
async function api(db: Database, uid = "worker") {
  return load("app/api/profile/catalogue/route.ts", { "server-only": {}, "@/lib/firebase-admin": { adminDb: () => db }, "@/lib/data-backend": { isSqlBackend: () => false }, "@/lib/local-sql": {}, "@/lib/verified-auth": { verifyVerifiedIdToken: async () => ({ uid }) } }, { Buffer });
}
const request = (body: object) => new NextRequest("https://copic.example/api/profile/catalogue", { method: "POST", body: JSON.stringify(body) });
test("catalogue endpoint adds, edits, hides and deletes entries without changing job history or skill approval", async () => {
  const db = fixture(), route = await api(db), first = entry(), second = entry();
  db.seed("jobs/completed", { status: "completed", serviceBooking: { service: structuredClone(first) } });
  for (const service of [first, second]) assert.equal((await route.POST(request({ skillId: "cleaning", entry: service }))).status, 200);
  let skills = workerSkills(db);
  assert.equal(skills[0].catalogue!.length, 2); assert.equal(skills[0].verificationStatus, "approved"); assert.notEqual(skills[0].catalogue![0].createdAt, "forged");
  assert.equal((await route.POST(request({ skillId: "cleaning", entry: { ...first, price: 1000, active: false } }))).status, 200);
  assert.equal((db.records.get("jobs/completed")!.serviceBooking as { service: { price: number } }).service.price, 900);
  assert.equal((await route.POST(request({ skillId: "cleaning", action: "delete", id: first.id }))).status, 200);
  skills = workerSkills(db); assert.equal(skills[0].catalogue!.length, 1);
});
for (const scenario of ["wrong-owner", "locked", "pending-skill", "unowned-photo", "private-photo", "wrong-sector"]) test(`catalogue endpoint blocks ${scenario}`, async () => {
  const db = fixture(), body = { skillId: "cleaning", entry: entry() };
  let uid = "worker";
  if (scenario === "wrong-owner") uid = "another-worker";
  if (scenario === "locked") db.records.get("users/worker")!.isLocked = true;
  if (scenario === "pending-skill") workerSkills(db)[0].verificationStatus = "pending";
  if (scenario === "unowned-photo") db.records.get("serviceMedia/photo")!.ownerId = "someone-else";
  if (scenario === "private-photo") db.records.get("serviceMedia/photo")!.kind = "certificate";
  if (scenario === "wrong-sector") body.entry.sector = "Other";
  assert.equal((await (await api(db, uid)).POST(request(body))).status, 400);
  assert.equal(workerSkills(db)[0].catalogue, undefined);
});
test("private certificate reads allow owner and reviewed admin only; public images remain readable", async () => {
  const db = fixture().seed("serviceMedia/cert", { ownerId: "worker", kind: "certificate", mime: "application/pdf", path: "private" });
  let uid = "worker", admin = false;
  const route = await load("app/api/service-media/route.ts", { "server-only": {}, "@/lib/firebase-admin": { adminDb: () => db, adminStorage: () => ({ bucket: () => ({ file: () => ({ download: async () => [Buffer.from("file")] }) }) }) }, "@/lib/verified-auth": { verifyVerifiedIdToken: async () => { if (!uid) throw new Error("Unauthorized"); return { uid }; } }, "@/lib/admin-security": { requireAdmin: async () => { if (!admin) throw new Error("Forbidden"); } } }, { Buffer });
  const get = (id: string) => route.GET(new NextRequest(`https://copic.example/api/service-media?id=${id}`));
  assert.equal((await get("cert")).status, 200); uid = "outsider"; assert.equal((await get("cert")).status, 403);
  admin = true; assert.equal((await get("cert")).status, 200); admin = false; uid = "";
  assert.equal((await get("cert")).status, 403); db.records.get("serviceMedia/photo")!.path = "public"; db.records.get("serviceMedia/photo")!.mime = "image/png";
  assert.equal((await get("photo")).status, 200);
});
test("inspiration files are private until attached to a visible job or targeted request", async () => {
  const db = fixture().seed("users/other", { role: "worker" }).seed("serviceMedia/reference", { ownerId: "client", kind: "inspiration", mime: "image/png", path: "reference" });
  const route = await load("app/api/service-media/route.ts", { "server-only": {}, "@/lib/firebase-admin": { adminDb: () => db, adminStorage: () => ({ bucket: () => ({ file: () => ({ download: async () => [Buffer.from("image")] }) }) }) }, "@/lib/verified-auth": { verifyVerifiedIdToken: async () => ({ uid: "other" }) }, "@/lib/admin-security": {} }, { Buffer });
  const req = () => new NextRequest("https://copic.example/api/service-media?id=reference");
  assert.equal((await route.GET(req())).status, 403);
  db.seed("jobs/open", { status: "open", servicePreferences: { inspirationImages: ["/api/service-media?id=reference"] } });
  assert.equal((await route.GET(req())).status, 200);
  db.records.get("jobs/open")!.status = "cancelled"; assert.equal((await route.GET(req())).status, 403);
});

test("catalogue bookings create the existing job and application with matching immutable financial snapshots", async () => {
  const db = fixture(), service = entry();
  workerSkills(db)[0].catalogue = [service as NonNullable<WorkerSkillProfile["catalogue"]>[number]];
  db.seed("users/client", { role: "client", displayName: "Client", verificationStatus: "approved" }).seed("verifications/client", { status: "approved" });
  const route = await load("app/api/hire-requests/route.ts", { "server-only": {}, "@/lib/firebase-admin": { adminDb: () => db }, "@/lib/data-backend": { isSqlBackend: () => false }, "@/lib/local-sql": {}, "@/lib/current-user-profile": { getCurrentUserProfile: async () => ({ decoded: { uid: "client" }, uid: "client", role: "client" }) }, "@/lib/notifications-server": { setNotification: () => {}, sendNotificationEmailsAfterCommit: async () => {} }, "@/lib/verified-auth": {} }, { crypto: { randomUUID }, structuredClone });
  const locationDetails = { county: "Nairobi", town: "Nairobi", estateOrArea: "CBD", nearestLandmark: "KICC", addressText: "CBD Nairobi", latitude: -1.2, longitude: 36.8 };
  const body = { workerId: "worker", skillId: "cleaning", title: "Laundry package", category: "Cleaning / Mama Fua", location: "CBD Nairobi", locationDetails, startDate: "2099-11-02T10:00:00+03:00", duration: "60 minutes", catalogueId: service.id, addonIds: [], arrangement: "house", maximumBudget: 1000, preferredAt: "2099-11-02T10:00:00+03:00", serviceLocation: "CBD Nairobi", total: 1, serviceFee: 0, workerEarnings: 999999 };
  const response = await route.POST(new NextRequest("https://copic.example/api/hire-requests", { method: "POST", body: JSON.stringify(body) }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const job = [...db.records].find(([path]) => path.startsWith("jobs/"))![1];
  const application = [...db.records].find(([path]) => path.startsWith("applications/"))![1];
  assert.equal(application.source, "direct_hire"); assert.equal(application.status, "pending"); assert.equal(job.status, "pending");
  assert.equal(job.payAmount, 900); assert.equal(application.grossAmount, 900); assert.equal(application.serviceFeeAmount, 90); assert.equal(application.workerEarnings, 810);
  assert.deepEqual(job.serviceBooking, application.serviceBooking); assert.equal([...db.records.keys()].some(path => path.startsWith("commissionLedger/")), false);
  service.price = 5000;
  assert.equal((job.serviceBooking as { service: { price: number } }).service.price, 900);
});

test("admin certification review supports a resubmission reason and cannot approve missing required proof", async () => {
  const db = fixture();
  const route = await load("app/api/admin/skills/route.ts", { "server-only": {}, "@/lib/firebase-admin": { adminDb: () => db }, "@/lib/data-backend": { isSqlBackend: () => false }, "@/lib/local-sql": {}, "@/lib/admin-security": { requireAdmin: async () => ({ uid: "admin" }), adminErrorStatus: () => 400, writeAdminAuditLog: async () => {} }, "@/lib/notifications-server": { setNotification: () => {}, sendNotificationEmailsAfterCommit: async () => {} } }, {});
  const patch = (body: object) => route.PATCH(new NextRequest("https://copic.example/api/admin/skills", { method: "PATCH", body: JSON.stringify({ userId: "worker", skillId: "cleaning", ...body }) }));
  assert.equal((await patch({ action: "resubmit", reason: "Please upload a readable document." })).status, 200);
  assert.equal(workerSkills(db)[0].certificationReviewStatus, "requires_resubmission");
  assert.equal(workerSkills(db)[0].verificationStatus, "rejected");
  assert.equal(workerSkills(db)[0].rejectionReason, "Please upload a readable document.");
  workerSkills(db)[0].certificationRequired = true;
  assert.equal((await patch({ action: "approve" })).status, 400);
  assert.equal(workerSkills(db)[0].verificationStatus, "rejected");
});

test("replacing a certificate resets approval and preserves existing catalogue entries", async () => {
  const db = fixture();
  Object.assign(workerSkills(db)[0], { name: "Hair & Beauty", category: "services_trades", level: "expert", proofType: "certificate", proofUrl: "/api/service-media?id=old-cert", chargeCategory: "Hair & Beauty", certificationReviewStatus: "approved", catalogue: [entry()] });
  db.seed("serviceMedia/new-cert", { ownerId: "worker", kind: "certificate" });
  const route = await load("app/api/profile/skills/route.ts", { "server-only": {}, "@/lib/firebase-admin": { adminDb: () => db, adminAuth: () => ({ getUser: async () => ({ emailVerified: true }) }) }, "@/lib/data-backend": { isSqlBackend: () => false }, "@/lib/local-sql": {}, "@/lib/verified-auth": { verifyVerifiedIdToken: async () => ({ uid: "worker" }) }, "@/lib/service-pricing": { enforceServicePrice: async () => ({}) } }, { crypto: { randomUUID } });
  const response = await route.POST(new NextRequest("https://copic.example/api/profile/skills", { method: "POST", body: JSON.stringify({ id: "cleaning", name: "Hair & Beauty", category: "services_trades", level: "expert", proofType: "certificate", proofUrl: "/api/service-media?id=new-cert", chargeAmount: 900, chargeCategory: "Hair & Beauty", chargePayType: "fixed" }) }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(workerSkills(db)[0].verificationStatus, "pending"); assert.equal(workerSkills(db)[0].certificationReviewStatus, "pending");
  assert.equal(workerSkills(db)[0].catalogue!.length, 1);
});
