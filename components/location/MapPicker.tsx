"use client";

import { Button } from "@/components/ui/Button";
import { auth } from "@/lib/firebase";
import type { LocationFields } from "@/types";
import { buildLocationDisplayLabel } from "@/utils/location-display";
import { Crosshair, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import Map, { GeolocateControl, Marker, NavigationControl } from "react-map-gl/mapbox";

type SearchResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  details: Partial<LocationFields>;
};

export default function MapPicker({ value, onChange }: { value: LocationFields; onChange: (location: LocationFields) => void }) {
  useEffect(() => {
    void import("mapbox-gl/dist/mapbox-gl.css");
  }, []);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const [mode, setMode] = useState<"current" | "custom">("custom");
  const [locating, setLocating] = useState(false);
  const [locatingLabel, setLocatingLabel] = useState("Finding location...");
  const [locationError, setLocationError] = useState("");
  const [locationNotice, setLocationNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [viewState, setViewState] = useState({ longitude: value.longitude, latitude: value.latitude, zoom: 11 });
  const requiresLocationDescription = value.locationSource === "current" && value.landmarkResolved === false;

  useEffect(() => {
    setViewState(current => ({ ...current, longitude: value.longitude, latitude: value.latitude }));
  }, [value.latitude, value.longitude]);

  function detailsFromFeature(feature: Record<string, unknown>, fallbackLabel: string): Partial<LocationFields> {
    const context = Array.isArray(feature.context) ? feature.context as Array<{ id?: string; text?: string }> : [];
    const placeTypes = Array.isArray(feature.place_type) ? feature.place_type.map(String) : [];
    const text = typeof feature.text === "string" ? feature.text : "";
    const placeName = typeof feature.place_name === "string" ? feature.place_name : fallbackLabel;
    const county = context.find(item => item.id?.startsWith("region"))?.text ?? value.county;
    const town = context.find(item => item.id?.startsWith("place"))?.text ?? context.find(item => item.id?.startsWith("locality"))?.text ?? text ?? value.town;
    const landmark = placeTypes.some(type => ["poi", "address", "neighborhood", "locality"].includes(type))
      ? text
      : context.find(item => item.id?.startsWith("poi"))?.text ?? context.find(item => item.id?.startsWith("neighborhood"))?.text ?? text;
    return {
      county: String(county || "Current location"),
      town: String(town || "Current location"),
      estateOrArea: String(text || value.estateOrArea || "Current location"),
      nearestLandmark: landmark || value.nearestLandmark || "Selected location",
      addressText: placeName,
      displayLocation: placeName
    };
  }

  async function reverseGeocode(latitude: number, longitude: number) {
    if (!token) return null;
    try {
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${token}&country=ke&types=poi,address,neighborhood,locality,place&limit=5`);
      const payload = await response.json().catch(() => ({}));
      const features = Array.isArray(payload.features) ? payload.features as Array<Record<string, unknown>> : [];
      const feature = features.find(item => {
        const types = Array.isArray(item.place_type) ? item.place_type.map(String) : [];
        return types.some(type => ["poi", "address", "neighborhood"].includes(type));
      }) ?? features[0] ?? null;
      if (!feature) return null;
      return detailsFromFeature(feature, "Current location");
    } catch {
      return null;
    }
  }

  async function searchLocations(query: string) {
    const trimmed = query.trim();
    setSearchQuery(query);
    setLocationError("");
    setLocationNotice("");
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    if (!token) {
      setLocationError("Location search is unavailable until Mapbox is connected.");
      return;
    }
    setSearching(true);
    try {
      const encoded = encodeURIComponent(trimmed);
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&country=ke&autocomplete=true&limit=6&proximity=${value.longitude},${value.latitude}`);
      const payload = await response.json().catch(() => ({}));
      const features = Array.isArray(payload.features) ? payload.features as Array<Record<string, unknown>> : [];
      setSearchResults(features.flatMap(feature => {
        const center = Array.isArray(feature.center) ? feature.center : [];
        const longitude = Number(center[0]);
        const latitude = Number(center[1]);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
        const label = typeof feature.place_name === "string" ? feature.place_name : String(feature.text ?? trimmed);
        return [{
          id: String(feature.id ?? `${longitude}-${latitude}-${label}`),
          label,
          latitude,
          longitude,
          details: detailsFromFeature(feature, label)
        }];
      }));
    } catch {
      setLocationError("Unable to search locations right now. Try again or choose custom location.");
    } finally {
      setSearching(false);
    }
  }

  function selectSearchResult(result: SearchResult) {
    setMode("custom");
    setSearchQuery(result.label);
    setSearchResults([]);
    setLocationError("");
    setLocationNotice("");
    onChange(locationFromCoords(result.latitude, result.longitude, { ...result.details, locationSource: "manual", landmarkResolved: true }));
    setViewState(current => ({ ...current, longitude: result.longitude, latitude: result.latitude, zoom: 14 }));
  }

  function locationFromCoords(latitude: number, longitude: number, details?: Partial<LocationFields>) {
    return {
      ...value,
      county: details?.county || value.county || "Current location",
      town: details?.town || value.town || "Current location",
      estateOrArea: details?.estateOrArea || value.estateOrArea || "Current location",
      nearestLandmark: details?.nearestLandmark || value.nearestLandmark || "Pinned from current location",
      addressText: details?.addressText || details?.displayLocation || value.addressText || "Current location selected",
      landmark: details?.landmark || value.landmark,
      area: details?.area || value.area,
      city: details?.city || value.city,
      displayLocation: details?.displayLocation || details?.addressText || value.displayLocation || "Current location selected",
      locationSource: details?.locationSource || value.locationSource,
      landmarkResolved: details?.landmarkResolved ?? value.landmarkResolved,
      locationDescription: value.locationDescription,
      longitude,
      latitude
    };
  }

  async function resolveCurrentLocation(latitude: number, longitude: number) {
    try {
      const user = auth?.currentUser;
      const token = user ? await user.getIdToken() : "";
      if (!token) return null;
      const response = await fetch("/api/location/resolve-landmark", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ latitude, longitude })
      });
      if (!response.ok) return null;
      const resolved = await response.json().catch(() => ({}));
      const displayLocation = typeof resolved.displayLocation === "string" && resolved.displayLocation.trim()
        ? resolved.displayLocation.trim()
        : buildLocationDisplayLabel(resolved);
      const area = typeof resolved.area === "string" ? resolved.area.trim() : "";
      const city = typeof resolved.city === "string" ? resolved.city.trim() : "";
      const landmark = resolved.landmark && typeof resolved.landmark === "object"
        ? {
            name: String(resolved.landmark.name ?? "").trim(),
            placeId: String(resolved.landmark.placeId ?? "").trim(),
            distanceMeters: Number(resolved.landmark.distanceMeters)
          }
        : undefined;
      if (!landmark?.name && !area && !city && displayLocation === "Current location selected") return null;
      return locationFromCoords(latitude, longitude, {
        county: city || value.county || "Current location",
        town: area || city || value.town || "Current location",
        estateOrArea: area || value.estateOrArea || city || "Current location",
        nearestLandmark: landmark?.name || area || city || "Current location selected",
        addressText: displayLocation,
        landmark: landmark?.name && landmark.placeId && Number.isFinite(landmark.distanceMeters) ? landmark : undefined,
        area: area || undefined,
        city: city || undefined,
        displayLocation,
        locationSource: "current",
        landmarkResolved: !!landmark?.name
      });
    } catch {
      return null;
    }
  }

  async function approximateNetworkLocation() {
    const endpoints = ["https://ipapi.co/json/", "https://ipwho.is/"];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) continue;
        const payload = await response.json().catch(() => ({}));
        const latitude = Number(payload.latitude ?? payload.lat);
        const longitude = Number(payload.longitude ?? payload.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        const county = String(payload.region ?? payload.regionName ?? payload.city ?? value.county ?? "Current area");
        const town = String(payload.city ?? payload.town ?? value.town ?? "Current area");
        const addressText = [town, county, payload.country_name ?? payload.country]
          .filter(item => typeof item === "string" && item.trim())
          .join(", ");
        return locationFromCoords(latitude, longitude, {
          county,
          town,
          estateOrArea: value.estateOrArea || town,
          nearestLandmark: value.nearestLandmark || "Approximate network location",
          addressText: addressText || "Approximate location selected",
          displayLocation: addressText || "Approximate location selected",
          locationSource: "network",
          landmarkResolved: false
        });
      } catch {
        // Try the next lookup provider.
      }
    }
    return null;
  }

  function geolocationMessage(error: GeolocationPositionError) {
    if (error.code === 1) {
      return "Location permission is blocked. Open your browser site settings and allow Location for this page, then try again.";
    }
    if (error.code === 2) {
      return "Location permission is allowed, but your device did not return coordinates. Turn on Windows Location Services or phone GPS, then try again, or choose custom location.";
    }
    if (error.code === 3) {
      return "Finding your location took too long. Move outside or closer to a clear signal, then try again.";
    }
    return "Unable to access your current location. Allow location permission or choose custom location.";
  }

  function getBrowserPosition(options: PositionOptions) {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  function watchBrowserPosition(options: PositionOptions) {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      let watchId = -1;
      const timeoutId = window.setTimeout(() => {
        if (watchId >= 0) navigator.geolocation.clearWatch(watchId);
        reject({ code: 3, message: "Location request timed out." });
      }, 18000);
      watchId = navigator.geolocation.watchPosition(
        position => {
          window.clearTimeout(timeoutId);
          navigator.geolocation.clearWatch(watchId);
          resolve(position);
        },
        error => {
          window.clearTimeout(timeoutId);
          navigator.geolocation.clearWatch(watchId);
          reject(error);
        },
        options
      );
    });
  }

  function isGeoError(error: unknown): error is GeolocationPositionError {
    return typeof error === "object" && error !== null && "code" in error;
  }

  async function snapToCurrentLocation() {
    setMode("current");
    setLocationError("");
    setLocationNotice("");
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setLocationError(`Current location is blocked on insecure links like ${window.location.origin}. Use http://localhost:3000 on this computer, use an HTTPS tunnel for phone testing, or choose custom location.`);
      return;
    }
    if (!navigator.geolocation) {
      setLocationError("Current location is not available on this device.");
      return;
    }
    setLocatingLabel("Finding your location and nearby landmark...");
    setLocating(true);
    try {
      const position = await getBrowserPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 })
        .catch(async firstError => {
          if (isGeoError(firstError) && firstError.code === 1) throw firstError;
          return getBrowserPosition({ enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
        })
        .catch(async secondError => {
          if (isGeoError(secondError) && secondError.code === 1) throw secondError;
          return watchBrowserPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        });
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      setLocatingLabel("Finding nearby landmark...");
      const resolvedLocation = await resolveCurrentLocation(latitude, longitude);
      const details = resolvedLocation ? null : await reverseGeocode(latitude, longitude);
      const nextLocation = resolvedLocation ?? locationFromCoords(latitude, longitude, {
        ...(details ?? {}),
        locationSource: "current",
        landmarkResolved: false
      });
      onChange(nextLocation);
      setSearchQuery(nextLocation.displayLocation || nextLocation.addressText);
      setViewState(current => ({ ...current, longitude, latitude, zoom: 14 }));
    } catch (error) {
      if (isGeoError(error) && error.code !== 1) {
        const approximate = await approximateNetworkLocation();
        if (approximate) {
          onChange(approximate);
          setSearchQuery(approximate.addressText);
          setViewState(current => ({ ...current, longitude: approximate.longitude, latitude: approximate.latitude, zoom: 12 }));
          setLocationNotice("Exact GPS was not available, so Copic used an approximate network location. You can still adjust the pin or choose custom location.");
          return;
        }
      }
      setLocationError(isGeoError(error) ? geolocationMessage(error) : "Unable to access your current location. Choose custom location.");
    } finally {
      setLocating(false);
      setLocatingLabel("Finding location...");
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#4A463F] bg-[#2A2A2B] p-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant={mode === "current" ? "primary" : "ghost"} onClick={snapToCurrentLocation} disabled={locating}>
            <Crosshair size={17} /> {locating ? locatingLabel : "Use current location"}
          </Button>
          <Button type="button" variant={mode === "custom" ? "primary" : "ghost"} onClick={() => { setMode("custom"); setLocationError(""); setLocationNotice(""); }}>
            <MapPin size={17} /> Choose custom location
          </Button>
        </div>
      </div>
      <div className="relative">
        <label className="relative block">
          <MapPin size={17} className="absolute left-3 top-3.5 text-[#959087]" />
          <input
            value={searchQuery}
            onChange={event => void searchLocations(event.target.value)}
            placeholder="Search location, estate, road, or landmark"
            className="temp-location-search-input temp-input w-full py-3 pl-10 pr-3 outline-none"
          />
        </label>
        {(searching || searchResults.length > 0) && (
          <div className="temp-location-results absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-[#4A463F] bg-[#11120D] p-2 shadow-2xl">
            {searching && <p className="temp-location-results-loading px-3 py-2 text-sm text-[#CCC6BB]">Searching locations...</p>}
            {!searching && searchResults.map(result => (
              <button
                key={result.id}
                type="button"
                onClick={() => selectSearchResult(result)}
                className="temp-location-result block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#FFFBF4] transition hover:bg-[#2A2A2B]"
              >
                {result.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {value.addressText && (
        <p className="temp-selected-location rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-3 text-sm font-semibold text-[#FFFBF4]">
          Selected location: {value.displayLocation || value.addressText}
          {value.nearestLandmark && <span className="mt-1 block text-xs text-[#CCC6BB]">Nearest landmark: {value.nearestLandmark}</span>}
        </p>
      )}
      <label className="temp-label">Location description {requiresLocationDescription ? "required" : "optional"}
        <textarea
          value={value.locationDescription ?? ""}
          onChange={event => onChange({ ...value, locationDescription: event.target.value })}
          required={requiresLocationDescription}
          placeholder={requiresLocationDescription ? "No nearby landmark was found. Add a clear description workers can use." : "Add floor, gate, building color, entry instructions, or how to find you."}
          className="temp-input mt-2 min-h-24 p-3 outline-none"
        />
      </label>
      {requiresLocationDescription && <p className="text-xs font-bold text-amber-100">No nearby landmark was found, so workers will see this description instead.</p>}
      {locationNotice && <p className="temp-location-notice rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{locationNotice}</p>}
      {locationError && <p className="temp-location-error rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{locationError}</p>}
      {token ? (
        <div className="h-64 overflow-hidden rounded-xl border border-[#4A463F] md:h-72">
          <Map
            key="temp-location-map"
            mapboxAccessToken={token}
            {...viewState}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            onLoad={() => setMapReady(true)}
            onRemove={() => setMapReady(false)}
            onMove={event => setViewState(event.viewState)}
            onClick={event => {
              setMode("custom");
              onChange({ ...value, longitude: event.lngLat.lng, latitude: event.lngLat.lat, locationSource: "manual", landmarkResolved: true });
            }}
          >
            {mapReady && (
              <>
                <NavigationControl position="top-right" />
                <GeolocateControl
                  position="top-right"
                  positionOptions={{ enableHighAccuracy: true }}
                  onGeolocate={async event => {
                    setMode("current");
                    setLocating(true);
                    setLocatingLabel("Finding nearby landmark...");
                    const resolvedLocation = await resolveCurrentLocation(event.coords.latitude, event.coords.longitude);
                    const details = resolvedLocation ? null : await reverseGeocode(event.coords.latitude, event.coords.longitude);
                    const nextLocation = resolvedLocation ?? locationFromCoords(event.coords.latitude, event.coords.longitude, {
                      ...(details ?? {}),
                      locationSource: "current",
                      landmarkResolved: false
                    });
                    onChange(nextLocation);
                    setSearchQuery(nextLocation.displayLocation || nextLocation.addressText);
                    setLocating(false);
                    setLocatingLabel("Finding location...");
                  }}
                />
                <Marker longitude={value.longitude} latitude={value.latitude} anchor="bottom">
                  <MapPin size={28} className="fill-[#D8CFBC] text-[#11120D]" />
                </Marker>
              </>
            )}
          </Map>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-4 text-sm text-[#CCC6BB]">
          <Crosshair size={17} /> Location selection is temporarily unavailable.
        </div>
      )}
      <p className="text-xs text-[#959087]">Exact pin is saved internally for matching, maps, and directions.</p>
    </div>
  );
}
