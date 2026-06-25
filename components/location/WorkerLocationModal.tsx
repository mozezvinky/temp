"use client";

import dynamic from "next/dynamic";
import { AppModal } from "@/components/ui/AppModal";
import { Button } from "@/components/ui/Button";
import { defaultKenyaLocation } from "@/lib/location";
import { updateProfileLocation } from "@/services/profile-location";
import type { LocationFields, UserProfile } from "@/types";
import { useState } from "react";
import { toast } from "sonner";

const MapPicker = dynamic(() => import("@/components/location/MapPicker"), { ssr: false });

export function WorkerLocationModal({ profile, onClose, onSaved }: { profile: UserProfile; onClose: () => void; onSaved?: () => Promise<void> | void }) {
  const [location, setLocation] = useState<LocationFields>(profile.location ?? defaultKenyaLocation);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!location.addressText || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
      setError("Choose a valid location before saving.");
      return;
    }
    setSaving(true);
    try {
      await updateProfileLocation(location);
      await onSaved?.();
      toast.success("Location updated.");
      onClose();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to save location.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal eyebrow="Worker location" title={profile.location ? "Change Location" : "Set Up Your Location"} onClose={onClose} maxWidth="max-w-4xl">
      <div className="grid gap-5">
        <p className="text-sm text-[#CCC6BB]">Use your current device location, search for a place, or manually choose a custom location. Existing location data is only replaced when you save.</p>
        <MapPicker value={location} onChange={setLocation} />
        {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" className="temp-success-button" disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save location"}</Button>
        </div>
      </div>
    </AppModal>
  );
}
