"use client";

import { Button } from "@/components/ui/Button";
import { AppModal } from "@/components/ui/AppModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useLiveVerificationStatus } from "@/hooks/useLiveVerificationStatus";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { defaultKenyaLocation } from "@/lib/location";
import { sendMessage, subscribeMessages, subscribeUserConversations } from "@/services/chat";
import { sendDirectHireRequest, subscribeApplications } from "@/services/jobs";
import { subscribeWorkers } from "@/services/users";
import type { Application, Conversation, LocationFields, Message, UserProfile, WorkerSkillProfile } from "@/types";
import { calculateDirectHirePricing, pluralUnit, quantityLabel, resolveSkillPricingType, resolveSkillUnit, singularUnit } from "@/utils/direct-hire-pricing";
import { clientCanPost, workerCanApplyToJob } from "@/utils/jobRules";
import { jobLocationLabel } from "@/utils/location-display";
import { kes } from "@/utils/money";
import { clientRateLabel, normalizeSearchTerm, scoreWorkerMatch, type WorkerSearchMatch } from "@/utils/worker-search";
import { normalizeVerificationStatus } from "@/utils/verification";
import dynamic from "next/dynamic";
import { BriefcaseBusiness, Check, MapPin, MessageCircle, Search, Send, Star } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const MapPicker = dynamic(() => import("@/components/location/MapPicker"), { ssr: false });
const headline = "Who are you looking to hire?";

