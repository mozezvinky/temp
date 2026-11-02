"use client";
import { normalizeSkillVerificationStatus } from "@/utils/worker-skills";
import { sectorForSkill } from "@/utils/service-catalogue";
import dynamic from "next/dynamic";
import { defaultKenyaLocation } from "@/lib/location";
import { useState } from "react";
import type { WorkerSkillProfile } from "@/types";
import { catalogueRequest, uploadServiceImage } from "@/services/service-catalogue";
import { serviceSectors, type CatalogueEntry } from "@/utils/service-catalogue";
import { ServiceImage } from "@/components/ui/ServiceImage";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { toast } from "sonner";

const MapPicker = dynamic(() => import("@/components/location/MapPicker"), { ssr: false });

export function ServiceCatalogueManager({ skills, onSaved }: { skills: WorkerSkillProfile[]; onSaved: () => Promise<void> }) {
  const [skillId, setSkillId] = useState("");
  const [entry, setEntry] = useState<CatalogueEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const approved = skills.filter(skill => normalizeSkillVerificationStatus(skill.verificationStatus) === "approved");
  function start(skill: WorkerSkillProfile, value?: CatalogueEntry) {
    setSkillId(skill.id);
    setEntry(value ?? { id: crypto.randomUUID(), name: "", description: "", sector: sectorForSkill(skill.name)?.name ?? "Other", images: [], price: 50, durationMinutes: 60, active: true, available: true, shopVisit: false, houseCall: true, houseCallFee: 0, publicShopLocation: "", addons: [], createdAt: "", updatedAt: "" });
  }
  async function save(action = "save", id?: string, parent?: string) {
    setBusy(true);
    try { await catalogueRequest("/api/profile/catalogue", { action, id, skillId: parent ?? skillId, entry }); await onSaved(); setEntry(null); toast.success("Catalogue updated."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save."); }
    finally { setBusy(false); }
  }
  return <Card className="copic-service-manager"><h2 className="text-2xl font-black">My services / portfolio</h2><p className="mt-2 text-sm">Add styles under an approved skill. Prices are the full client total, including COPIC’s fee. Certificate review uses Edit skill.</p>
    {!approved.length && <p className="mt-4">Your approved skills will appear here.</p>}
    {approved.map(skill => <section key={skill.id} className="mt-5"><h3 className="font-bold">{skill.name}</h3><Button type="button" onClick={() => start(skill)}>Add service</Button><div className="copic-service-grid mt-4">{skill.catalogue?.map(item => <article key={item.id} className="copic-service-card border border-current/20"><ServiceImage src={item.images[0]} alt={item.name} className="aspect-[4/3] w-full rounded-lg object-cover" /><h4 className="mt-2 font-bold">{item.name}</h4><p>KSh {item.price.toLocaleString()} · {item.durationMinutes} min</p><p>{item.active ? "Visible" : "Hidden"} · {item.available ? "Available" : "Unavailable"}</p><div className="copic-actions mt-2"><Button type="button" onClick={() => start(skill, structuredClone(item))}>Edit / preview</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => save("delete", item.id, skill.id)}>Delete</Button></div></article>)}</div></section>)}
    {entry && <form className="mt-6 grid gap-4 border-t border-current/20 pt-5" onSubmit={event => { event.preventDefault(); void save(); }}>
      <h3 className="text-xl font-bold">Service details</h3>
      <label className="temp-label">Service / style name<input required maxLength={100} className="temp-input p-3" value={entry.name} onChange={event => setEntry({ ...entry, name: event.target.value })} /></label>
      <label className="temp-label">Sector<select className="temp-input p-3" value={entry.sector} onChange={event => setEntry({ ...entry, sector: event.target.value as CatalogueEntry["sector"] })}><option>Other</option>{serviceSectors.map(sector => <option key={sector.name}>{sector.name}</option>)}</select></label>
      <label className="temp-label">Description<textarea className="temp-input p-3" maxLength={1500} value={entry.description} onChange={event => setEntry({ ...entry, description: event.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="temp-label">Client price (KSh)<input required type="number" min={50} step={1} className="temp-input p-3" value={entry.price} onChange={event => setEntry({ ...entry, price: Number(event.target.value) })} /></label><label className="temp-label">Duration (minutes)<input required type="number" min={5} max={10080} className="temp-input p-3" value={entry.durationMinutes} onChange={event => setEntry({ ...entry, durationMinutes: Number(event.target.value) })} /></label></div>
      <label className="temp-label">Photos · first is the cover · up to 8, 8 MB each<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async event => { const files = Array.from(event.target.files ?? []); if (files.length + entry.images.length > 8) { toast.error("Choose up to 8 images."); return; } setBusy(true); try { const urls = []; for (const file of files) urls.push(await uploadServiceImage(file, "catalogue")); setEntry({ ...entry, images: [...entry.images, ...urls] }); } catch (error) { toast.error(String(error)); } finally { setBusy(false); } }} /></label>
      <div className="flex flex-wrap gap-2">{entry.images.map((url, index) => <button key={`${url}-${index}`} type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => setEntry({ ...entry, images: entry.images.filter((_, i) => i !== index) })}><ServiceImage src={url} alt={`Preview ${index + 1}; click to remove`} className="h-24 w-24 rounded-lg object-cover" /></button>)}</div>
      <details><summary>Reuse an uploaded photo</summary><div className="flex flex-wrap gap-2">{Array.from(new Set(skills.flatMap(skill => skill.catalogue?.flatMap(item => item.images) ?? []))).map(url => <button key={url} type="button" disabled={entry.images.includes(url) || entry.images.length >= 8} onClick={() => setEntry({ ...entry, images: [...entry.images, url] })}><ServiceImage src={url} alt="Reuse photo" className="h-20 w-20 object-cover" /></button>)}</div></details>
      {([['active', 'Show in catalogue'], ['available', 'Available for requests'], ['shopVisit', 'Shop visits'], ['houseCall', 'House calls']] as const).map(([key, text]) => <label key={key} className="flex gap-2"><input type="checkbox" checked={entry[key]} onChange={event => setEntry({ ...entry, [key]: event.target.checked })} />{text}</label>)}
      {entry.shopVisit && <div><p className="font-bold">Designate a public service location</p><p className="text-sm">This address and map location will be visible to clients.</p><MapPicker value={entry.shopLocation ?? defaultKenyaLocation} onChange={location => setEntry({ ...entry, publicShopLocation: location.addressText, shopLocation: location })} showMap={false} resetOnCustom /></div>}
      {entry.houseCall && <label className="temp-label">Additional house-call charge (KSh)<input type="number" min={0} step={1} required className="temp-input p-3" value={entry.houseCallFee} onChange={event => setEntry({ ...entry, houseCallFee: Number(event.target.value) })} /></label>}
      <h4 className="font-bold">Optional add-ons</h4>{entry.addons.map((addon, index) => <div key={addon.id} className="grid gap-2 rounded-xl border border-current/20 p-3"><label>Name<input required className="temp-input w-full p-2" value={addon.name} onChange={event => setEntry({ ...entry, addons: entry.addons.map((item, i) => i === index ? { ...item, name: event.target.value } : item) })} /></label><label>Description<input className="temp-input w-full p-2" value={addon.description} onChange={event => setEntry({ ...entry, addons: entry.addons.map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} /></label><label>Price (KSh)<input type="number" min={0} step={1} required className="temp-input w-full p-2" value={addon.price} onChange={event => setEntry({ ...entry, addons: entry.addons.map((item, i) => i === index ? { ...item, price: Number(event.target.value) } : item) })} /></label><label>Optional image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); try { const image = await uploadServiceImage(file, "catalogue"); setEntry({ ...entry, addons: entry.addons.map((item, i) => i === index ? { ...item, image } : item) }); } catch (error) { toast.error(String(error)); } finally { setBusy(false); } }} /></label>{addon.image && <ServiceImage src={addon.image} alt={addon.name} className="h-20 w-20 object-cover" />}<label><input type="checkbox" checked={addon.active} onChange={event => setEntry({ ...entry, addons: entry.addons.map((item, i) => i === index ? { ...item, active: event.target.checked } : item) })} /> Enabled</label><Button type="button" variant="ghost" onClick={() => setEntry({ ...entry, addons: entry.addons.filter(item => item.id !== addon.id) })}>Remove extra</Button></div>)}
      <Button type="button" disabled={entry.addons.length >= 30} onClick={() => setEntry({ ...entry, addons: [...entry.addons, { id: crypto.randomUUID(), name: "", description: "", price: 0, active: true }] })}>Add optional extra</Button>
      <div className="copic-actions"><Button type="submit" disabled={busy || !entry.images.length}>{busy ? "Saving…" : "Save service"}</Button><Button type="button" variant="ghost" onClick={() => setEntry(null)}>Cancel</Button></div>
    </form>}
  </Card>;
}
