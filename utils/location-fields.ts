import type { LocationFields } from "@/types";

export function normalizeLocationFields(value: unknown): LocationFields | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const addressText = String(input.addressText ?? "").trim();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !addressText) return null;
  return removeUndefinedFields({
    county: String(input.county ?? "").trim(),
    town: String(input.town ?? "").trim(),
    estateOrArea: String(input.estateOrArea ?? "").trim(),
    nearestLandmark: String(input.nearestLandmark ?? "").trim(),
    addressText,
    landmark: normalizeLandmark(input.landmark),
    area: String(input.area ?? "").trim() || undefined,
    city: String(input.city ?? "").trim() || undefined,
    displayLocation: String(input.displayLocation ?? "").trim() || undefined,
    locationSource: normalizeLocationSource(input.locationSource),
    landmarkResolved: typeof input.landmarkResolved === "boolean" ? input.landmarkResolved : undefined,
    locationDescription: String(input.locationDescription ?? "").trim() || undefined,
    latitude,
    longitude
  });
}

export function locationRequiresDescription(location: LocationFields) {
  return location.locationSource === "current" && location.landmarkResolved === false && !location.locationDescription?.trim();
}

function normalizeLocationSource(value: unknown) {
  return value === "current" || value === "manual" || value === "network" ? value : undefined;
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

function removeUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => removeUndefinedFields(item)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, removeUndefinedFields(entry)])
  ) as T;
}