export default function WorkersPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute(["client", "admin"]);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [showRehire, setShowRehire] = useState(false);
  const [availableWorkers, setAvailableWorkers] = useState<UserProfile[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [clientLocation, setClientLocation] = useState<LocationFields | null>(null);
  const [error, setError] = useState("");
  const [hireWorker, setHireWorker] = useState<UserProfile | null>(null);
  const [hireSkill, setHireSkill] = useState<WorkerSkillProfile | null>(null);
  const [hireLocation, setHireLocation] = useState<LocationFields>(emptyHireLocation());
  const [hireQuantity, setHireQuantity] = useState(1);
  const [sendingHire, setSendingHire] = useState(false);
  const [typedHeadline, setTypedHeadline] = useState(headline);
  const [messageWorker, setMessageWorker] = useState<UserProfile | null>(null);
  const [messageConversation, setMessageConversation] = useState<Conversation | null>(null);
  const [messageHistory, setMessageHistory] = useState<Message[]>([]);
  const [messageLoading, setMessageLoading] = useState(false);
  const { status: liveVerificationStatus, checking: checkingVerification } = useLiveVerificationStatus(profile?.verificationStatus);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setTypedHeadline(headline);
      return;
    }
    setTypedHeadline("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTypedHeadline(headline.slice(0, index));
      if (index >= headline.length) window.clearInterval(timer);
    }, 22);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    return subscribeWorkers(
      items => {
        setAvailableWorkers(items);
        setError("");
      },
      error => setError(isOfflineError(error) ? connectionPausedMessage() : "Workers could not refresh. Your saved list remains visible.")
    );
  }, [isAuthorized]);

  useEffect(() => {
    if (!profile?.id || profile.role !== "client") return;
    return subscribeApplications(profile.id, "client", setApplications, () => setApplications([]));
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (profile?.location) setClientLocation(profile.location);
  }, [profile?.location]);

  useEffect(() => {
    if (clientLocation || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      position => setClientLocation({
        ...defaultKenyaLocation,
        addressText: "Current area",
        displayLocation: "Current area",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        locationSource: "current",
        landmarkResolved: false
      }),
      () => undefined,
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
    );
  }, [clientLocation]);

  useEffect(() => {
    if (!profile || !messageWorker) return;
    setMessageLoading(true);
    setMessageConversation(null);
    setMessageHistory([]);
    return subscribeUserConversations(profile.id, conversations => {
      const conversation = conversations.find(item =>
        item.workerId === messageWorker.id ||
        item.workerId === messageWorker.uid ||
        (Array.isArray(item.participants) && item.participants.includes(profile.id) && item.participants.includes(messageWorker.id))
      ) ?? null;
      setMessageConversation(conversation);
      setMessageLoading(false);
    }, () => {
      setMessageConversation(null);
      setMessageLoading(false);
    });
  }, [messageWorker, profile]);

  useEffect(() => {
    if (!messageConversation) return;
    return subscribeMessages(messageConversation.id, setMessageHistory, () => setMessageHistory([]));
  }, [messageConversation]);

  const results = useMemo(() => {
    const currentUserIds = new Set([profile?.id, profile?.uid].filter(Boolean));
    const query = showRehire ? "" : submittedSearch;
    const rehireIds = showRehire ? previouslyHiredWorkerIds(applications) : null;
    const matches = availableWorkers.flatMap(worker => {
      if (currentUserIds.has(worker.id) || currentUserIds.has(worker.uid)) return [];
      if (rehireIds && !rehireIds.has(worker.id) && !rehireIds.has(worker.uid)) return [];
      const skills = workerSkillProfiles(worker);
      if (!skills.length) return [];
      const match = showRehire
        ? bestRehireMatch(worker, skills, applications)
        : scoreWorkerMatch(worker, skills, query, clientLocation);
      return match ? [match] : [];
    });
    return matches.sort((first, second) => {
      const recentDiff = (showRehire ? rehireLastHiredAt(applications, second.worker.id) - rehireLastHiredAt(applications, first.worker.id) : 0);
      return recentDiff || second.score - first.score;
    });
  }, [applications, availableWorkers, clientLocation, profile?.id, profile?.uid, showRehire, submittedSearch]);

  const searched = showRehire || !!submittedSearch;

  function runSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const normalized = normalizeSearchTerm(search);
    if (!normalized) {
      setSubmittedSearch("");
      setShowRehire(false);
      toast.message("Type who you want to hire, for example mama fua, kibarua, or gardener.");
      return;
    }
    setSubmittedSearch(search.trim());
    setShowRehire(false);
    setHireSkill(null);
  }

  function showRehireResults() {
    setShowRehire(true);
    setSubmittedSearch("");
    setHireSkill(null);
  }

  function requestSkill(worker: UserProfile, skill: WorkerSkillProfile) {
    if (profile?.role !== "client") return;
    if (checkingVerification) {
      toast.message("Checking your verification status. Try again in a moment.");
      return;
    }
    if (!clientCanPost({ verificationStatus: liveVerificationStatus })) {
      toast.error("Verify your identity before posting jobs.");
      return;
    }
    const allowedWorker = workerCanApplyToJob(worker, { title: skill.name, category: skill.chargeCategory ?? skill.category, requiredSkills: [skill.name] });
    if (!allowedWorker.ok) {
      toast.error(allowedWorker.reason);
      return;
    }
    if (worker.isOccupied) {
      toast.error(`${worker.displayName} is occupied on another job right now.`);
      return;
    }
    setHireWorker(worker);
    setHireSkill(skill);
    setHireLocation(emptyHireLocation());
    setHireQuantity(1);
  }

  async function submitHireRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hireWorker || !hireSkill) return;
    if (checkingVerification) {
      toast.message("Checking your verification status. Try again in a moment.");
      return;
    }
    if (!clientCanPost({ verificationStatus: liveVerificationStatus })) {
      toast.error("Verify your identity before posting jobs.");
      return;
    }
    const allowedWorker = workerCanApplyToJob(hireWorker, { title: hireSkill.name, category: hireSkill.chargeCategory ?? hireSkill.category, requiredSkills: [hireSkill.name] });
    if (!allowedWorker.ok) {
      toast.error(allowedWorker.reason);
      return;
    }
    if (!hireLocation.addressText || !Number.isFinite(hireLocation.latitude) || !Number.isFinite(hireLocation.longitude)) {
      toast.error("Choose a valid job location before sending the request.");
      return;
    }
    if (hireLocation.locationSource === "current" && hireLocation.landmarkResolved === false && !hireLocation.locationDescription?.trim()) {
      toast.error("Add a location description because no nearby landmark was found.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setSendingHire(true);
    try {
      await sendDirectHireRequest({
        workerId: hireWorker.id,
        skillId: hireSkill.id,
        title: String(form.get("title") ?? hireSkill.name),
        category: String(form.get("category") ?? hireSkill.chargeCategory ?? hireSkill.name),
        quantity: hireQuantity,
        location: hireLocation.addressText,
        locationDetails: hireLocation,
        startDate: String(form.get("startDate") ?? ""),
        duration: String(form.get("duration") ?? ""),
        description: String(form.get("description") ?? "")
      });
      toast.success(`Hire request sent to ${hireWorker.displayName}.`);
      setHireSkill(null);
      setHireWorker(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send hire request.");
    } finally {
      setSendingHire(false);
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !messageConversation) return;
    const input = event.currentTarget.elements.namedItem("body") as HTMLInputElement;
    const body = input.value.trim();
    if (!body) return;
    try {
      await sendMessage(messageConversation, profile.id, body);
      input.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send message.");
    }
  }

  if (loading || !isAuthorized) return <LoadingSpinner label="Checking client access" />;

  return (
    <div className="workers-search-page">
      <section className={`workers-search-hero ${searched ? "is-compact" : ""}`}>
        <h1 aria-label={headline}><span aria-hidden="true">{typedHeadline}</span><span className="workers-type-caret" aria-hidden="true" /></h1>
        <form className="workers-search-box" onSubmit={runSearch}>
          <label className="workers-search-input">
            <Search size={21} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="mama fua, cleaner, kibarua, gardener..." />
          </label>
          <div className="workers-search-actions">
            <Button type="button" variant="secondary" onClick={showRehireResults}>Rehire</Button>
            <Button type="submit" className="workers-search-submit">Search</Button>
          </div>
        </form>
      </section>

      {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-700 dark:text-red-200">{error}</p>}

      {searched ? (
        <section className="workers-results-shell">
          <div className="workers-results-head">
            <div>
              <p className="workers-results-kicker">{showRehire ? "Previous hires" : "Search results"}</p>
              <h2>{showRehire ? "Workers you have hired before" : submittedSearch}</h2>
            </div>
            <p>{results.length} result{results.length === 1 ? "" : "s"}</p>
          </div>
          {results.length ? (
            <div className="workers-result-grid">
              {results.map(match => <WorkerResultCard key={`${match.worker.id}-${match.skill.id}`} match={match} active={hireWorker?.id === match.worker.id && hireSkill?.id === match.skill.id} onHire={() => requestSkill(match.worker, match.skill)} onMessage={() => setMessageWorker(match.worker)} />)}
            </div>
          ) : (
            <EmptyState title={showRehire ? "No previous hires yet" : "No matching workers found"} body={showRehire ? "Completed or accepted workers you hired will appear here." : "Try a related term like cleaner, mama fua, kibarua, gardener, or errands."} />
          )}
        </section>
      ) : (
        <section className="workers-suggestion-strip" aria-label="Suggested searches">
          {["mama fua", "kibarua", "gardener", "errands"].map(term => <button key={term} type="button" onClick={() => { setSearch(term); setSubmittedSearch(term); }}>{term}</button>)}
        </section>
      )}

      {hireWorker && hireSkill && (
        <HirePanel
          worker={hireWorker}
          skill={hireSkill}
          quantity={hireQuantity}
          location={hireLocation}
          sending={sendingHire}
          onQuantityChange={setHireQuantity}
          onLocationChange={setHireLocation}
          onClose={() => { setHireWorker(null); setHireSkill(null); }}
          onSubmit={submitHireRequest}
        />
      )}

      {messageWorker && (
        <AppModal eyebrow="Messages" title={messageWorker.displayName} onClose={() => { setMessageWorker(null); setMessageConversation(null); setMessageHistory([]); }} maxWidth="max-w-lg">
          <div className="worker-message-modal">
            {messageLoading ? (
              <LoadingSpinner label="Opening messages" />
            ) : messageConversation ? (
              <>
                <div className="worker-message-history">
                  {messageHistory.length ? messageHistory.map(message => (
                    <p key={message.id} className={`worker-message-bubble ${message.senderId === profile?.id ? "is-mine" : ""}`}>{message.body ?? "Image message"}</p>
                  )) : <p className="text-sm text-[#959087]">No messages yet.</p>}
                </div>
                {!messageConversation.locked && (
                  <form className="worker-message-form" onSubmit={submitMessage}>
                    <input name="body" required className="temp-input min-w-0 flex-1 rounded-xl px-4 py-3 outline-none" placeholder="Write a message" />
                    <Button type="submit" aria-label="Send message"><Send size={18} /></Button>
                  </form>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-bone/10 bg-bone/[.04] p-4 text-sm text-[#CCC6BB]">
                <MessageCircle size={22} />
                <p className="mt-3 font-bold">No chat history with this worker yet.</p>
                <p className="mt-1">Chat opens after an accepted job arrangement.</p>
              </div>
            )}
          </div>
        </AppModal>
      )}
    </div>
  );
}

function WorkerResultCard({ match, active, onHire, onMessage }: { match: WorkerSearchMatch; active: boolean; onHire: () => void; onMessage: () => void }) {
  const { worker, skill } = match;
  const completed = Math.max(Number(worker.completedJobs || 0), Number(skill.completedJobs || 0), Number(worker.ratingCount || 0), Number(skill.ratingCount || 0));
  const rating = Number(skill.ratingAverage || worker.ratingAverage || 0);
  return (
    <article className={`worker-result-card ${active ? "is-active" : ""}`}>
      <button type="button" className="worker-result-avatar" onClick={onMessage} aria-label={`Message ${worker.displayName}`}>
        {worker.photoURL ? <img src={worker.photoURL} alt={worker.displayName} style={{ objectPosition: `${worker.photoPositionX ?? 50}% ${worker.photoPositionY ?? 50}%`, transform: `scale(${worker.photoZoom ?? 1})`, transformOrigin: `${worker.photoPositionX ?? 50}% ${worker.photoPositionY ?? 50}%` }} /> : worker.displayName.charAt(0).toUpperCase()}
      </button>
      <div className="worker-result-main">
        <div className="worker-result-title">
          <button type="button" onClick={onMessage}>{worker.displayName}</button>
          {normalizeVerificationStatus(worker.verificationStatus) === "approved" && <span aria-label="Verified worker"><Check size={15} /></span>}
        </div>
        <p>{skill.name}</p>
        <div className="worker-result-meta">
          <span><Star size={15} /> {rating.toFixed(1)}</span>
          <span><BriefcaseBusiness size={15} /> {completed} Jobs completed</span>
        </div>
      </div>
      <div className="worker-result-action">
        <strong>{clientRateLabel(skill, kes)}</strong>
        <Button type="button" onClick={onHire} className="worker-hire-button">Hire</Button>
      </div>
    </article>
  );
}

function HirePanel({ worker, skill, quantity, location, sending, onQuantityChange, onLocationChange, onClose, onSubmit }: {
  worker: UserProfile;
  skill: WorkerSkillProfile;
  quantity: number;
  location: LocationFields;
  sending: boolean;
  onQuantityChange: (value: number) => void;
  onLocationChange: (location: LocationFields) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const pricing = calculateDirectHirePricing(skill, quantity);
  const pricingType = resolveSkillPricingType(skill);
  const unit = singularUnit(resolveSkillUnit(skill));
  const plural = pluralUnit(unit);
  return (
    <section className="worker-hire-panel" aria-label={`Hire ${worker.displayName}`}>
      <form onSubmit={onSubmit}>
        <div className="worker-hire-panel-head">
          <div>
            <p>Request</p>
            <h2>{worker.displayName}</h2>
            <span>{skill.name}</span>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <input type="hidden" name="title" value={skill.name} />
        <input type="hidden" name="category" value={skill.chargeCategory ?? skill.name} />
        <div className="worker-hire-grid">
          {pricingType === "unit" ? (
            <>
              <label>
                <span>{quantityLabel(skill)}</span>
                <div className="worker-quantity-control">
                  <button type="button" onClick={() => onQuantityChange(Math.max(1, quantity - 1))}>-</button>
                  <input value={quantity} onChange={event => onQuantityChange(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} type="number" min={1} aria-label={`Number of ${plural}`} />
                  <button type="button" onClick={() => onQuantityChange(quantity + 1)}>+</button>
                </div>
              </label>
              <label>
                <span>Unit</span>
                <input value={unit} readOnly />
              </label>
            </>
          ) : null}
          <label>
            <span>Start date</span>
            <input name="startDate" required type="date" />
          </label>
          <label>
            <span>Duration</span>
            <input name="duration" required defaultValue={skill.chargeTimeline ? `${skill.chargeTimeline} ${skill.chargeTimelineUnit}` : ""} placeholder="Example: 2 days" />
          </label>
        </div>
        <div className="worker-hire-location">
          <MapPicker value={location} onChange={onLocationChange} showMap={false} />
          <input type="hidden" name="description" value={location.locationDescription ?? ""} />
          {location.addressText && <p><MapPin size={15} /> {jobLocationLabel({ location: location.addressText, county: location.county, locationDetails: location })}</p>}
        </div>
        <div className="worker-hire-total">
          <span>Total</span>
          <strong>{kes(pricing.total)}</strong>
          <Button type="submit" disabled={sending}>{sending ? "Hiring..." : "Hire"}</Button>
        </div>
      </form>
    </section>
  );
}

function workerSkillProfiles(worker: UserProfile): WorkerSkillProfile[] {
  if (worker.skillProfiles?.length) return worker.skillProfiles;
  return (worker.skills ?? []).map((name, index) => ({
    id: `legacy-${worker.id}-${index}-${name}`,
    name,
    category: "services_trades",
    level: "independent",
    proofType: "reference",
    completedJobs: worker.completedJobs ?? 0,
    ratingAverage: worker.ratingAverage ?? 0,
    ratingCount: worker.ratingCount ?? 0
  }));
}

function bestRehireMatch(worker: UserProfile, skills: WorkerSkillProfile[], applications: Application[]): WorkerSearchMatch | null {
  const skill = skills[0];
  if (!skill) return null;
  const count = applications.filter(item => sameWorker(item.workerId, worker.id) || sameWorker(item.workerId, worker.uid)).length;
  return { worker, skill, relevance: 80 + count * 12, score: 80 + count * 12 + Number(worker.ratingAverage ?? 0) * 3, distanceKm: null };
}

function previouslyHiredWorkerIds(applications: Application[]) {
  const statuses = new Set(["accepted", "completion_requested", "payment_sent", "completed"]);
  return new Set(applications.filter(item => statuses.has(item.status)).map(item => item.workerId).filter(Boolean));
}

function rehireLastHiredAt(applications: Application[], workerId: string) {
  return Math.max(0, ...applications.filter(item => sameWorker(item.workerId, workerId)).map(item => timestampMillis(item.updatedAt ?? item.createdAt)));
}

function timestampMillis(value: unknown) {
  if (typeof value === "string") return Date.parse(value) || 0;
  if (!value || typeof value !== "object") return 0;
  if ("toMillis" in value && typeof (value as { toMillis: () => number }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if ("seconds" in value && typeof (value as { seconds: number }).seconds === "number") return (value as { seconds: number }).seconds * 1000;
  return 0;
}

function sameWorker(first?: string | null, second?: string | null) {
  return !!first && !!second && first === second;
}

function emptyHireLocation(): LocationFields {
  return { ...defaultKenyaLocation, addressText: "", displayLocation: "", latitude: Number.NaN, longitude: Number.NaN };
}

function isOfflineError(error: Error) {
  return error.message === "offline" || error.message.toLowerCase().includes("network");
}

function connectionPausedMessage() {
  return "Connection is paused. Your saved work is safe. We'll restore updates shortly.";
}
