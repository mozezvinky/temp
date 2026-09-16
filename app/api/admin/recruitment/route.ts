import { requireAdmin, adminErrorStatus, writeAdminAuditLog } from "@/lib/admin-security";
import { adminDb } from "@/lib/firebase-admin";
import { campaignSchema, resolveService, validId, MarketplaceError } from "@/lib/marketplace-server";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request, "users:read");
    const db = adminDb(), id = request.nextUrl.searchParams.get("id");
    if (id) {
      const [campaign, funnel] = await Promise.all([db.doc(`recruitmentCampaigns/${validId(id)}`).get(), db.doc(`acquisitionFunnels/admin_campaign_${validId(id)}`).get()]);
      if (!campaign.exists) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      return NextResponse.json({ campaign: { id: campaign.id, ...campaign.data() }, funnel: funnel.data() ?? {} });
    }
    let query = db.collection("recruitmentCampaigns").orderBy("__name__").limit(31);
    const cursor = request.nextUrl.searchParams.get("cursor"); if (cursor) query = query.startAfter(validId(cursor));
    const campaigns = await query.get();
    return NextResponse.json({ campaigns: campaigns.docs.slice(0,30).map(doc => ({ id: doc.id, ...doc.data() })), nextCursor: campaigns.size > 30 ? campaigns.docs[29].id : null });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, "users:write");
    const parsed = campaignSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const service = await resolveService(parsed.data.service);
    const ref = adminDb().collection("recruitmentCampaigns").doc();
    const campaign = { ...parsed.data, ...service, sourceType: "admin_campaign", createdBy: admin.uid, createdAt: FieldValue.serverTimestamp() };
    await ref.create(campaign);
    await writeAdminAuditLog(request, { admin, actionType: "recruitment.create", newValue: { campaignId: ref.id, ...parsed.data }, reason: "Created COPIC recruitment campaign" });
    return NextResponse.json({ id: ref.id, url: `/recruit/${ref.id}` }, { status: 201 });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, "users:write"), body = await request.json();
    const id = validId(body.id);
    if (typeof body.active !== "boolean") throw new MarketplaceError("Choose active or inactive.");
    const patch: Record<string, unknown> = { active: body.active, updatedAt: FieldValue.serverTimestamp() };
    if (body.adSpend !== undefined) { if (!Number.isFinite(body.adSpend) || body.adSpend < 0) throw new MarketplaceError("Invalid ad spend."); patch.adSpend = body.adSpend; }
    await adminDb().doc(`recruitmentCampaigns/${id}`).update(patch);
    await writeAdminAuditLog(request, { admin, actionType: "recruitment.update", newValue: { id, active: body.active, adSpend: body.adSpend ?? null }, reason: "Updated campaign state/spend" });
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign request failed." }, { status: error instanceof MarketplaceError ? error.status : adminErrorStatus(error) }); }
