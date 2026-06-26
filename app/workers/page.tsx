"use client";

import { Button } from "@/components/ui/Button";
import { AppModal } from "@/components/ui/AppModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { sendMessage, subscribeMessages, subscribeUserConversations } from "@/services/chat";
import { sendDirectHireRequest } from "@/services/jobs";
import { subscribeWorkers } from "@/services/users";
import type { Conversation, Message, UserProfile, WorkerSkillProfile } from "@/types";
import { addPlatformFee, kes } from "@/utils/money";
import { displayJobQuantity } from "@/utils/jobUnits";
import { ChevronDown, MapPin, MessageCircle, Search, Send } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function WorkersPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute(["client", "admin"]);
  const [search, setSearch] = useState("");
  const [availableWorkers, setAvailableWorkers] = useState<UserProfile[]>([]);
  const [error, setError] = useState("");
  const [sortModes, setSortModes] = useState({ price: false, rating: true, completed: false });
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<UserProfile | null>(null);
  const [hireSkill, setHireSkill] = useState<WorkerSkillProfile | null>(null);
  const [sendingHire, setSendingHire] = useState(false);
  const [messageWorker, setMessageWorker] = useState<UserProfile | null>(null);
  const [messageConversation, setMessageConversation] = useState<Conversation | null>(null);
  const [messageHistory, setMessageHistory] = useState<Message[]>([]);
  const [messageLoading, setMessageLoading] = useState(false);
  const sortOptions = [
    { value: "price", label: "Price" },
    { value: "rating", label: "Ratings" },
    { value: "completed", label: "Completed jobs" }
  ] as const;
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
  const workers = useMemo(() => {
    const normalized = normalizeSearch(search);
    const currentUserIds = new Set([profile?.id, profile?.uid].filter(Boolean));
    const completedJobsForSort = (worker: UserProfile) => {
      const profiles = worker.skillProfiles?.length
        ? worker.skillProfiles
        : (worker.skills ?? []).map(name => ({
            completedJobs: worker.completedJobs ?? 0,
            ratingCount: worker.ratingCount ?? 0,
            name
          }));
      const skillCompletedTotal = profiles.reduce((sum, skill) => sum + Number(skill.completedJobs || 0), 0);
      const largestSkillRatingCount = profiles.reduce((max, skill) => Math.max(max, Number(skill.ratingCount || 0)), 0);
      return Math.max(Number(worker.completedJobs || 0), Number(worker.ratingCount || 0), skillCompletedTotal, largestSkillRatingCount);
    };
    const priceForSort = (worker: UserProfile) => {
      const profiles = worker.skillProfiles?.length ? worker.skillProfiles : [];
      const matchingProfiles = normalized
        ? profiles.filter(skill => searchableText(skill.name, skill.chargeCategory, skill.category).includes(normalized))
        : profiles;
      const skillRate = matchingProfiles.find(item => item.chargeAmount)?.chargeAmount ?? profiles.find(item => item.chargeAmount)?.chargeAmount;
      return Number(skillRate ? addPlatformFee(skillRate) : worker.hourlyRate ? addPlatformFee(worker.hourlyRate) : Number.MAX_SAFE_INTEGER);
    };
    const activeSorts = (Object.keys(sortModes) as Array<keyof typeof sortModes>).filter(key => sortModes[key]);
    return availableWorkers.filter(worker => {
      if (currentUserIds.has(worker.id) || currentUserIds.has(worker.uid)) return false;
      const profiles = workerSkillProfiles(worker);
      if (!profiles.length) return false;
      const skillNames = profiles.map(skill => skill.name);
      const matchesSearch = !normalized || searchableText(worker.displayName, worker.bio, ...skillNames, ...profiles.map(skill => skill.chargeCategory ?? "")).includes(normalized);
      return matchesSearch;
    }).sort((first, second) => {
      for (const mode of activeSorts) {
        const diff = mode === "completed"
          ? completedJobsForSort(second) - completedJobsForSort(first)
          : mode === "price"
            ? priceForSort(first) - priceForSort(second)
            : Number(second.ratingAverage ?? 0) - Number(first.ratingAverage ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
  }, [availableWorkers, profile?.id, profile?.uid, search, sortModes]);
  const specificSkillFilterActive = !!search.trim();
  const selectedSortLabels = sortOptions
    .filter(option => sortModes[option.value])
    .map(option => option.label)
    .join(", ") || "Options";

  function requestSkill(worker: UserProfile, skill: WorkerSkillProfile) {
    if (profile?.role !== "client") return;
    if (worker.isOccupied) {
      toast.error(`${worker.displayName} is occupied on another job right now.`);
      return;
    }
    setSelectedWorker(worker);
    setHireSkill(skill);
  }

  async function submitHireRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorker || !hireSkill) return;
    const form = new FormData(event.currentTarget);
    setSendingHire(true);
    try {
      await sendDirectHireRequest({
        workerId: selectedWorker.id,
        title: String(form.get("title") ?? ""),
        category: String(form.get("category") ?? hireSkill.name),
        payAmount: Number(form.get("payAmount") ?? hireSkill.chargeAmount ?? 0),
        location: String(form.get("location") ?? ""),
        startDate: String(form.get("startDate") ?? ""),
        duration: String(form.get("duration") ?? ""),
        description: String(form.get("description") ?? "")
      });
      toast.success(`Hire request sent to ${selectedWorker.displayName}.`);
      setHireSkill(null);
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

  function skillMatches(skill: WorkerSkillProfile, value: string) {
    const normalized = normalizeSearch(value);
    if (!normalized || normalized === "all") return true;
    return searchableText(skill.name, skill.chargeCategory, skill.category).includes(normalized);
  }

  function displayedSkillProfiles(worker: UserProfile) {
    const profiles = workerSkillProfiles(worker);
    let filtered = profiles;
    const normalized = normalizeSearch(search);
    if (normalized) filtered = filtered.filter(skill => skillMatches(skill, normalized));
    return filtered;
  }

  function workerCompletedJobs(worker: UserProfile) {
    const profiles = workerSkillProfiles(worker);
    const skillCompletedTotal = profiles.reduce((sum, skill) => sum + Number(skill.completedJobs || 0), 0);
    const largestSkillRatingCount = profiles.reduce((max, skill) => Math.max(max, Number(skill.ratingCount || 0)), 0);
    return Math.max(Number(worker.completedJobs || 0), Number(worker.ratingCount || 0), skillCompletedTotal, largestSkillRatingCount);
  }

  function visibleSkillStats(worker: UserProfile) {
    const specificFilterActive = !!search.trim();
    const profile = specificFilterActive ? displayedSkillProfiles(worker)[0] : undefined;
    return {
      name: profile?.name,
      jobs: profile ? profile.completedJobs || profile.ratingCount || workerCompletedJobs(worker) : workerCompletedJobs(worker),
      rating: profile ? profile.ratingAverage || worker.ratingAverage || 0 : worker.ratingAverage ?? 0,
      count: profile ? profile.ratingCount || worker.ratingCount || 0 : worker.ratingCount ?? 0
    };
  }

  function profileCompletedJobs(worker: UserProfile, skill: WorkerSkillProfile) {
    return skill.completedJobs || skill.ratingCount || workerCompletedJobs(worker);
  }

  function profileRating(worker: UserProfile, skill: WorkerSkillProfile) {
    return skill.ratingAverage || worker.ratingAverage || 0;
  }

  function profileRatingCount(worker: UserProfile, skill: WorkerSkillProfile) {
    return skill.ratingCount || worker.ratingCount || 0;
  }

  function clientVisibleRate(amount?: number) {
    return amount ? kes(addPlatformFee(amount)) : "Rate not set";
  }

  function ratingText(value: number, count?: number) {
    return `${Number(value).toFixed(1)} star rating${typeof count === "number" ? ` (${count})` : ""}`;
  }

  function workerLocation(worker: UserProfile) {
    return worker.location?.town || worker.location?.county
      ? [worker.location?.town, worker.location?.county].filter(Boolean).join(", ")
      : "Location not set";
  }

  if (loading || !isAuthorized) return <LoadingSpinner label="Checking client access" />;

  return (
    <div className="marketplace-page space-y-5">
      <div className="marketplace-filterbar">
        <label className="marketplace-search">
          <Search size={17} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search worker, skill, or category" />
        </label>
        <div className="marketplace-sort-wrap">
        <button type="button" className="marketplace-sort" aria-haspopup="menu" aria-expanded={sortOpen} onClick={() => setSortOpen(open => !open)}>
          <span>Sort By</span>
          <strong>{selectedSortLabels}</strong>
          <ChevronDown size={16} className={sortOpen ? "rotate-180 transition" : "transition"} />
        </button>
        {sortOpen && (
          <div className="marketplace-sort-menu" role="menu">
            {sortOptions.map(option => (
              <label
                key={option.value}
                className={`marketplace-checkbox-option ${sortModes[option.value] ? "is-active" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={sortModes[option.value]}
                  onChange={() => setSortModes(current => ({ ...current, [option.value]: !current[option.value] }))}
                />
                {option.label}
              </label>
            ))}
          </div>
        )}
        </div>
      </div>
      {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
      <div className="marketplace-heading">
        <span>Workers</span>
        <span>Rating</span>
        <span>{specificSkillFilterActive ? "Skill / Rate" : "Profile"}</span>
        <span>Location</span>
        <span aria-hidden="true" />
      </div>
      <div className="marketplace-list">
        {workers.length ? workers.map(worker => {
          const skill = visibleSkillStats(worker);
          const shownSkills = displayedSkillProfiles(worker);
          return <article key={worker.id} className={`marketplace-row worker-directory-row ${workers[0]?.id === worker.id ? "is-promoted" : ""}`}>
            <div className="marketplace-person">
                <span
                  className="marketplace-worker-avatar grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#2A2A2B] font-black text-[#FFFBF4]"
                >
                  {worker.photoURL ? <img src={worker.photoURL} alt={worker.displayName} className="h-full w-full object-cover" style={{ objectPosition: `${worker.photoPositionX ?? 50}% ${worker.photoPositionY ?? 50}%`, transform: `scale(${worker.photoZoom ?? 1})`, transformOrigin: `${worker.photoPositionX ?? 50}% ${worker.photoPositionY ?? 50}%` }} /> : worker.displayName.charAt(0).toUpperCase()}
                </span>
                <div className="marketplace-person-body">
                  <div className="marketplace-worker-name-line">
                    <button type="button" className="marketplace-worker-name-button" onClick={() => setMessageWorker(worker)}>{worker.displayName}</button>
                    <div className="marketplace-worker-chips">
                      <span className={`worker-info-chip ${worker.verificationStatus === "approved" ? "is-neutral" : "is-warning"}`}>{worker.verificationStatus === "approved" ? "Verified" : "Unverified"}</span>
                      {worker.isOccupied && <span className="worker-info-chip is-neutral">Occupied</span>}
                      <span className="worker-info-chip is-neutral">Completed jobs {workerCompletedJobs(worker)}</span>
                    </div>
                  </div>
                </div>
            </div>
            <div className="worker-card-stats">
              <div className="worker-card-stat"><strong>{Number(skill.rating).toFixed(1)}</strong><span>{skill.count} review{skill.count === 1 ? "" : "s"}</span></div>
              <div className="worker-card-stat"><strong>{shownSkills.length}</strong><span>skill{shownSkills.length === 1 ? "" : "s"}</span></div>
              <div className="worker-card-stat worker-card-stat-location"><strong><MapPin size={14} /> {workerLocation(worker)}</strong><span>Location</span></div>
            </div>
            <div className="marketplace-trade">
              <Button onClick={() => setSelectedWorker(worker)}>View</Button>
            </div>
          </article>;
        }) : <EmptyState title="No workers found" body="Workers with matching skills and qualifications will appear here." />}
      </div>
      {selectedWorker && (
        <AppModal eyebrow="Worker profile" title={selectedWorker.displayName} onClose={() => { setSelectedWorker(null); setHireSkill(null); }}>
              <div className="worker-profile-modal-head">
                <span
                  className="marketplace-worker-avatar grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#2A2A2B] font-black text-[#FFFBF4]"
                >
                  {selectedWorker.photoURL ? <img src={selectedWorker.photoURL} alt={selectedWorker.displayName} className="h-full w-full object-cover" style={{ objectPosition: `${selectedWorker.photoPositionX ?? 50}% ${selectedWorker.photoPositionY ?? 50}%`, transform: `scale(${selectedWorker.photoZoom ?? 1})`, transformOrigin: `${selectedWorker.photoPositionX ?? 50}% ${selectedWorker.photoPositionY ?? 50}%` }} /> : selectedWorker.displayName.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm text-[#CCC6BB]">{selectedWorker.bio ?? "Worker profile"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`worker-info-chip ${selectedWorker.verificationStatus === "approved" ? "is-neutral" : "is-warning"}`}>{selectedWorker.verificationStatus === "approved" ? "Verified" : "Unverified"}</span>
                    <span className="worker-info-chip is-neutral">{selectedWorker.isOccupied ? "Occupied" : "Available"}</span>
                    <span className="worker-info-chip is-neutral">{workerLocation(selectedWorker)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="job-info-box rounded-md p-4"><p className="text-xs text-[#959087]">Rating</p><p className="mt-1 font-black text-[#FFFBFF]">{ratingText(selectedWorker.ratingAverage ?? 0, selectedWorker.ratingCount ?? 0)}</p></div>
                <div className="job-info-box rounded-md p-4"><p className="text-xs text-[#959087]">Completed jobs</p><p className="mt-1 font-black text-[#FFFBFF]">{workerCompletedJobs(selectedWorker)}</p></div>
                <div className="job-info-box rounded-md p-4"><p className="text-xs text-[#959087]">Status</p><p className="mt-1 font-black text-[#FFFBFF]">{selectedWorker.isOccupied ? "Occupied" : "Available"}</p></div>
              </div>
              <div className="mt-5 grid gap-3">
                {displayedSkillProfiles(selectedWorker).map(skillProfile => {
                  const quantity = displayJobQuantity(skillProfile.chargeQuantity, skillProfile.chargeUnit, skillProfile.chargeCustomUnit);
                  return (
                    <div key={`profile-${skillProfile.id}`} className="job-info-box worker-profile-skill-card rounded-md p-4">
                      <div className="worker-profile-skill-layout">
                        <div className="worker-profile-skill-main">
                          <p className="text-sm font-black text-[#FFFBFF]">{skillProfile.name}</p>
                          <p className="mt-1 text-xs font-bold text-[#959087]">{profileCompletedJobs(selectedWorker, skillProfile)} completed jobs - {ratingText(profileRating(selectedWorker, skillProfile), profileRatingCount(selectedWorker, skillProfile))}</p>
                        </div>
                        <div className="worker-profile-skill-actions">
                          <span className="design-chip worker-profile-skill-price px-2.5 py-1 text-xs font-black">{clientVisibleRate(skillProfile.chargeAmount)}</span>
                          {selectedWorker.isOccupied
                            ? <span className="worker-skill-occupied-chip">Occupied</span>
                            : <Button type="button" onClick={() => requestSkill(selectedWorker, skillProfile)} className="min-h-9 px-3 py-1.5 text-xs">Hire</Button>}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#CCC6BB]">
                        <span className="design-chip px-2 py-1">{skillProfile.chargePayType === "timeline" ? "Dynamic pay" : "Fixed pay"}</span>
                        {quantity && <span className="design-chip px-2 py-1">{quantity}</span>}
                        {skillProfile.chargeTimeline && <span className="design-chip px-2 py-1">{skillProfile.chargeTimeline} {skillProfile.chargeTimelineUnit}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hireSkill && (
                <form onSubmit={submitHireRequest} className="mt-6 grid gap-4 rounded-xl border border-bone/10 bg-bone/[.04] p-4">
                  <div>
                    <p className="text-lg font-black text-[#FFFBFF]">Send direct hire request</p>
                    <p className="mt-1 text-sm text-[#CCC6BB]">The worker will see this under Requests and can accept or reject it.</p>
                  </div>
                  <label className="temp-label">Job title<input name="title" required defaultValue={hireSkill.name} className="temp-input p-3 outline-none" /></label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="temp-label">Category<input name="category" required defaultValue={hireSkill.chargeCategory ?? hireSkill.name} className="temp-input p-3 outline-none" /></label>
                    <label className="temp-label">Pay amount<input name="payAmount" required type="number" min="1" defaultValue={hireSkill.chargeAmount ? addPlatformFee(hireSkill.chargeAmount) : ""} className="temp-input p-3 outline-none" /></label>
                    <label className="temp-label">Location<input name="location" required placeholder="Town, estate, or address" className="temp-input p-3 outline-none" /></label>
                    <label className="temp-label">Start date<input name="startDate" required type="date" className="temp-input p-3 outline-none" /></label>
                    <label className="temp-label sm:col-span-2">Duration<input name="duration" required defaultValue={hireSkill.chargeTimeline ? `${hireSkill.chargeTimeline} ${hireSkill.chargeTimelineUnit}` : ""} placeholder="Example: 2 days" className="temp-input p-3 outline-none" /></label>
                    <label className="temp-label sm:col-span-2">Optional job description<textarea name="description" rows={3} className="temp-input p-3 outline-none" placeholder="Explain the work, tools, and expectations." /></label>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={sendingHire}>{sendingHire ? "Sending..." : "Send request"}</Button>
                    <Button type="button" variant="secondary" onClick={() => setHireSkill(null)}>Cancel</Button>
                  </div>
                </form>
              )}
        </AppModal>
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

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function searchableText(...parts: Array<string | undefined | null>) {
  return normalizeSearch(parts.filter(Boolean).join(" "));
}

function isOfflineError(error: Error) {
  return error.message === "offline" || error.message.toLowerCase().includes("network");
}

function connectionPausedMessage() {
  return "Connection is paused. Your saved work is safe. We'll restore updates shortly.";
}
