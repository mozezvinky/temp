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
import type { Application, Conversation, LocationFields, Message, Role, UserProfile, WorkerSkillProfile } from "@/types";
import { calculateDirectHirePricing, pluralUnit, quantityLabel, resolveSkillPricingType, resolveSkillUnit } from "@/utils/direct-hire-pricing";
import { clientCanPost, workerCanApplyToJob } from "@/utils/jobRules";
import { jobLocationLabel } from "@/utils/location-display";
import { kes } from "@/utils/money";
import { buildWorkerSearchSuggestions, clientRateParts, normalizeSearchTerm, scoreWorkerMatch, type WorkerSearchMatch, type WorkerSearchSuggestion } from "@/utils/worker-search";
import { normalizeVerificationStatus } from "@/utils/verification";
import { isApprovedSkill } from "@/utils/worker-skills";
import dynamic from "next/dynamic";
import { ArrowLeft, BriefcaseBusiness, Check, ChevronDown, MapPin, MessageCircle, Search, Send, SlidersHorizontal, Star } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const MapPicker = dynamic(() => import("@/components/location/MapPicker"), { ssr: false });
const headline = "Who are you looking to hire?";
const sortOptions = [
  { value: "recommended", label: "Recommended" },
  { value: "nearest", label: "Nearest" },
  { value: "rating", label: "Highest rated" },
  { value: "completed", label: "Most jobs completed" },
  { value: "priceLow", label: "Lowest price" },
  { value: "priceHigh", label: "Highest price" }
] as const;
type SortMode = typeof sortOptions[number]["value"];
type HireFieldErrorKey = "startDate" | "quantity" | "location" | "locationDescription";
type HireFieldErrors = Partial<Record<HireFieldErrorKey, string>>;

