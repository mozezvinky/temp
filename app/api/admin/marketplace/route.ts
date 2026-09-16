import { requireAdmin, adminErrorStatus } from "@/lib/admin-security";
import { adminDb } from "@/lib/firebase-admin";
import { visibleCells, serviceKey } from "@/functions/src/marketplace-policy";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "users:read");
    const db = adminDb(), params = request.nextUrl.searchParams;
    if (params.get("view") === "map") {
      const { size, cells } = visibleCells(...["west", "south", "east", "north"].map(key => Number(params.get(key))) as [number, number, number, number]);
      const snapshots = await db.getAll(...cells.map(cell => db.doc(`marketplaceCells/${cell.id}`)));
      const role = params.get("role"), verified = params.get("verified"), skillState = params.get("skillState"), skill = params.get("skill");
      const totals: Record<string, number> = {};
      const markers = snapshots.flatMap((snapshot, index) => {
        const buckets = snapshot.data()?.buckets as Record<string, Record<string, number>> | undefined;
        const counts: Record<string, number> = {};
        for (const [bucket, values] of Object.entries(buckets ?? {})) {
          if ((skillState === "with" || skillState === "without") && !bucket.startsWith("w")) continue;
          if (role === "worker" && !bucket.startsWith("w") || role === "client" && bucket[1] !== "c" || verified === "verified" && !bucket.includes("_v_") || verified === "unverified" && !bucket.includes("_u_") || skillState === "with" && !bucket.endsWith("_s") || skillState === "without" && !bucket.endsWith("_n")) continue;
          if (skill) {
            const count = Math.max(0, values[`service:${serviceKey(skill)}`] ?? 0);
            counts.users = (counts.users ?? 0) + count;
            counts.workers = (counts.workers ?? 0) + count;
            counts.clients = (counts.clients ?? 0) + (bucket[1] === "c" ? count : 0);
            counts.workersWithSkills = (counts.workersWithSkills ?? 0) + count;
            const statusKey = bucket.includes("_v_") ? "verifiedWorkers" : "unverifiedWorkers";
            counts[statusKey] = (counts[statusKey] ?? 0) + count;
            counts[`service:${serviceKey(skill)}`] = (counts[`service:${serviceKey(skill)}`] ?? 0) + count;
          } else for (const [key, count] of Object.entries(values)) counts[key] = (counts[key] ?? 0) + Math.max(0, count);
        }
        for (const [key, count] of Object.entries(counts)) totals[key] = (totals[key] ?? 0) + count;
        return counts.users ? [{ ...cells[index], ...counts }] : [];
      });
      return NextResponse.json({ markers, totals, cellSize: size, approximate: true });
    }
    let query = db.collection("marketplaceServices").orderBy("__name__").limit(51);
    const search = params.get("search")?.trim();
    if (search) query = query.startAt(serviceKey(search)).endAt(serviceKey(search) + "\uf8ff");
    const cursor = params.get("cursor");
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    return NextResponse.json({ services: snapshot.docs.slice(0, 50).map(doc => ({ id: doc.id, ...doc.data() })), nextCursor: snapshot.size > 50 ? snapshot.docs[49].id : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load marketplace analytics." }, { status: adminErrorStatus(error) });
  }
}
