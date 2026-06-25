"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { RatingHistory } from "@/components/ratings/RatingHistory";
import { IdentityVerificationModal } from "@/components/verification/IdentityVerificationModal";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { auth, requireAuth } from "@/lib/firebase";
import { loadRatings } from "@/services/ratings";
import type { Rating } from "@/types";
import { normalizeKenyanPhone } from "@/utils/phone";
import { BriefcaseBusiness, CalendarCheck, FileBadge, Mail, Move, Phone, Star, UserCircle, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, profile, loading, isAuthorized, refreshProfile } = useProtectedRoute();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoDraggingRef = useRef(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<{ photoURL: string; photoPositionX: number; photoPositionY: number; photoZoom: number } | null>(null);
  const [savedPhoto, setSavedPhoto] = useState<{ photoURL: string; photoPositionX: number; photoPositionY: number; photoZoom: number } | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [verificationOpen, setVerificationOpen] = useState(false);

  useEffect(() => {
    if (!profile && !user) return;
    setEmail(profile?.email ?? user?.email ?? "");
    setPhoneNumber(profile?.phoneNumber ?? user?.phoneNumber ?? "");
  }, [profile, user]);

  useEffect(() => {
    if (!profile?.id) return;
    void loadRatings(profile.id).then(result => setRatings(result.ratings)).catch(() => setRatings([]));
  }, [profile?.id]);

  async function prepareProfilePhoto(file: File) {
    if (!profile || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Profile picture must be under 4MB.");
      return;
    }
    setUploadingPhoto(true);
    try {
      const photoURL = await compressProfilePhoto(file);
      setPhotoDraft({ photoURL, photoPositionX: profile.photoPositionX ?? 50, photoPositionY: profile.photoPositionY ?? 50, photoZoom: profile.photoZoom ?? 1 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to prepare profile picture.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function saveProfilePhoto() {
    if (!photoDraft || !user) return;
    setUploadingPhoto(true);
    try {
      const activeUser = requireAuth().currentUser;
      if (!activeUser) throw new Error("Please sign in again.");
      const token = await activeUser.getIdToken(true);
      const requestInit = {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(photoDraft)
      };
      let response = await fetch("/api/profile/photo", requestInit);
      if (response.status === 404) response = await fetch("/api/profile", requestInit);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to update profile picture.");
      window.localStorage.setItem(`temp.profile.photo.${activeUser.uid}`, JSON.stringify(photoDraft));
      setSavedPhoto(photoDraft);
      setPhotoDraft(null);
      await refreshProfile();
      toast.success("Profile picture updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update profile picture.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function compressProfilePhoto(file: File) {
    const bitmap = await createImageBitmap(file);
    const size = 512;
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare this image.");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  function movePhotoDraft(event: PointerEvent<HTMLDivElement>) {
    if (!photoDraft) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const photoPositionX = Math.min(100, Math.max(0, 50 + (((event.clientX - rect.left) - (rect.width / 2)) / rect.width) * 100));
    const photoPositionY = Math.min(100, Math.max(0, 50 + (((event.clientY - rect.top) - (rect.height / 2)) / rect.height) * 100));
    setPhotoDraft(current => current ? { ...current, photoPositionX, photoPositionY } : current);
  }

  function zoomPhotoDraft(delta: number) {
    setPhotoDraft(current => {
      if (!current) return current;
      const photoZoom = Math.min(3, Math.max(1, Number((current.photoZoom + delta).toFixed(2))));
      return { ...current, photoZoom };
    });
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsMessage("");
    setSettingsError("");
    const trimmedEmail = email.trim().toLowerCase();
    const normalizedPhone = phoneNumber.trim() ? normalizeKenyanPhone(phoneNumber) : "";
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setSettingsError("Enter a valid email address.");
      return;
    }
    if (phoneNumber.trim() && !normalizedPhone) {
      setSettingsError("Enter a valid Kenyan phone number.");
      return;
    }
    const token = await auth?.currentUser?.getIdToken();
    if (!token) {
      setSettingsError("Sign in again to update account settings.");
      return;
    }
    setSavingSettings(true);
    try {
      const response = await fetch("/api/account-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: trimmedEmail, phoneNumber: normalizedPhone || "" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to update account settings.");
      await auth?.currentUser?.reload();
      await refreshProfile();
      setSettingsMessage("Account settings updated.");
    } catch (caught) {
      setSettingsError(caught instanceof Error ? caught.message : "Unable to update account settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  if (loading || !isAuthorized || !profile) return <LoadingSpinner label="Opening profile" />;
  const skills = profile.skills?.length ? profile.skills.join(", ") : "Add skills to improve matching.";
  const certificates = profile.certificates?.length ? profile.certificates.join(", ") : "Add certificates and portfolio items from your profile settings.";
  const displayPhoto = savedPhoto ?? (profile.photoURL ? { photoURL: profile.photoURL, photoPositionX: profile.photoPositionX ?? 50, photoPositionY: profile.photoPositionY ?? 50, photoZoom: profile.photoZoom ?? 1 } : null);
  const workerRating = ratingSummary(ratings.filter(rating => rating.fromUserRole === "client"));
  const clientRating = ratingSummary(ratings.filter(rating => rating.fromUserRole === "worker"));

  return (
    <div className="profile-settings-page mx-auto grid max-w-6xl gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-3">
        <h1 className="text-3xl font-black text-[#FFFBFF]">Settings</h1>
        <Link href="/profile" className="block rounded-full bg-bone px-4 py-3 text-sm font-black text-[#1E1B13]">Profile</Link>
      </aside>
      <main className="space-y-5">
        <Card className="p-7 md:p-9">
          <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Profile</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-4">
            <div>
              <h2 className="text-xl font-black text-[#FFFBFF]">Identity verification</h2>
              <p className="mt-1 text-sm text-[#CCC6BB]">Build trust with clients and workers by verifying your government ID.</p>
            </div>
            {profile.verificationStatus === "approved" ? (
              <VerificationBadge status={profile.verificationStatus} />
            ) : profile.verificationStatus === "pending" ? (
              <VerificationBadge status={profile.verificationStatus} />
            ) : (
              <Button type="button" className="temp-success-button" onClick={() => setVerificationOpen(true)}>Verify Identity</Button>
            )}
          </div>
          <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="grid h-28 w-28 place-items-center overflow-hidden rounded-full border border-white/30 bg-[#2A2A2B] text-4xl font-black text-[#FFFBF4] shadow-[0_18px_45px_rgba(0,0,0,.22)]">
              {displayPhoto ? <ProfilePhotoImage photo={displayPhoto} alt="Profile" /> : <UserCircle size={54} />}
            </span>
            <div className="grid gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void prepareProfilePhoto(file);
                }}
              />
              <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
                {uploadingPhoto ? "Uploading..." : "Change picture"}
              </Button>
              <p className="text-sm font-semibold text-[#959087]">Add a profile picture so clients and workers can recognize you.</p>
            </div>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <label className="temp-label">First name<input readOnly value={(user?.displayName ?? profile.displayName).split(" ")[0] ?? ""} className="temp-input p-3 outline-none" /></label>
            <label className="temp-label">Last name<input readOnly value={(user?.displayName ?? profile.displayName).split(" ").slice(1).join(" ")} className="temp-input p-3 outline-none" /></label>
            <label className="temp-label md:col-span-2">Profession<input readOnly value={profile.role === "worker" ? skills : "Client / hiring account"} className="temp-input p-3 outline-none" /></label>
            <label className="temp-label md:col-span-2">Bio<textarea readOnly value={profile.bio ?? (profile.role === "worker" ? "Build your profile to receive better job matches." : "Manage company details, posted work, applicants, and payment history.")} className="temp-input min-h-32 p-3 outline-none" /></label>
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-4">
            <div className="profile-rating-summary rounded-xl bg-[#2A2A2B] p-4"><p className="text-xs text-[#959087]">Worker rating</p><p className="mt-1 inline-flex items-center gap-1 font-black"><Star size={16} /> {workerRating.average.toFixed(1)}</p><p className="mt-1 text-xs text-[#959087]">{workerRating.count} review{workerRating.count === 1 ? "" : "s"}</p></div>
            <div className="profile-rating-summary rounded-xl bg-[#2A2A2B] p-4"><p className="text-xs text-[#959087]">Client rating</p><p className="mt-1 inline-flex items-center gap-1 font-black"><Star size={16} /> {clientRating.average.toFixed(1)}</p><p className="mt-1 text-xs text-[#959087]">{clientRating.count} review{clientRating.count === 1 ? "" : "s"}</p></div>
            <div className="rounded-xl bg-[#2A2A2B] p-4"><p className="text-xs text-[#959087]">Reviews</p><p className="mt-1 font-black">{profile.ratingCount ?? 0}</p></div>
            <div className="rounded-xl bg-[#2A2A2B] p-4"><p className="text-xs text-[#959087]">Skills</p><p className="mt-1 font-black">{Math.max(profile.skillProfiles?.length ?? 0, profile.skills?.length ?? 0)}</p></div>
          </div>
        </Card>
        <Card className="p-7 md:p-9">
          <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Account</p>
          <h2 className="mt-3 text-2xl font-black text-[#FFFBF4]">Contact and sign-in details</h2>
          <form onSubmit={submitSettings} className="mt-6 grid gap-5">
            <label className="temp-label">
              Email
              <div className="temp-input flex items-center gap-3 px-4 py-3">
                <Mail size={16} className="shrink-0" />
                <input value={email} onChange={event => setEmail(event.target.value)} className="min-w-0 flex-1 bg-transparent leading-6 outline-none" placeholder="you@example.com" />
              </div>
            </label>
            <label className="temp-label">
              Phone number
              <div className="temp-input flex items-center gap-3 px-4 py-3">
                <Phone size={16} className="shrink-0" />
                <input value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} className="min-w-0 flex-1 bg-transparent leading-6 outline-none" placeholder="07XXXXXXXX" />
              </div>
              <span className="mt-2 block text-xs text-[#959087]">Kenyan numbers can be entered as 07..., 01..., 254..., or +254...</span>
            </label>
            {settingsError && <p className="red-surface-notice rounded-2xl px-4 py-3 text-sm font-bold">{settingsError}</p>}
            {settingsMessage && <p className="rounded-2xl bg-emerald-400/15 px-4 py-3 text-sm font-bold text-emerald-100 shadow-[0_14px_35px_rgba(16,185,129,.18)]">{settingsMessage}</p>}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={savingSettings}>{savingSettings ? "Saving..." : "Save account details"}</Button>
              <Button type="button" variant="ghost" onClick={() => {
                setEmail(profile.email ?? user?.email ?? "");
                setPhoneNumber(profile.phoneNumber ?? user?.phoneNumber ?? "");
                setSettingsError("");
                setSettingsMessage("");
              }}>Reset</Button>
            </div>
          </form>
        </Card>
      {profile.role === "worker" ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card><BriefcaseBusiness /><h2 className="mt-3 font-black">Skills and categories</h2><p className="mt-2 text-sm text-[#959087]">{skills}</p></Card>
            <Card><CalendarCheck /><h2 className="mt-3 font-black">Availability</h2><p className="mt-2 text-sm text-[#959087]">{profile.availability ?? "Set your availability for temporary work."}</p></Card>
            <Card><FileBadge /><h2 className="mt-3 font-black">Certificates and portfolio</h2><p className="mt-2 text-sm text-[#959087]">{certificates}</p></Card>
          </div>
          <RatingHistory userId={profile.id} />
        </>
      ) : <RatingHistory userId={profile.id} />}
      </main>
      {(photoDraft || uploadingPhoto) && (
        <div className="temp-modal-backdrop fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <div role="dialog" aria-modal="true" aria-label="Crop your new profile picture" className="profile-photo-modal copic-modal w-full max-w-md rounded-[28px] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#959087]">Profile picture</p>
                <h2 className="mt-1 text-xl font-black text-[#FFFBFF]">{photoDraft ? "Move inside the circle" : "Uploading"}</h2>
              </div>
              <button type="button" aria-label="Close cropper" onClick={() => setPhotoDraft(null)} className="grid h-10 w-10 place-items-center rounded-full border border-[#4A463F]"><X size={18} /></button>
            </div>
            {uploadingPhoto && !photoDraft ? (
              <div className="mt-5 rounded-2xl bg-[#2A2A2B] p-5">
                <p className="text-sm font-bold text-[#CCC6BB]">Preparing profile picture...</p>
                <div className="profile-photo-loading-bar mt-4"><span /></div>
              </div>
            ) : photoDraft && (
              <>
              <div className="mt-5 grid place-items-center">
              <div
                className="profile-photo-cropper"
                onPointerDown={event => {
                  photoDraggingRef.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  movePhotoDraft(event);
                }}
                onPointerMove={event => {
                  if (photoDraggingRef.current) movePhotoDraft(event);
                }}
                onPointerUp={event => {
                  photoDraggingRef.current = false;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                  photoDraggingRef.current = false;
                }}
              >
                <div className="profile-photo-cropper-mask">
                  <ProfilePhotoImage photo={photoDraft} alt="New profile preview" className="profile-photo-cropper-image" />
                </div>
                <div className="profile-photo-cropper-vignette" />
                <span className="profile-photo-cropper-hint"><Move size={15} /> Hold and drag</span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button type="button" variant="secondary" className="profile-photo-zoom-button" onClick={() => zoomPhotoDraft(-0.1)} disabled={photoDraft.photoZoom <= 1}>Zoom out</Button>
              <span className="design-chip px-3 py-2">{Math.round(photoDraft.photoZoom * 100)}%</span>
              <Button type="button" variant="secondary" className="profile-photo-zoom-button" onClick={() => zoomPhotoDraft(0.1)} disabled={photoDraft.photoZoom >= 3}>Zoom in</Button>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setPhotoDraft(null)} disabled={uploadingPhoto}>Cancel</Button>
              <Button type="button" className="temp-success-button" onClick={() => void saveProfilePhoto()} disabled={uploadingPhoto}>{uploadingPhoto ? "Saving..." : "Set profile picture"}</Button>
            </div>
              </>
            )}
          </div>
        </div>
      )}
      {verificationOpen && <IdentityVerificationModal profile={profile} onClose={() => setVerificationOpen(false)} onSubmitted={refreshProfile} />}
    </div>
  );
}

function ratingSummary(items: Rating[]) {
  const count = items.length;
  const total = items.reduce((sum, rating) => sum + Number(rating.stars || 0), 0);
  return { count, average: count ? total / count : 0 };
}

function ProfilePhotoImage({ photo, alt, className = "" }: { photo: { photoURL: string; photoPositionX: number; photoPositionY: number; photoZoom: number }; alt: string; className?: string }) {
  const zoom = Math.max(1, photo.photoZoom);
  return (
    <img
      src={photo.photoURL}
      alt={alt}
      className={`profile-photo-render h-full w-full object-cover ${className}`}
      style={{
        objectPosition: `${photo.photoPositionX}% ${photo.photoPositionY}%`,
        transform: `scale(${zoom})`,
        transformOrigin: `${photo.photoPositionX}% ${photo.photoPositionY}%`
      }}
    />
  );
}
