"use client";
import { useEffect, useState } from "react";
import { requireAuth } from "@/lib/firebase";
import { uploadServiceImage } from "@/services/service-catalogue";
import { sectorForSkill } from "@/utils/service-catalogue";
import { toast } from "sonner";

export type ServicePreferencesValue = { arrangement: "shop" | "house"; extras: string[]; inspirationImages: string[]; instructions: string };
export const emptyServicePreferences: ServicePreferencesValue = { arrangement: "house", extras: [], inspirationImages: [], instructions: "" };
export function PrivateMedia({ url, label = "Reference photo" }: { url: string; label?: string }) {
  const [source, setSource] = useState("");
  const [pdf, setPdf] = useState(false);
  useEffect(() => {
    let alive = true, objectUrl = "";
    void (async () => {
      const user = requireAuth().currentUser;
      if (!user) return;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!response.ok) return;
      const blob = await response.blob();
      if (alive) setPdf(blob.type === "application/pdf");
      objectUrl = URL.createObjectURL(blob);
      if (alive) setSource(objectUrl); else URL.revokeObjectURL(objectUrl);
    })().catch(() => {});
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  return source ? <a href={source} target="_blank" rel="noreferrer" className="inline-block">{!pdf && <img src={source} alt={label} className="h-24 w-24 rounded-lg object-cover" />}<span className="text-xs">Open {label.toLowerCase()}</span></a> : <span className="text-xs">Private attachment</span>;
}
export function InspirationUpload({ images, onChange, onBusy }: { images: string[]; onChange: (images: string[]) => void; onBusy?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  return <div className="grid gap-2"><label className="temp-label">Inspiration photos · up to 8 · JPEG, PNG, WebP · 8 MB each<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async event => {
    const files = Array.from(event.target.files ?? []); event.target.value = "";
    if (files.length + images.length > 8) { toast.error("Choose up to 8 images."); return; }
    setBusy(true); onBusy?.(true);
    try { const uploaded = []; for (const file of files) uploaded.push(await uploadServiceImage(file, "inspiration")); onChange([...images, ...uploaded]); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); onBusy?.(false); }
  }} /></label>{busy && <p role="status">Uploading photos…</p>}<div className="flex flex-wrap gap-3">{images.map((url, index) => <div key={url}><PrivateMedia url={url} /><button type="button" className="block text-sm underline" disabled={busy} onClick={() => onChange(images.filter((_, i) => i !== index))}>Remove photo {index + 1}</button></div>)}</div></div>;
}
export function ServicePreferences({ category, value, onChange, onBusy }: { category: string; value: ServicePreferencesValue; onChange: (value: ServicePreferencesValue) => void; onBusy?: (busy: boolean) => void }) {
  const sector = sectorForSkill(category);
  return <div className="grid gap-4"><label className="temp-label">Service arrangement<select className="temp-input p-3" value={value.arrangement} onChange={event => onChange({ ...value, arrangement: event.target.value as "shop" | "house" })}><option value="house">House call — worker comes to your location</option><option value="shop">Shop visit — location to be agreed with worker</option></select></label>
    {sector && <fieldset><legend className="font-bold">Would you like to include any additional services?</legend><p className="text-sm">Optional requirements; your maximum budget stays the same.</p>{sector.extras.map(extra => <label key={extra} className="mt-2 flex gap-2"><input type="checkbox" checked={value.extras.includes(extra)} onChange={event => onChange({ ...value, extras: event.target.checked ? [...value.extras, extra] : value.extras.filter(item => item !== extra) })} />{extra}</label>)}</fieldset>}
    <InspirationUpload images={value.inspirationImages} onChange={images => onChange({ ...value, inspirationImages: images })} onBusy={onBusy} />
    <label className="temp-label">Additional instructions<textarea maxLength={2500} className="temp-input p-3" value={value.instructions} onChange={event => onChange({ ...value, instructions: event.target.value })} /></label>
  </div>;
}
export function ServiceRequestDetails({ preferences }: { preferences?: ServicePreferencesValue }) {
  if (!preferences) return null;
  return <div className="mt-3 grid gap-2 text-sm"><p>{preferences.arrangement === "shop" ? "Shop visit requested" : "House call requested"}</p>{preferences.extras.length > 0 && <p>Requested extras: {preferences.extras.join(", ")}</p>}{preferences.instructions && <p>{preferences.instructions}</p>}<div className="flex flex-wrap gap-2">{preferences.inspirationImages.map(url => <PrivateMedia key={url} url={url} />)}</div></div>;
}
