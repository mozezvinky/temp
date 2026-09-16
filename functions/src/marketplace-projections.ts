import { isDeepStrictEqual } from "node:util";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { cellId, cellSizes, serviceKey, type FunnelStage } from "./marketplace-policy";

type Counters = Record<string, number>;
type Projection = { counters: Counters; services: Record<string, { name: string; category: string; counters: Counters }>; cells: string[]; bucket: string; area: string };
type RecordData = Record<string, unknown>;
function project(user: RecordData | undefined): Projection {
  const empty: Projection = { counters: {}, services: {}, cells: [], bucket: "", area: "" };
  if (!user) return empty;
  const roles = new Set([user.role, ...(Array.isArray(user.roles) ? user.roles : [])]);
  const worker = roles.has("worker"), client = roles.has("client");
  const verified = ["approved", "verified"].includes(String(user.verificationStatus).toLowerCase());
  const profiles = Array.isArray(user.skillProfiles) && user.skillProfiles.length ? user.skillProfiles as RecordData[] : (Array.isArray(user.skills) ? user.skills : []).map(name => ({ name, category: "services_trades", verificationStatus: "approved" }));
  const skills = new Map(profiles.filter(skill => typeof skill.name === "string").map(skill => [serviceKey(String(skill.name)), skill]));
  const available = !user.isLocked && !user.isOccupied && Number(user.activeJobCount ?? 0) === 0;
  const counters: Counters = { users: 1, workers: +worker, clients: +client, agents: +(user.agentEnabled === true), verifiedUsers: +verified, unverifiedUsers: +!verified, workersWithSkills: +(worker && skills.size > 0), workersWithoutSkills: +(worker && skills.size === 0), totalSkills: worker ? skills.size : 0, verifiedSkills: 0, unverifiedSkills: 0 };
  const services: Projection["services"] = {};
  if (worker) for (const [id, skill] of skills) {
    const skillVerified = !skill.verificationStatus || skill.verificationStatus === "approved";
    counters[skillVerified ? "verifiedSkills" : "unverifiedSkills"]++;
    services[id] = { name: String(skill.name), category: String(skill.category ?? "services_trades"), counters: { workers: 1, verifiedWorkers: +verified, unverifiedWorkers: +!verified, availableWorkers: +available, verifiedSkills: +skillVerified } };
  }
  const location = user.location as RecordData | undefined;
  const lat = Number(location?.latitude), lng = Number(location?.longitude);
  return { counters, services, cells: user.role !== "admin" && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat < 90 && lng >= -180 && lng < 180 ? cellSizes.map(size => cellId(size, lat, lng)) : [], bucket: `${worker ? "w" : "n"}${client ? "c" : "n"}_${verified ? "v" : "u"}_${skills.size ? "s" : "n"}`, area: String(location?.area ?? location?.town ?? location?.city ?? "") };
}
function delta(before: Counters, after: Counters) {
  return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(after)])].map(key => [key, FieldValue.increment((after[key] ?? 0) - (before[key] ?? 0))]));
}
/** Reads current source and stored projection inside one transaction: retries and out-of-order deliveries are safe. */
export async function syncMarketplaceUser(db: Firestore, uid: string) {
  await db.runTransaction(async tx => {
    const ref = db.doc(`marketplaceProjections/${uid}`);
    const [source, previous] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(ref)]);
    const before = previous.exists ? previous.data() as Projection : project(undefined);
    const after = project(source.data());
    if (previous.exists && isDeepStrictEqual(before, after)) return;
    tx.set(db.doc("marketplaceMetrics/overview"), { ...delta(before.counters, after.counters), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    for (const id of new Set([...Object.keys(before.services), ...Object.keys(after.services)])) {
      const metadata = after.services[id] ?? before.services[id];
      tx.set(db.doc(`marketplaceServices/${id}`), { name: metadata.name, category: metadata.category, ...delta(before.services[id]?.counters ?? {}, after.services[id]?.counters ?? {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    // One cell document per resolution, with anonymous cohort counts and service breakdowns.
    const amounts = new Map<string, number>();
    const mutations = new Map<string, Record<string, Record<string, FieldValue>>>();
    for (const [projection, sign] of [[before, -1], [after, 1]] as const) for (const id of projection.cells) {
      const fields = mutations.get(id) ?? {};
      const bucket = fields[projection.bucket] ?? {};
      const add = (key: string, value: number) => {
        // Combine old/new deltas before emitting transforms, including moves within the same cell.
        const counterKey = `${id}|${projection.bucket}|${key}`;
        amounts.set(counterKey, (amounts.get(counterKey) ?? 0) + value * sign);
        bucket[key] = FieldValue.increment(amounts.get(counterKey)!);
      };
      add("users", 1);
      for (const key of ["workers", "clients", "workersWithSkills", "workersWithoutSkills"]) add(key, projection.counters[key] ?? 0);
      add("verifiedWorkers", projection.bucket.includes("_v_") ? projection.counters.workers ?? 0 : 0);
      add("unverifiedWorkers", projection.bucket.includes("_u_") ? projection.counters.workers ?? 0 : 0);
      for (const service of Object.keys(projection.services)) add(`service:${service}`, 1);
      fields[projection.bucket] = bucket;
      mutations.set(id, fields);
    }
    for (const [id, buckets] of mutations) tx.set(db.doc(`marketplaceCells/${id}`), { buckets, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(ref, after);
  });
}

export async function recordFunnel(db: Firestore, uid: string, stage: FunnelStage) {
  await db.runTransaction(async tx => {
    const attribution = await tx.get(db.doc(`acquisitionAttributions/${uid}`));
    if (!attribution.exists) return;
    const data = attribution.data()!;
    const eventRef = db.doc(`acquisitionEvents/${uid}_${stage}`);
    if ((await tx.get(eventRef)).exists) return;
    tx.create(eventRef, { userId: uid, stage, sourceType: data.sourceType, sourceId: data.sourceId, createdAt: FieldValue.serverTimestamp() });
    tx.set(db.doc(`acquisitionFunnels/${data.sourceType}_${data.sourceId}`), { [stage]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (data.agentId) tx.set(db.doc(`agentMetrics/${data.agentId}`), { [stage]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}