export default function WorkersPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute(["client", "admin"]);
  const activeRole = activeRoleForProfile(profile);
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
  const [hireQuantityInput, setHireQuantityInput] = useState("1");
  const [hireErrors, setHireErrors] = useState<HireFieldErrors>({});
  const [sendingHire, setSendingHire] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [sortOpen, setSortOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);
  const [resultsScrollY, setResultsScrollY] = useState(0);
  const [typedHeadline, setTypedHeadline] = useState(headline);
  const [messageWorker, setMessageWorker] = useState<UserProfile | null>(null);
  const [messageConversation, setMessageConversation] = useState<Conversation | null>(null);
  const [messageHistory, setMessageHistory] = useState<Message[]>([]);
  const [messageLoading, setMessageLoading] = useState(false);
  const searchWrapRef = useRef<HTMLFormElement | null>(null);
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
    if (!profile?.id || activeRole !== "client") return;
    return subscribeApplications(profile.id, "client", setApplications, () => setApplications([]));
  }, [activeRole, profile?.id]);

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

  useEffect(() => {
    if (!suggestionsOpen && !sortOpen) return;
    const closeFloatingControls = (event: PointerEvent) => {
      if (!searchWrapRef.current?.contains(event.target as Node)) {
        setSuggestionsOpen(false);
        setSortOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeFloatingControls);
    return () => document.removeEventListener("pointerdown", closeFloatingControls);
  }, [sortOpen, suggestionsOpen]);

  const searchableWorkers = useMemo(() => {
    const currentUserIds = new Set([profile?.id, profile?.uid].filter(Boolean));
    return availableWorkers.filter(worker => !currentUserIds.has(worker.id) && !currentUserIds.has(worker.uid));
  }, [availableWorkers, profile?.id, profile?.uid]);

  const suggestions = useMemo(() => {
    return buildWorkerSearchSuggestions(searchableWorkers, approvedWorkerSkillProfiles, search, clientLocation);
  }, [clientLocation, search, searchableWorkers]);

  const results = useMemo(() => {
    const query = showRehire ? "" : submittedSearch;
    const rehireIds = showRehire ? previouslyHiredWorkerIds(applications) : null;
    const matches = searchableWorkers.flatMap(worker => {
      if (rehireIds && !rehireIds.has(worker.id) && !rehireIds.has(worker.uid)) return [];
      const skills = approvedWorkerSkillProfiles(worker);
      if (!skills.length) return [];
      const match = showRehire
        ? bestRehireMatch(worker, skills, applications)
        : scoreWorkerMatch(worker, skills, query, clientLocation);
      return match ? [match] : [];
    });
    return matches.sort((first, second) => {
      const recentDiff = (showRehire ? rehireLastHiredAt(applications, second.worker.id) - rehireLastHiredAt(applications, first.worker.id) : 0);
      if (recentDiff) return recentDiff;
      if (sortMode === "nearest") return sortNumber(first.distanceKm, second.distanceKm, "asc") || second.score - first.score;
      if (sortMode === "rating") return ratingFor(second) - ratingFor(first) || second.score - first.score;
      if (sortMode === "completed") return completedJobsFor(second) - completedJobsFor(first) || second.score - first.score;
      if (sortMode === "priceLow") return priceFor(first) - priceFor(second) || second.score - first.score;
      if (sortMode === "priceHigh") return priceFor(second) - priceFor(first) || second.score - first.score;
      return second.score - first.score;
    });
  }, [applications, clientLocation, searchableWorkers, showRehire, sortMode, submittedSearch]);

  const searched = showRehire || !!submittedSearch;
  const hireView = !!hireWorker && !!hireSkill;
  const hireQuantity = normalizeHireQuantity(hireQuantityInput) ?? 1;
  const sortLabel = sortOptions.find(option => option.value === sortMode)?.label ?? "Recommended";
  const requestedSkillKeys = useMemo(() => {
    return new Set(applications
      .filter(application => application.source === "direct_hire" && isActiveHireRequestStatus(application.status))
      .map(application => `${application.workerId}:${application.requestSkillId ?? ""}`));
  }, [applications]);

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
    setSuggestionsOpen(false);
    setHireSkill(null);
    setHireWorker(null);
    setHireErrors({});
  }

  function showRehireResults() {
    setShowRehire(true);
    setSubmittedSearch("");
    setSuggestionsOpen(false);
    setHireSkill(null);
    setHireWorker(null);
    setHireErrors({});
  }

  function chooseSuggestion(suggestion: WorkerSearchSuggestion) {
    setSearch(suggestion.value);
    setSubmittedSearch(suggestion.value);
    setShowRehire(false);
    setSuggestionsOpen(false);
    setHireSkill(null);
    setHireWorker(null);
    setHireErrors({});
  }

  function clearHireErrors(...fields: HireFieldErrorKey[]) {
    setHireErrors(current => {
      if (!fields.some(field => current[field])) return current;
      const next = { ...current };
      fields.forEach(field => delete next[field]);
      return next;
    });
  }

  function updateHireLocation(location: LocationFields) {
    setHireLocation(location);
    clearHireErrors("location", "locationDescription");
  }

  function updateHireQuantity(value: string) {
    const digits = value.replace(/[^\d]/g, "");
    const quantity = normalizeHireQuantity(digits) ?? 1;
    setHireQuantityInput(String(quantity));
    clearHireErrors("quantity");
  }

  function handleSearchKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
      return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggestionsOpen(true);
      setHighlightedSuggestion(index => Math.min(suggestions.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestionsOpen(true);
      setHighlightedSuggestion(index => Math.max(0, index - 1));
    }
    if (event.key === "Enter" && suggestionsOpen) {
      event.preventDefault();
      chooseSuggestion(suggestions[highlightedSuggestion] ?? suggestions[0]);
    }
  }

  function requestSkill(worker: UserProfile, skill: WorkerSkillProfile) {
    if (activeRole !== "client") {
      toast.error("Hiring is only available in client mode");
      return;
    }
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
    setResultsScrollY(window.scrollY);
    setHireWorker(worker);
    setHireSkill(skill);
    setHireLocation(emptyHireLocation());
    setHireQuantityInput("1");
    setHireErrors({});
  }

  function backToWorkers() {
    setHireWorker(null);
    setHireSkill(null);
    window.setTimeout(() => window.scrollTo({ top: resultsScrollY, behavior: "auto" }), 0);
  }

  async function submitHireRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hireWorker || !hireSkill) return;
    if (activeRole !== "client") {
      toast.error("Hiring is only available in client mode");
      return;
    }
    if (checkingVerification) {
      toast.message("Checking your verification status. Try again in a moment.");
      return;
    }
    if (!clientCanPost({ verificationStatus: liveVerificationStatus })) {
      toast.error("Verify your identity before posting jobs.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get("startDate") ?? "").trim();
    const quantity = normalizeHireQuantity(hireQuantityInput);
    const fieldErrors = validateHireFields({
      startDate,
      quantityInput: hireQuantityInput,
      quantity,
      location: hireLocation
    });
    setHireErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) {
      toast.error("Please fix the highlighted fields.");
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
      setHireErrors({ locationDescription: "Please add location details because no nearby landmark was found" });
      return;
    }
    setSendingHire(true);
    try {
      await sendDirectHireRequest({
        workerId: hireWorker.id,
        skillId: hireSkill.id,
        title: String(form.get("title") ?? hireSkill.name),
        category: String(form.get("category") ?? hireSkill.chargeCategory ?? hireSkill.name),
        quantity: quantity ?? 1,
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

  if (hireView) {
    return (
      <div className="workers-search-page workers-hire-view">
        <button type="button" className="workers-back-button" onClick={backToWorkers} aria-label="Back to workers">
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <HirePanel
          worker={hireWorker}
          skill={hireSkill}
          quantity={hireQuantity}
          quantityInput={hireQuantityInput}
          location={hireLocation}
          errors={hireErrors}
          sending={sendingHire}
          onQuantityChange={updateHireQuantity}
          onLocationChange={updateHireLocation}
          onFieldFixed={clearHireErrors}
          onClose={backToWorkers}
          onSubmit={submitHireRequest}
        />
      </div>
    );
  }

  return (
    <div className="workers-search-page">
      <section className={`workers-search-hero ${searched ? "is-compact" : ""}`}>
        {!searched && <h1 aria-label={headline}><span aria-hidden="true">{typedHeadline}</span><span className="workers-type-caret" aria-hidden="true" /></h1>}
        <form ref={searchWrapRef} className={`workers-search-box ${searched ? "is-results-mode" : ""}`} onSubmit={runSearch}>
          <div className="workers-search-row">
            <div className="workers-search-combobox">
              <label className="workers-search-input">
                <Search size={21} />
                <input
                  className="workers-search-field"
                  value={search}
                  onChange={event => { setSearch(event.target.value); setSuggestionsOpen(!!event.target.value.trim()); setHighlightedSuggestion(0); }}
                  onFocus={() => setSuggestionsOpen(!!search.trim())}
                  onKeyDown={handleSearchKeys}
                  placeholder="mama fua, cleaner, kibarua, gardener..."
                  role="combobox"
                  aria-expanded={suggestionsOpen && suggestions.length > 0}
                  aria-controls="workers-search-suggestions"
                  aria-autocomplete="list"
                  aria-activedescendant={suggestionsOpen && suggestions[highlightedSuggestion] ? `workers-suggestion-${highlightedSuggestion}` : undefined}
                />
              </label>
              {suggestionsOpen && suggestions.length > 0 && (
                <div id="workers-search-suggestions" className="workers-autocomplete" role="listbox">
                  {suggestions.map((suggestion, index) => (
                    <button
                      id={`workers-suggestion-${index}`}
                      key={suggestion.value}
                      type="button"
                      role="option"
                      aria-selected={index === highlightedSuggestion}
                      className={index === highlightedSuggestion ? "is-active" : ""}
                      onMouseEnter={() => setHighlightedSuggestion(index)}
                      onClick={() => chooseSuggestion(suggestion)}
                    >
                      <SuggestionText value={suggestion.value} query={search} />
                      {suggestion.matches > 0 && <span>{suggestion.matches} available</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {searched && (
              <div className="workers-sort-wrap">
                <button type="button" className="workers-sort-button" onClick={() => setSortOpen(open => !open)} aria-haspopup="menu" aria-expanded={sortOpen} aria-label="Sort workers">
                  <SlidersHorizontal size={18} />
                  <span>Sort by</span>
                  <strong>{sortLabel}</strong>
                  <ChevronDown size={16} />
                </button>
                {sortOpen && (
                  <div className="workers-sort-menu" role="menu">
                    {sortOptions.map(option => (
                      <button key={option.value} type="button" role="menuitemradio" aria-checked={sortMode === option.value} className={sortMode === option.value ? "is-active" : ""} onClick={() => { setSortMode(option.value); setSortOpen(false); }}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {!searched && (
            <div className="workers-search-actions">
              <Button type="button" variant="secondary" onClick={showRehireResults}>Rehire</Button>
              <Button type="submit" className="workers-search-submit">Search</Button>
            </div>
          )}
        </form>
      </section>

      {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-700 dark:text-red-200">{error}</p>}

      {searched ? (
        <section className="workers-results-shell">
          {results.length ? (
            <div className="workers-result-grid">
              {results.map(match => {
                const requested = requestedSkillKeys.has(`${match.worker.id}:${match.skill.id}`) || requestedSkillKeys.has(`${match.worker.uid}:${match.skill.id}`);
                return <WorkerResultCard key={`${match.worker.id}-${match.skill.id}`} match={match} active={hireWorker?.id === match.worker.id && hireSkill?.id === match.skill.id} requested={requested} onHire={() => requestSkill(match.worker, match.skill)} onMessage={() => setMessageWorker(match.worker)} />;
              })}
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

function WorkerResultCard({ match, active, requested, onHire, onMessage }: { match: WorkerSearchMatch; active: boolean; requested: boolean; onHire: () => void; onMessage: () => void }) {
  const { worker, skill } = match;
  const completed = completedJobsFor(match);
  const rating = ratingFor(match);
  const rate = clientRateParts(skill, kes);
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
        <strong><span>{rate.amount}</span>{rate.suffix && <em>{rate.suffix}</em>}</strong>
        <Button type="button" onClick={onHire} className="worker-hire-button" disabled={requested}>{requested ? "Requested" : "Hire"}</Button>
      </div>
    </article>
  );
}

function HirePanel({ worker, skill, quantity, quantityInput, location, errors, sending, onQuantityChange, onLocationChange, onFieldFixed, onClose, onSubmit }: {
  worker: UserProfile;
  skill: WorkerSkillProfile;
  quantity: number;
  quantityInput: string;
  location: LocationFields;
  errors: HireFieldErrors;
  sending: boolean;
  onQuantityChange: (value: string) => void;
  onLocationChange: (location: LocationFields) => void;
  onFieldFixed: (...fields: HireFieldErrorKey[]) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const pricing = calculateDirectHirePricing(skill, quantity);
  const pricingType = resolveSkillPricingType(skill);
  const storedUnit = displayUnit(resolveSkillUnit(skill));
  const plural = pluralUnit(storedUnit);
  const rate = clientRateParts(skill, kes);
  const quantityButtonBase = normalizeHireQuantity(quantityInput) ?? quantity;
  return (
    <section className="worker-hire-panel" aria-label={`Hire ${worker.displayName}`}>
      <form onSubmit={onSubmit} noValidate>
        <div className="worker-hire-panel-head">
          <div>
            <p>Request</p>
            <h2>{worker.displayName}</h2>
            <span>{skill.name}</span>
          </div>
          <button type="button" onClick={onClose}>Back</button>
        </div>
        <div className="worker-hire-summary">
          <div className="worker-result-avatar" aria-hidden="true">
            {worker.photoURL ? <img src={worker.photoURL} alt="" style={{ objectPosition: `${worker.photoPositionX ?? 50}% ${worker.photoPositionY ?? 50}%`, transform: `scale(${worker.photoZoom ?? 1})`, transformOrigin: `${worker.photoPositionX ?? 50}% ${worker.photoPositionY ?? 50}%` }} /> : worker.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p>{worker.displayName}</p>
            <span>{skill.name}</span>
          </div>
          <strong><span>{rate.amount}</span>{rate.suffix && <em>{rate.suffix}</em>}</strong>
        </div>
        <input type="hidden" name="title" value={skill.name} />
        <input type="hidden" name="category" value={skill.chargeCategory ?? skill.name} />
        <input type="hidden" name="duration" value={directHireDuration(skill, quantity)} />
        <div className="worker-hire-grid">
          <label className="worker-start-date-field">
            <span>Start date</span>
            <input
              className={errors.startDate ? "is-invalid" : undefined}
              name="startDate"
              type="date"
              aria-invalid={!!errors.startDate}
              aria-describedby={errors.startDate ? "hire-start-date-error" : undefined}
              onChange={() => onFieldFixed("startDate")}
            />
            <FieldError id="hire-start-date-error" message={errors.startDate} />
          </label>
          <label className="worker-quantity-field">
            <span>{pricingType === "unit" ? quantityLabel(skill) : "Quantity"}</span>
            <div className={`worker-quantity-control ${errors.quantity ? "is-invalid" : ""}`}>
              <button type="button" onClick={() => onQuantityChange(String(Math.max(1, quantityButtonBase - 1)))}>-</button>
              <input
                name="quantity"
                value={quantityInput}
                onChange={event => onQuantityChange(event.target.value)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={`Number of ${plural}`}
                aria-invalid={!!errors.quantity}
                aria-describedby={errors.quantity ? "hire-quantity-error" : undefined}
              />
              <button type="button" onClick={() => onQuantityChange(String(quantityButtonBase + 1))}>+</button>
            </div>
            <FieldError id="hire-quantity-error" message={errors.quantity} />
          </label>
        </div>
        <div className={`worker-hire-location ${errors.location ? "is-location-invalid" : ""} ${errors.locationDescription ? "is-description-invalid" : ""}`}>
          <MapPicker value={location} onChange={onLocationChange} showMap={false} resetOnCustom />
          <FieldError id="hire-location-error" message={errors.location} />
          <FieldError id="hire-location-description-error" message={errors.locationDescription} />
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

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <span id={id} className="worker-hire-error">{message}</span>;
}

function SuggestionText({ value, query }: { value: string; query: string }) {
  const normalizedQuery = normalizeSearchTerm(query);
  const index = value.indexOf(normalizedQuery);
  if (!normalizedQuery || index < 0) return <span>{value}</span>;
  return <span>{value.slice(0, index)}<mark>{value.slice(index, index + normalizedQuery.length)}</mark>{value.slice(index + normalizedQuery.length)}</span>;
}

function approvedWorkerSkillProfiles(worker: UserProfile): WorkerSkillProfile[] {
  return workerSkillProfiles(worker).filter(skill => isApprovedSkill(skill) && Number(skill.chargeAmount ?? 0) > 0);
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

function displayUnit(unit: string) {
  return unit.trim().toLowerCase() || "unit";
}

function normalizeHireQuantity(value: string) {
  if (!value.trim()) return null;
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 1) return null;
  return Math.trunc(quantity);
}

function validateHireFields({ startDate, quantityInput, quantity, location }: {
  startDate: string;
  quantityInput: string;
  quantity: number | null;
  location: LocationFields;
}) {
  const errors: HireFieldErrors = {};
  if (!startDate) errors.startDate = "Please select a start date";
  if (!quantityInput.trim() || quantity == null) errors.quantity = "Please enter a valid quantity";
  if (!location.addressText || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    errors.location = "Please select a location";
  }
  if (locationRequiresExtraDescription(location)) {
    errors.locationDescription = "Please add location details because no nearby landmark was found";
  }
  return errors;
}

function isActiveHireRequestStatus(status: string) {
  return status === "pending" || status === "accepted" || status === "completion_requested" || status === "payment_sent";
}

function locationRequiresExtraDescription(location: LocationFields) {
  return location.locationSource === "current" && location.landmarkResolved === false && !location.locationDescription?.trim();
}

function directHireDuration(skill: WorkerSkillProfile, quantity: number) {
  if (skill.chargeTimeline && skill.chargeTimelineUnit) return `${skill.chargeTimeline} ${skill.chargeTimelineUnit}`;
  const unit = resolveSkillUnit(skill);
  return `${Math.max(1, Math.trunc(Number(quantity) || 1))} ${unit || "unit"}`;
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

function ratingFor(match: WorkerSearchMatch) {
  return Number(match.skill.ratingAverage || match.worker.ratingAverage || 0);
}

function completedJobsFor(match: WorkerSearchMatch) {
  return Math.max(Number(match.worker.completedJobs || 0), Number(match.skill.completedJobs || 0), Number(match.worker.ratingCount || 0), Number(match.skill.ratingCount || 0));
}

function priceFor(match: WorkerSearchMatch) {
  return calculateDirectHirePricing(match.skill, 1).clientRatePerUnit ?? calculateDirectHirePricing(match.skill, 1).total;
}

function sortNumber(first: number | null, second: number | null, direction: "asc" | "desc") {
  if (first == null && second == null) return 0;
  if (first == null) return 1;
  if (second == null) return -1;
  return direction === "asc" ? first - second : second - first;
}

function emptyHireLocation(): LocationFields {
  return { ...defaultKenyaLocation, addressText: "", displayLocation: "", latitude: Number.NaN, longitude: Number.NaN };
}

function activeRoleForProfile(profile: UserProfile | null): Role | null {
  if (profile?.role === "client" || profile?.role === "worker" || profile?.role === "admin") return profile.role;
  if (typeof window !== "undefined" && profile) {
    const userId = profile.uid ?? profile.id;
    const pendingRole = window.localStorage.getItem(`temp.profile.pendingRole.${userId}`);
    if (pendingRole === "client" || pendingRole === "worker" || pendingRole === "admin") return pendingRole;
    const sessionUserId = window.sessionStorage.getItem("temp.profile.uid");
    const sessionRole = sessionUserId === userId ? window.sessionStorage.getItem("temp.profile.role") : null;
    if (sessionRole === "client" || sessionRole === "worker" || sessionRole === "admin") return sessionRole;
    const localRole = window.localStorage.getItem(`temp.profile.role.${userId}`);
    if (localRole === "client" || localRole === "worker" || localRole === "admin") return localRole;
  }
  return profile?.role ?? null;
}

function isOfflineError(error: Error) {
  return error.message === "offline" || error.message.toLowerCase().includes("network");
}

function connectionPausedMessage() {
  return "Connection is paused. Your saved work is safe. We'll restore updates shortly.";
}
