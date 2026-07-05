"use client";

import { AppModal } from "@/components/ui/AppModal";
import { Button } from "@/components/ui/Button";
import { loadMyVerification, submitVerification } from "@/services/kyc";
import type { UserProfile, VerificationKind, VerificationRecord } from "@/types";
import { normalizeKenyanPhone } from "@/utils/phone";
import { verificationLabel } from "@/utils/verification";
import { Car, CheckCircle2, ImagePlus, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { VerificationBadge } from "./VerificationBadge";

type UploadKey = "idFront" | "idBack" | "selfieWithId";
type UploadState = Record<UploadKey, File | null>;
type ProgressState = Record<UploadKey, number>;

const emptyUploads: UploadState = { idFront: null, idBack: null, selfieWithId: null };
const emptyProgress: ProgressState = { idFront: 0, idBack: 0, selfieWithId: 0 };

export function IdentityVerificationModal({
  profile,
  onClose,
  onSubmitted,
  kind = "identity"
}: {
  profile: UserProfile;
  onClose: () => void;
  onSubmitted?: () => Promise<void> | void;
  kind?: VerificationKind;
}) {
  const [verification, setVerification] = useState<VerificationRecord | null>(null);
  const [uploads, setUploads] = useState<UploadState>(emptyUploads);
  const [progress, setProgress] = useState<ProgressState>(emptyProgress);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fullName, setFullName] = useState(profile.displayName);
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber ?? "");
  const [nationalId, setNationalId] = useState("");

  useEffect(() => {
    void loadMyVerification(kind).then(setVerification).catch(() => undefined);
  }, [kind]);

  const previews = useMemo(() => ({
    idFront: uploads.idFront ? URL.createObjectURL(uploads.idFront) : "",
    idBack: uploads.idBack ? URL.createObjectURL(uploads.idBack) : "",
    selfieWithId: uploads.selfieWithId ? URL.createObjectURL(uploads.selfieWithId) : ""
  }), [uploads]);

  useEffect(() => () => {
    Object.values(previews).forEach(url => {
      if (url) URL.revokeObjectURL(url);
    });
  }, [previews]);

  const isDriverLicense = kind === "driver_license";
  const status = verification?.status ?? (isDriverLicense ? profile.driverLicenseVerificationStatus ?? "not_submitted" : profile.verificationStatus);
  const canSubmit = status === "not_submitted" || status === "rejected";
  const documentName = isDriverLicense ? "Driver's license" : "National ID";
  const selfieLabel = isDriverLicense ? "Selfie while holding driver's license" : "Selfie while holding ID";

  function setUpload(key: UploadKey, file: File | null) {
    setError("");
    if (file && (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024)) {
      setError("Each upload must be a clear image under 8 MB.");
      return;
    }
    setUploads(current => ({ ...current, [key]: file }));
    setProgress(current => ({ ...current, [key]: 0 }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile.role === "admin") return;
    const phone = normalizeKenyanPhone(phoneNumber);
    if (!fullName.trim()) return setError("Enter your full legal name.");
    if (!phone) return setError("Please enter a valid Kenyan phone number.");
    if (!nationalId.trim()) return setError(isDriverLicense ? "Enter your driver's license number." : "Enter your National ID number.");
    if (!uploads.idFront || !uploads.idBack || !uploads.selfieWithId) return setError(`Upload the ${documentName} front, ${documentName} back, and a selfie holding the document.`);
    setSubmitting(true);
    setError("");
    try {
      const result = await submitVerification({
        userId: profile.id,
        role: profile.role === "client" ? "client" : "worker",
        kind,
        fullName: fullName.trim(),
        phoneNumber: phone,
        nationalId: nationalId.trim(),
        idFrontFile: uploads.idFront,
        idBackFile: uploads.idBack,
        selfieWithIdFile: uploads.selfieWithId
      }, (field, value) => setProgress(current => ({ ...current, [field]: value })));
      setSubmitted(true);
      setVerification(await loadMyVerification(kind));
      await onSubmitted?.();
      toast.success(result.message ?? "Verification submitted for review.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to submit verification right now.";
      setProgress(emptyProgress);
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppModal eyebrow={isDriverLicense ? "Driver verification" : "Account verification"} title={isDriverLicense ? "Add Driver's License" : "Verify Identity"} onClose={onClose} maxWidth="max-w-4xl">
      <div className="grid gap-5">
        <div className="rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {isDriverLicense ? <Car className="text-[#D3C4B3]" /> : <ShieldCheck className="text-[#D3C4B3]" />}
              <div>
                <p className="text-sm font-black text-[#FFFBFF]">{verificationLabel(status)}</p>
                <p className="text-sm text-[#CCC6BB]">Use clear photos. Your {documentName.toLowerCase()} details and face must be readable.</p>
              </div>
            </div>
            <VerificationBadge status={status} />
          </div>
          {submitted || status === "pending" ? <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-bold text-amber-100">Your {isDriverLicense ? "driver's license" : "identity"} verification has been submitted and is awaiting admin review.</p> : null}
          {status === "approved" ? <p className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-100"><CheckCircle2 className="mr-2 inline" size={16} />{isDriverLicense ? "Driver's License Verified" : "Verified Identity"}</p> : null}
          {status === "rejected" ? <p className="mt-4 rounded-xl border border-red-300/30 bg-red-400/10 p-3 text-sm font-bold text-red-100">{verification?.rejectionReason ?? (isDriverLicense ? profile.driverLicenseRejectionReason : profile.verificationRejectionReason) ?? "Your previous verification was rejected. Please upload clearer images."}</p> : null}
        </div>

        {canSubmit && (
          <form onSubmit={submit} className="identity-verification-form grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="temp-label">Full name<input value={fullName} onChange={event => setFullName(event.target.value)} required className="temp-input p-3 outline-none" /></label>
              <label className="temp-label">Phone number<input value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} required placeholder="07XXXXXXXX" className="temp-input p-3 outline-none" /></label>
              <label className="temp-label md:col-span-2">{isDriverLicense ? "Driver's license number" : "National ID number"}<input value={nationalId} onChange={event => setNationalId(event.target.value)} required inputMode={isDriverLicense ? "text" : "numeric"} autoComplete="off" placeholder={isDriverLicense ? "Driver's license number" : "National ID number"} className="temp-input p-3 outline-none" /></label>
            </div>
            <div className="identity-upload-grid grid gap-3">
              <UploadBox label={`Front side of ${documentName}`} file={uploads.idFront} preview={previews.idFront} progress={progress.idFront} disabled={submitting} onFile={file => setUpload("idFront", file)} />
              <UploadBox label={`Back side of ${documentName}`} file={uploads.idBack} preview={previews.idBack} progress={progress.idBack} disabled={submitting} onFile={file => setUpload("idBack", file)} />
              <UploadBox label={selfieLabel} file={uploads.selfieWithId} preview={previews.selfieWithId} progress={progress.selfieWithId} disabled={submitting} capture="user" onFile={file => setUpload("selfieWithId", file)} />
            </div>
            {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
            <Button type="submit" className="temp-success-button" disabled={submitting}>{submitting ? "Uploading securely..." : status === "rejected" ? "Resubmit verification" : "Submit for review"}</Button>
          </form>
        )}
      </div>
    </AppModal>
  );
}

function UploadBox({ label, file, preview, progress, disabled, capture, onFile }: { label: string; file: File | null; preview: string; progress: number; disabled: boolean; capture?: "user"; onFile: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="verification-upload-box">
      <span className="verification-upload-label">{label}</span>
      <span className="verification-upload-preview">
        {preview ? <img src={preview} alt={`${label} preview`} /> : <span><ImagePlus size={24} /> Upload image</span>}
      </span>
      <button type="button" className="verification-upload-action" disabled={disabled} onClick={() => inputRef.current?.click()}>{file ? "Replace image" : "Choose image"}</button>
      <input
        ref={inputRef}
        disabled={disabled}
        type="file"
        accept="image/*"
        capture={capture}
        tabIndex={-1}
        onChange={event => {
          onFile(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
      <span className="verification-upload-meta">{file ? file.name : "Required image, max 8 MB"}</span>
      {(disabled || progress > 0) && <span className="verification-upload-progress"><i style={{ width: `${progress}%` }} /></span>}
    </div>
  );
}
