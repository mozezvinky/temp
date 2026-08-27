import { isSqlBackend } from "@/lib/data-backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { updateLocalProfileLocation } from "@/lib/local-sql";
import type { LocationFields } from "@/types";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(token);
    const body = await request.json().catch(() => ({}));
    const location = normalizeLocation((body as Record<string, unknown>).location);
    if (!location) return NextResponse.json({ error: "Choose a valid location before saving." }, { status: 400 });

    if (isSqlBackend()) {
      const profile = updateLocalProfileLocation(decoded.uid, location);
      if (!profile) return NextResponse.json({ error: "Account profile was not found." }, { status: 404 });
      return NextResponse.json({ success: true, profile });
    }

    const userRef = adminDb().collection("users").doc(decoded.uid);
    await userRef.set({ location, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const userSnap = await userRef.get();
    return NextResponse.json({ success: true, profile: { id: userSnap.id, ...userSnap.data() } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update location." }, { status: 500 });
  }
}

function normalizeLocation(value: unknown): LocationFields | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const addressText = String(input.addressText ?? "").trim();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !addressText) return null;
  return {
    county: String(input.county ?? "").trim(),
    town: String(input.town ?? "").trim(),
    estateOrArea: String(input.estateOrArea ?? "").trim(),
    nearestLandmark: String(input.nearestLandmark ?? "").trim(),
    addressText,
    landmark: normalizeLandmark(input.landmark),
    area: String(input.area ?? "").trim() || undefined,
    city: String(input.city ?? "").trim() || undefined,
    displayLocation: String(input.displayLocation ?? "").trim() || undefined,
    latitude,
    longitude
  };
}

function normalizeLandmark(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const name = String(input.name ?? "").trim();
  const placeId = String(input.placeId ?? "").trim();
  const distanceMeters = Number(input.distanceMeters);
  if (!name || !placeId || !Number.isFinite(distanceMeters)) return undefined;
  return { name, placeId, distanceMeters };
}
