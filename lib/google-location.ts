import "server-only";

import type { Landmark, ResolvedLocation } from "@/types";
import { calculateDistanceMeters, type Coordinates } from "@/utils/geo";
import { buildLocationDisplayLabel } from "@/utils/location-display";

const SEARCH_RADIUS_METERS = 300;
const INCLUDED_PLACE_TYPES = [
  "shopping_mall",
  "supermarket",
  "university",
  "school",
  "hospital",
  "doctor",
  "lodging",
  "transit_station",
  "bus_station",
  "train_station",
  "church",
  "mosque",
  "local_government_office",
  "city_hall",
  "courthouse",
  "police",
  "post_office",
  "gas_station",
  "department_store",
  "bank",
  "store"
];

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
};

type AddressComponent = {
  long_name?: string;
  types?: string[];
};

export async function resolveCurrentLocationWithGoogle(coordinates: Coordinates): Promise<ResolvedLocation> {
  const fallback: ResolvedLocation = {
    ...coordinates,
    displayLocation: "Current location selected"
  };
  const apiKey = googleMapsServerApiKey();
  if (!apiKey) return fallback;

  const [landmarkResult, addressResult] = await Promise.allSettled([
    findNearbyLandmark(coordinates, apiKey),
    reverseGeocodeArea(coordinates, apiKey)
  ]);

  const landmark = landmarkResult.status === "fulfilled" ? landmarkResult.value ?? undefined : undefined;
  const address = addressResult.status === "fulfilled" ? addressResult.value : {};
  const displayLocation = buildLocationDisplayLabel({
    ...coordinates,
    landmark,
    area: address.area,
    city: address.city
  });

  return {
    ...coordinates,
    landmark,
    area: address.area,
    city: address.city,
    displayLocation
  };
}

export function selectBestLandmark(places: GooglePlace[], userCoordinates: Coordinates): Landmark | null {
  const candidates = places.flatMap(place => {
    const latitude = Number(place.location?.latitude);
    const longitude = Number(place.location?.longitude);
    const name = place.displayName?.text?.trim();
    const placeId = place.id?.trim();
    if (!name || !placeId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    if (place.businessStatus && place.businessStatus !== "OPERATIONAL") return [];
    const distanceMeters = calculateDistanceMeters(userCoordinates.latitude, userCoordinates.longitude, latitude, longitude);
    if (distanceMeters > SEARCH_RADIUS_METERS) return [];
    const types = Array.isArray(place.types) ? place.types : [];
    const priority = placePriority(types);
    if (priority <= 0) return [];
    const popularity = Math.min(20, Math.log10(Math.max(1, Number(place.userRatingCount ?? 0))) * 8);
    const rating = Math.max(0, Number(place.rating ?? 0));
    const score = priority * 100 + popularity + rating - distanceMeters / 8;
    return [{ landmark: { name, placeId, distanceMeters }, score }];
  });

  candidates.sort((first, second) => second.score - first.score || first.landmark.distanceMeters - second.landmark.distanceMeters);
  return candidates[0]?.landmark ?? null;
}

async function findNearbyLandmark(coordinates: Coordinates, apiKey: string) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types,places.businessStatus,places.rating,places.userRatingCount"
    },
    body: JSON.stringify({
      includedTypes: INCLUDED_PLACE_TYPES,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: coordinates.latitude, longitude: coordinates.longitude },
          radius: SEARCH_RADIUS_METERS
        }
      }
    })
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const places = Array.isArray(payload.places) ? payload.places as GooglePlace[] : [];
  return selectBestLandmark(places, coordinates);
}

async function reverseGeocodeArea(coordinates: Coordinates, apiKey: string) {
  const params = new URLSearchParams({
    latlng: `${coordinates.latitude},${coordinates.longitude}`,
    key: apiKey,
    result_type: "neighborhood|sublocality|locality|administrative_area_level_2"
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
  if (!response.ok) return {};
  const payload = await response.json().catch(() => ({}));
  if (payload.status && payload.status !== "OK" && payload.status !== "ZERO_RESULTS") return {};
  const components = Array.isArray(payload.results?.[0]?.address_components)
    ? payload.results[0].address_components as AddressComponent[]
    : [];
  return {
    area: componentName(components, ["neighborhood", "sublocality_level_1", "sublocality", "administrative_area_level_3"]),
    city: componentName(components, ["locality", "postal_town", "administrative_area_level_2", "administrative_area_level_1"])
  };
}

function componentName(components: AddressComponent[], preferredTypes: string[]) {
  for (const type of preferredTypes) {
    const component = components.find(item => Array.isArray(item.types) && item.types.includes(type));
    if (component?.long_name?.trim()) return component.long_name.trim();
  }
  return undefined;
}

function placePriority(types: string[]) {
  if (types.includes("shopping_mall")) return 100;
  if (types.includes("supermarket")) return 96;
  if (types.includes("university")) return 94;
  if (types.includes("school")) return 90;
  if (types.includes("hospital") || types.includes("doctor")) return 88;
  if (types.includes("transit_station") || types.includes("bus_station") || types.includes("train_station")) return 84;
  if (types.includes("lodging")) return 78;
  if (types.includes("church") || types.includes("mosque") || types.includes("place_of_worship")) return 74;
  if (types.includes("local_government_office") || types.includes("city_hall") || types.includes("courthouse") || types.includes("police") || types.includes("post_office")) return 72;
  if (types.includes("gas_station")) return 68;
  if (types.includes("department_store") || types.includes("bank") || types.includes("store")) return 54;
  return 0;
}

function googleMapsServerApiKey() {
  return process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim()
    || process.env.GOOGLE_MAPS_API_KEY?.trim()
    || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
    || "";
}
