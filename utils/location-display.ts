import type { Job, LocationFields, ResolvedLocation } from "@/types";

const COORDINATE_TEXT = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;

export function buildLocationDisplayLabel(location: Partial<ResolvedLocation & LocationFields>) {
  const landmarkName = cleanText(location.landmark?.name || location.nearestLandmark);
  const area = cleanText(location.area || location.estateOrArea || location.town);
  const city = cleanText(location.city || location.county);

  if (landmarkName && !isGenericCurrentLocation(landmarkName)) {
    return `Near ${landmarkName}${area ? `, ${area}` : ""}`;
  }

  if (area && city && area.toLowerCase() !== city.toLowerCase()) return `${area}, ${city}`;
  if (area) return area;
  if (city) return city;

  return "Current location selected";
}

export function jobLocationLabel(job: Pick<Job, "location" | "county" | "locationDetails">) {
  const details = job.locationDetails;
  if (details?.displayLocation && isPublicSafeLocationText(details.displayLocation)) return details.displayLocation;
  if (details?.landmark || details?.area || details?.city) return buildLocationDisplayLabel(details);
  if (isPublicSafeLocationText(details?.addressText)) return details!.addressText;
  if (details?.estateOrArea || details?.town || details?.county) return buildLocationDisplayLabel(details);
  if (isPublicSafeLocationText(job.location)) return job.location;
  if (isPublicSafeLocationText(job.county)) return job.county;
  return "Location provided";
}

export function isPublicSafeLocationText(value: unknown): value is string {
  const text = cleanText(value);
  if (!text) return false;
  if (text === "[object Object]") return false;
  if (COORDINATE_TEXT.test(text)) return false;
  if (/\(-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\)/.test(text)) return false;
  return !isGenericCurrentLocation(text);
}

function isGenericCurrentLocation(value: string) {
  return /^(current location|selected location|pinned from current location|approximate network location)$/i.test(value.trim());
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
