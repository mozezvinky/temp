"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { LocationFields, UserProfile, WorkerSkillProfile } from "@/types";
import { cataloguePricing, serviceSectors, type CatalogueEntry } from "@/utils/service-catalogue";
import { defaultKenyaLocation } from "@/lib/location";
import { sendDirectHireRequest } from "@/services/jobs";
import { InspirationUpload } from "@/components/jobs/ServicePreferences";
import { AppModal } from "@/components/ui/AppModal";
import { ServiceImage } from "@/components/ui/ServiceImage";
import { PriceBreakdown } from "@/components/ui/PriceBreakdown";
import { Button } from "@/components/ui/Button";
import { kes } from "@/utils/money";
import { toast } from "sonner";
const MapPicker = dynamic(() => import("@/components/location/MapPicker"), { ssr: false });
type Offer = { worker: UserProfile; skill: WorkerSkillProfile; service: CatalogueEntry };
export function ServiceDiscovery({ workers, profile, search = "" }: { workers: UserProfile[]; profile: UserProfile | null; search?: string }) {
  const [term, setTerm] = useState("");
  const [sector, setSector] = useState("");
  const [maximum, setMaximum] = useState("");
  const [minimum, setMinimum] = useState("");
  const [area, setArea] = useState("");
  const [mode, setMode] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [style, setStyle] = useState("");
  const [selected, setSelected] = useState<Offer | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [arrangement, setArrangement] = useState<"shop" | "house">("house");
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState<LocationFields>(profile?.location ?? defaultKenyaLocation);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const offers = useMemo(() => workers.flatMap(worker => (worker.skillProfiles ?? []).flatMap(skill => (skill.catalogue ?? []).filter(service => service.active).map(service => ({ worker, skill, service })))).filter(({ worker, service }) =>
    service.name.toLowerCase().includes((term || search).trim().toLowerCase()) && (!sector || service.sector === sector) && (!minimum || service.price >= Number(minimum)) && (!maximum || service.price <= Number(maximum)) && (!area || `${worker.location?.county} ${worker.location?.town} ${worker.location?.area} ${service.publicShopLocation}`.toLowerCase().includes(area.toLowerCase())) && (!mode || (mode === "shop" ? service.shopVisit : service.houseCall)) && (!onlyAvailable || (service.available && worker.availability === "available"))
  ), [workers, term, search, sector, minimum, maximum, area, mode, onlyAvailable]);
  const styles = Array.from(new Set(offers.map(offer => offer.service.name.trim().toLowerCase())));
  const price = selected ? cataloguePricing(selected.service, addons, arrangement) : null;
  return <section className="copic-service-discovery rounded-2xl border border-current/15" aria-label="Discover services"><h2 className="text-2xl font-black">Discover styles & services</h2><p className="mt-2 text-sm">Browse a style, compare workers, then send a hire request. You can also browse workers below.</p>
    <div className="copic-service-filters grid sm:grid-cols-2 lg:grid-cols-3"><input aria-label="Search styles" placeholder="Search a style or service" className="temp-input min-w-0 p-3" value={term} onChange={event => { setTerm(event.target.value); setStyle(""); }} /><select aria-label="Service category" className="temp-input min-w-0 p-3" value={sector} onChange={event => { setSector(event.target.value); setStyle(""); }}><option value="">All sectors</option>{serviceSectors.map(item => <option key={item.name}>{item.name}</option>)}<option>Other</option></select><input aria-label="Minimum service price" type="number" min={0} placeholder="Minimum price (KSh)" className="temp-input min-w-0 p-3" value={minimum} onChange={event => setMinimum(event.target.value)} /><input aria-label="Maximum service price" type="number" min={0} placeholder="Maximum price (KSh)" className="temp-input min-w-0 p-3" value={maximum} onChange={event => setMaximum(event.target.value)} /><input aria-label="Service area" placeholder="County, town or shop area" className="temp-input min-w-0 p-3" value={area} onChange={event => setArea(event.target.value)} /><select aria-label="Visit arrangement" className="temp-input p-3" value={mode} onChange={event => setMode(event.target.value)}><option value="">Shop visits / house calls</option><option value="shop">Shop visit</option><option value="house">House call</option></select><label className="flex items-center gap-2"><input type="checkbox" checked={onlyAvailable} onChange={event => setOnlyAvailable(event.target.checked)} />Available workers and services</label></div>
    {style && <Button type="button" variant="ghost" onClick={() => setStyle("")}>Back to styles</Button>}
    {!offers.length && <p className="py-6">No matching catalogue services yet. Workers without catalogues remain listed below.</p>}
    <div className="copic-service-grid">{!style ? styles.map(key => {
      const matching = offers.filter(offer => offer.service.name.trim().toLowerCase() === key), first = matching[0];
      return <button type="button" key={key} className="copic-service-card border border-current/15" onClick={() => setStyle(key)}><ServiceImage src={first.service.images[0]} alt={first.service.name} className="aspect-[4/3] w-full object-cover" /><div className="p-4"><h3 className="font-bold">{first.service.name}</h3><p>{first.service.sector}</p><p className="mt-2 font-bold">From {kes(Math.min(...matching.map(item => item.service.price)))}</p><p className="text-sm">Compare {matching.length} offer{matching.length === 1 ? "" : "s"}</p></div></button>;
    }) : offers.filter(offer => offer.service.name.trim().toLowerCase() === style).map(offer => <article key={`${offer.worker.id}-${offer.service.id}`} className="copic-service-card gap-3 border border-current/15 p-4"><ServiceImage src={offer.service.images[0]} alt={offer.service.name} className="aspect-[4/3] w-full rounded-lg object-cover" /><h3 className="mt-3 font-bold">{offer.worker.displayName}</h3><p>{offer.service.name} · {kes(offer.service.price)}</p><p className="text-sm">{offer.worker.verificationStatus === "approved" ? "Identity verified · " : ""}{offer.worker.ratingAverage ? `${offer.worker.ratingAverage}/5 · ` : ""}{offer.worker.location?.town} {offer.worker.location?.county}</p><p className="text-sm">{offer.service.available ? "Accepting requests" : "Unavailable"} · {offer.service.shopVisit && "Shop visits "}{offer.service.houseCall && "House calls"}</p><Button type="button" disabled={!offer.service.available} onClick={() => { setSelected(offer); setAddons([]); setImages([]); setBudget(""); setArrangement(offer.service.houseCall ? "house" : "shop"); }}>View service & request</Button></article>)}</div>
    {selected && price && <AppModal title={selected.service.name} eyebrow={selected.worker.displayName} onClose={() => setSelected(null)}><form className="grid gap-4" onSubmit={async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
      try { await sendDirectHireRequest({ workerId: selected.worker.id, skillId: selected.skill.id, catalogueId: selected.service.id, addonIds: addons, arrangement, maximumBudget: Number(budget), preferredAt: new Date(`${String(form.get("date"))}:00+03:00`).toISOString(), serviceLocation: location.addressText, instructions: String(form.get("instructions") ?? ""), inspirationImages: images, title: selected.service.name, category: selected.service.sector, location: location.addressText, locationDetails: location, startDate: String(form.get("date")), duration: `${selected.service.durationMinutes} minutes` }); toast.success("Hire request sent. The worker will confirm availability."); setSelected(null); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Unable to send request."); } finally { setBusy(false); }
    }}><p>{selected.worker.displayName} · {selected.service.durationMinutes} minutes</p><p>{selected.service.description}</p><div className="copic-gallery" aria-label="Service photo gallery">{selected.service.images.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={`${url}-${index}`}><ServiceImage src={url} alt={selected.service.name} className="h-40 w-40 max-w-none rounded-xl object-cover" /></a>)}</div>
      <fieldset><legend className="font-bold">Optional extras</legend>{selected.service.addons.filter(extra => extra.active).map(extra => <label key={extra.id} className="mt-2 flex gap-2"><input type="checkbox" checked={addons.includes(extra.id)} onChange={event => setAddons(event.target.checked ? [...addons, extra.id] : addons.filter(id => id !== extra.id))} /><span>{extra.name} · {kes(extra.price)}<small className="block">{extra.description}</small></span></label>)}</fieldset>
      <label className="temp-label">Arrangement<select className="temp-input p-3" value={arrangement} onChange={event => setArrangement(event.target.value as "shop" | "house")}>{selected.service.houseCall && <option value="house">House call · additional {kes(selected.service.houseCallFee)}</option>}{selected.service.shopVisit && <option value="shop">Shop visit</option>}</select></label>
      {arrangement === "shop" ? <p>Public service location: {selected.service.publicShopLocation}</p> : <MapPicker value={location} onChange={setLocation} showMap={false} resetOnCustom />}
      <label className="temp-label">Preferred date and time (EAT; subject to worker acceptance)<input name="date" type="datetime-local" required className="temp-input p-3" /></label><label className="temp-label">Maximum budget (KSh)<input required type="number" min={50} step={1} className="temp-input p-3" value={budget} onChange={event => setBudget(event.target.value)} /></label><InspirationUpload images={images} onChange={setImages} onBusy={setUploading} /><label className="temp-label">Additional instructions<textarea name="instructions" maxLength={2500} className="temp-input p-3" /></label>
      <PriceBreakdown lines={[{ label: selected.service.name, amount: selected.service.price }, ...selected.service.addons.filter(extra => addons.includes(extra.id)).map(extra => ({ label: extra.name, amount: extra.price })), ...(arrangement === "house" ? [{ label: "House call", amount: selected.service.houseCallFee }] : [])]} totalLabel="Proposed client total" total={price.total} fee={price.serviceFee} workerNet={price.workerEarnings} note={`Your maximum budget stays ${kes(Number(budget))}. The appointment is a preference until the worker accepts.`} />
      {budget && price.total > Number(budget) && <p role="alert" className="text-red-500">The proposed total exceeds your budget. Revise your selection or budget.</p>}<Button type="submit" disabled={busy || uploading || !budget || price.total > Number(budget)}>{busy ? "Sending…" : "Send hire request"}</Button>
    </form></AppModal>}
  </section>;
}
