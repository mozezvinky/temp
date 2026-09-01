"use client";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AddSkillModal } from "@/components/profile/AddSkillModal";
import { RequestPricingSummary } from "@/components/direct-hire/RequestPricingSummary";
import { RatingHistory } from "@/components/ratings/RatingHistory";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import { AppModal } from "@/components/ui/AppModal";
import { Button } from "@/components/ui/Button";
import { WorkerLocationModal } from "@/components/location/WorkerLocationModal";
import { IdentityVerificationModal } from "@/components/verification/IdentityVerificationModal";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { VerificationReminder } from "@/components/verification/VerificationReminder";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { cancelApplication, cancelLiveApplication, confirmWorkerPaymentReceived, requestApplicationCompletion, respondDirectHireRequest, subscribeApplications } from "@/services/jobs";
import { loadRatings, rateClient } from "@/services/ratings";
import { reportCompletedJob } from "@/services/reports";
import { loadServiceFeePayment, loadServiceFeePaywallState, submitServiceFeePayment } from "@/services/service-fee";
import { deleteWorkerSkill, loadWorkerSkills } from "@/services/worker-skills";
import type { Application, ServiceFeePayment, ServiceFeePaywallState, WorkerSkillProfile } from "@/types";
import { BriefcaseBusiness, Car, CheckCircle2, Clock, MapPin, MessageCircle, Pencil, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { applicationTimelinePay } from "@/utils/application-timeline-pay";
import { perDurationUnit } from "@/utils/duration";
import { calculateJobPaymentBreakdown, calculateWorkerNet, kes } from "@/utils/money";
import { completedJobId } from "@/utils/completed-job-id";
import { jobLocationLabel } from "@/utils/location-display";
import { isPayPerTimeline } from "@/utils/timeline-payments";
import { normalizeSkillVerificationStatus, skillVerificationLabel } from "@/utils/worker-skills";
import { normalizeVerificationStatus } from "@/utils/verification";
import { toast } from "sonner";

const SERVICE_FEE_PAYBILL_NUMBER = "400200";
const SERVICE_FEE_ACCOUNT_NUMBER = "1196158";

function directHireRequestLocationLabel(application: Application) {
  return jobLocationLabel({
    location: application.requestLocation ?? "",
    county: application.requestLocationDetails?.county ?? "",
    locationDetails: application.requestLocationDetails
  });
}
const SERVICE_FEE_RECIPIENT_NAME = "BLUEPEAK SOFTWARE SERVICES LIMITED";
const PHONE_PROMPT_UNAVAILABLE_MESSAGE = "Service not available yet. This feature will be activated in a future update.";

export default function DashboardPage() {
  const { profile, loading, isAuthorized, refreshProfile } = useProtectedRoute();
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState("");
  const [jobsModalTab, setJobsModalTab] = useState<"applications" | "live" | "completed" | "requests">("applications");
  const [openModal, setOpenModal] = useState<"jobs" | "ratings" | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [driverLicenseOpen, setDriverLicenseOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<WorkerSkillProfile | null>(null);
  const [profileSkills, setProfileSkills] = useState<WorkerSkillProfile[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  const [serviceFeePayment, setServiceFeePayment] = useState<ServiceFeePayment | null>(null);
  const [serviceFeePaywall, setServiceFeePaywall] = useState<ServiceFeePaywallState | null>(null);
  const [submittingFee, setSubmittingFee] = useState(false);
  const [feeScreenshotSelected, setFeeScreenshotSelected] = useState(false);
  const [feeMessage, setFeeMessage] = useState<{ tone: "success" | "error" | "pending"; text: string } | null>(null);
  const [ratingAggregate, setRatingAggregate] = useState<{ average: number; count: number; breakdown: Record<number, number> }>({ average: 0, count: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  const profileId = profile?.id;
  const profileRole = profile?.role;
  const profileOutstandingServiceFee = Number(profile?.outstandingServiceFee ?? 0);
  const paywallAmountDue = Number(serviceFeePaywall?.amountDue ?? 0);
  const pendingServiceFeeAmount = !!serviceFeePayment && serviceFeePayment.status !== "approved" && serviceFeePayment.status !== "rejected"
    ? Number(serviceFeePayment.amount ?? 0)
    : 0;
  const currentOutstandingServiceFee = paywallAmountDue > 0
    ? paywallAmountDue
    : profileOutstandingServiceFee > 0
    ? profileOutstandingServiceFee
    : pendingServiceFeeAmount > 0
      ? pendingServiceFeeAmount
      : 0;
  const pendingServiceFeePayment = !!serviceFeePayment
    && serviceFeePayment.status !== "rejected"
    && serviceFeePayment.status !== "approved"
    && Number(serviceFeePayment.amount ?? 0) >= currentOutstandingServiceFee;
  const serviceFeeStatus = serviceFeePaywall?.status ?? (serviceFeePayment?.status === "rejected" ? "failed" : pendingServiceFeePayment ? "pending" : currentOutstandingServiceFee > 0 ? "due" : "not_due");
  const serviceFeeApproved = serviceFeeStatus === "paid" || (serviceFeePayment?.status === "approved" && profileOutstandingServiceFee <= 0 && paywallAmountDue <= 0);
  const profileLocked = !!profile && profile.role !== "admin" && (profile.isLocked || serviceFeePaywall?.accountRestricted || currentOutstandingServiceFee > 0);

  useEffect(() => {
    if (profile?.role === "client" && !profileLocked) router.replace("/workers");
  }, [profile, profileLocked, router]);

  useEffect(() => {
    if (!profileId || !profileRole || profileRole === "admin") return;
    setApplicationsLoading(true);
    setApplicationsError("");
    return subscribeApplications(
      profileId,
      profileRole,
      items => {
        setApplications(items);
        setApplicationsLoading(false);
        setApplicationsError("");
      },
      error => {
        setApplicationsLoading(false);
        setApplicationsError(error.message);
      }
    );
  }, [profileId, profileRole]);

  useEffect(() => {
    if (!profileId || profileRole !== "worker") return;
    let cancelled = false;
    void Promise.all([loadServiceFeePayment(), loadServiceFeePaywallState()])
      .then(([payment, paywall]) => {
        if (cancelled) return;
        setServiceFeePayment(payment);
        setServiceFeePaywall(paywall);
      })
      .catch(() => {
        if (!cancelled) {
          setServiceFeePayment(null);
          setServiceFeePaywall(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, profileRole]);

  useEffect(() => {
    if (!profileId || profileRole !== "worker" || !serviceFeePaywall?.shouldShowPaywall) return;
    const checkPayment = () => {
      void Promise.all([loadServiceFeePayment(), loadServiceFeePaywallState()])
        .then(([payment, paywall]) => {
          setServiceFeePayment(payment);
          setServiceFeePaywall(paywall);
          if (paywall?.status === "paid" || paywall?.status === "not_due") {
            void refreshProfile();
          }
        })
        .catch(() => undefined);
    };
    const intervalId = window.setInterval(checkPayment, 5_000);
    return () => window.clearInterval(intervalId);
  }, [profileId, profileRole, refreshProfile, serviceFeePaywall?.shouldShowPaywall]);

  useEffect(() => {
    if (!profileId || profileRole !== "worker") return;
    void loadRatings(profileId).then(result => setRatingAggregate(result.aggregate)).catch(() => setRatingAggregate({ average: 0, count: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }));
  }, [profileId, profileRole]);

  useEffect(() => {
    if (!profile || profile.role !== "worker") {
      setProfileSkills([]);
      return;
    }
    setProfileSkills(profile.skillProfiles?.length
      ? profile.skillProfiles
      : (profile.skills ?? []).map((name, index) => ({
          id: `legacy-${index}-${name}`,
          name,
          category: "services_trades",
          level: "independent",
          proofType: "reference",
          verificationStatus: "approved",
          completedJobs: 0,
          ratingAverage: 0,
          ratingCount: 0
        })));
  }, [profile]);

  useEffect(() => {
    if (!profileId || profileRole !== "worker") return;
    let cancelled = false;
    setSkillsLoading(true);
    setSkillsError("");
    void loadWorkerSkills()
      .then(skills => {
        if (!cancelled) {
          setProfileSkills(skills);
          setSkillsError("");
        }
      })
      .catch(error => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unable to load skills.";
          setSkillsError(message.includes("Worker access required") ? "" : message);
        }
      })
      .finally(() => {
        if (!cancelled) setSkillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, profileRole]);

  if (loading || !isAuthorized || !profile) return <LoadingSpinner label="Opening dashboard" />;

  async function removeSkill(skillId: string) {
    try {
      const nextSkills = await deleteWorkerSkill(skillId);
      if (nextSkills) setProfileSkills(nextSkills);
      toast.success("Skill deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete this skill.");
    }
  }

  async function submitServiceFee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const screenshot = form.get("screenshot");
    if (!(screenshot instanceof File) || screenshot.size <= 0) {
      setFeeMessage({ tone: "error", text: "Upload the M-Pesa confirmation screenshot before submitting." });
      toast.error("Upload the M-Pesa confirmation screenshot before submitting.");
      return;
    }
    setSubmittingFee(true);
    setFeeMessage(null);
    try {
      const payment = await submitServiceFeePayment({
        screenshot
      });
      setServiceFeePayment(payment);
      const paywall = await loadServiceFeePaywallState();
      setServiceFeePaywall(paywall);
      setFeeMessage({ tone: "pending", text: "Screenshot submitted. Waiting for admin confirmation." });
      toast.success("Waiting for admin confirmation.");
      await refreshProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit payment.";
      if (/no service fee|outstanding service fee/i.test(message)) {
        setServiceFeePaywall(null);
        await refreshProfile();
      }
      setFeeMessage({ tone: "error", text: message });
      toast.error(message);
    } finally {
      setSubmittingFee(false);
    }
  }

  function promptPhoneNumberDirectly() {
    toast.info(PHONE_PROMPT_UNAVAILABLE_MESSAGE);
  }

  const emailPrompt = null;
  const visibleApplications = applications.filter(application => application.coverNote !== "Rehire request");
  const directHireRequests = visibleApplications.filter(application => application.source === "direct_hire" && application.status === "pending");
  const standardApplications = visibleApplications.filter(application => application.source !== "direct_hire");
  const liveApplications = visibleApplications.filter(application => ["accepted", "completion_requested", "payment_sent"].includes(application.status) && application.jobStatus !== "completed" && application.jobStatus !== "cancelled");
  const doneApplications = visibleApplications.filter(application => application.status === "completed" || application.jobStatus === "completed");
  const completedJobsCount = Math.max(profile.completedJobs ?? 0, doneApplications.length);
  const displayRating = ratingAggregate.count ? ratingAggregate.average : profile.ratingAverage ?? 0;
  const dashboardSkills = profileSkills;
  const totalGrossEarnings = doneApplications.reduce((sum, application) => sum + Number(application.jobAmount ?? 0), 0);
  const totalEarnings = doneApplications.reduce((sum, application) => sum + calculateWorkerNet(Number(application.jobAmount ?? 0)), 0);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const earningsThisMonth = doneApplications
    .filter(application => application.updatedAt && "toDate" in application.updatedAt ? (application.updatedAt.toDate() as Date).getMonth() === now.getMonth() : true)
    .reduce((sum, application) => sum + calculateWorkerNet(Number(application.jobAmount ?? 0)), 0);
  const earningsThisWeek = doneApplications
    .filter(application => application.updatedAt && "toDate" in application.updatedAt ? (application.updatedAt.toDate() as Date) >= weekStart : true)
    .reduce((sum, application) => sum + calculateWorkerNet(Number(application.jobAmount ?? 0)), 0);
  const averageJobValue = doneApplications.length ? totalEarnings / doneApplications.length : 0;
  const completionRate = visibleApplications.length ? Math.round((doneApplications.length / visibleApplications.length) * 100) : 0;
  const demandedServiceFee = serviceFeeApproved ? 0 : currentOutstandingServiceFee;
  const waitingForAdminConfirmation = serviceFeeStatus === "pending" || pendingServiceFeePayment;
  const paywallGrossAmount = Number(serviceFeePaywall?.grossAmount ?? 0) > 0 ? Number(serviceFeePaywall?.grossAmount ?? 0) : demandedServiceFee * 10;
  const paywallServiceFeeAmount = Number(serviceFeePaywall?.serviceFeeAmount ?? 0) > 0 ? Number(serviceFeePaywall?.serviceFeeAmount ?? 0) : demandedServiceFee;
  const paywallWorkerEarnings = Number(serviceFeePaywall?.workerEarnings ?? 0) > 0 ? Number(serviceFeePaywall?.workerEarnings ?? 0) : Math.max(0, paywallGrossAmount - paywallServiceFeeAmount);
  const profilePhoto = profile.photoURL ? {
    photoURL: profile.photoURL,
    photoPositionX: profile.photoPositionX ?? 50,
    photoPositionY: profile.photoPositionY ?? 50,
    photoZoom: profile.photoZoom ?? 1
  } : null;

  if (demandedServiceFee > 0) {
    return (
      <div className="copic-paywall-overlay" data-copic-paywall="service-fee-v3">
        <div className="copic-paywall-scroll-frame">
          <Card role="dialog" aria-modal="true" aria-label="COPIC service fee payment" className="copic-service-fee-paywall" data-copic-paywall="service-fee-v3">
            <div className="copic-paywall-header">
              <p className="copic-paywall-eyebrow">10% Service Fee Due</p>
              <h1 className="copic-paywall-title">Pay {kes(demandedServiceFee)} now</h1>
              <p className="copic-paywall-description">This is 10% of the client payment for your completed job. Pay this amount to unlock your worker account.</p>
            </div>
            {serviceFeePayment?.status === "rejected" && <p className="copic-paywall-message is-error">{serviceFeePayment.rejectionReason ?? "Your last payment was rejected. Please resubmit."}</p>}
            {waitingForAdminConfirmation && <p className="copic-paywall-message is-pending">Waiting for admin confirmation.</p>}
            <div className="copic-payment-received-panel">
              <p className="copic-payment-received-title">Payment Received</p>
              <p>You have been paid {kes(paywallGrossAmount)} for this job.</p>
              <p>Your earnings: {kes(paywallWorkerEarnings)}</p>
              <p>COPIC service fee: {kes(paywallServiceFeeAmount)}</p>
              <p className="copic-payment-received-due">Amount Due: {kes(demandedServiceFee)}</p>
            </div>
            <div className="copic-paywall-section">
              <p className="copic-paywall-section-label">Payment details</p>
              <div className="copic-paywall-details-grid">
                <CopyBox label="Paybill Number" value={SERVICE_FEE_PAYBILL_NUMBER} />
                <CopyBox label="Account Number" value={SERVICE_FEE_ACCOUNT_NUMBER} />
                <CopyBox label="Amount" value={kes(demandedServiceFee)} copyValue={String(demandedServiceFee)} />
              </div>
            </div>
            <p className="copic-paywall-instructions">Use Paybill <span>{SERVICE_FEE_PAYBILL_NUMBER}</span> and Account <span>{SERVICE_FEE_ACCOUNT_NUMBER}</span>. The payment confirmation should show payment made to <span>{SERVICE_FEE_RECIPIENT_NAME}</span>. Upload the M-Pesa confirmation screenshot so admin can approve the unlock.</p>
            <form onSubmit={submitServiceFee} className="copic-paywall-form">
              <div className="copic-paywall-upload-card">
                <label className="copic-paywall-upload-label">M-Pesa confirmation screenshot<input name="screenshot" type="file" accept="image/*" required onChange={event => { setFeeScreenshotSelected(!!event.currentTarget.files?.[0]); setFeeMessage(null); }} className="copic-paywall-file-input temp-input" /></label>
                <p className="copic-paywall-helper">Upload a clear JPEG, PNG, or WebP screenshot of the M-Pesa confirmation.</p>
              </div>
              {feeMessage && <p className={`copic-paywall-message is-${feeMessage.tone}`}>{feeMessage.text}</p>}
              <div className="copic-paywall-actions">
                <Button type="submit" className="copic-paywall-submit-button temp-success-button" disabled={submittingFee || waitingForAdminConfirmation || !feeScreenshotSelected}>{waitingForAdminConfirmation ? "Waiting for admin confirmation" : submittingFee ? "Submitting..." : feeScreenshotSelected ? "Submit for Admin Approval" : "Upload Screenshot First"}</Button>
                <Button type="button" variant="secondary" className="copic-paywall-secondary-button" onClick={promptPhoneNumberDirectly}>Prompt Phone Number Directly</Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  if (profile.role === "client") {
    return <LoadingSpinner label="Opening profile" />;
  }

  return (
    <div className="temp-worker-dashboard copic-dashboard">
      {emailPrompt}
      <section className="temp-worker-dashboard-canvas copic-dashboard-canvas">
        <header className="copic-dashboard-header">
          <div>
            <h1>Welcome in, {profile.displayName}</h1>
            <div className="mt-3"><VerificationBadge status={profile.verificationStatus} /></div>
          </div>
          <div className="copic-dashboard-actions">
            <Link href="/jobs" className="temp-success-button copic-button copic-button-primary">Find Jobs</Link>
            <Button type="button" onClick={() => { setEditingSkill(null); setSkillOpen(true); }}><Plus size={17} /> Add skills</Button>
            <Button type="button" variant="secondary" onClick={() => setOpenModal("ratings")}><Star size={17} /> Ratings</Button>
          </div>
        </header>
        {profile.isLocked && <div className="copic-alert copic-alert-error">{profile.lockReason}</div>}
        <VerificationReminder profile={profile} onVerify={() => setVerificationOpen(true)} />
        {applicationsError && <div className="copic-alert copic-alert-error">
          {isConnectionPaused(applicationsError)
            ? "Connection is paused. Your saved work is safe. We'll restore updates shortly."
            : "Work activity could not refresh. Your saved work remains visible while we restore updates."}
        </div>}

        <div className="copic-dashboard-grid">
          <aside className="copic-dashboard-left" aria-label="Worker profile and performance">
            <Card className="copic-profile-summary">
              <div className="copic-profile-header">
                <span className="copic-avatar">
                  {profilePhoto ? <DashboardProfilePhoto photo={profilePhoto} alt={profile.displayName} /> : profile.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="copic-profile-identity"><h2>{profile.displayName}</h2></div>
              <div className="copic-data-list">
                <p><span>Total earnings</span><strong>{kes(totalEarnings)}</strong></p>
                <p><span>Gross value</span><strong>{kes(totalGrossEarnings)}</strong></p>
                <p><span>Jobs done</span><strong>{completedJobsCount}</strong></p>
              </div>
            </Card>

            <Card className="copic-performance-panel">
              <div className="copic-panel-heading"><h2>Performance</h2></div>
              <div className="copic-data-list">
                <p><span>This month</span><strong>{kes(earningsThisMonth)}</strong></p>
                <p><span>This week</span><strong>{kes(earningsThisWeek)}</strong></p>
                <p><span>Average job value</span><strong>{kes(averageJobValue)}</strong></p>
                <p><span>Global rating</span><strong>{displayRating.toFixed(1)} <Star size={14} aria-hidden="true" /></strong></p>
              </div>
              <div className="copic-progress-block"><div><span>Completion rate</span><strong>{completionRate}%</strong></div><span className="copic-progress-track"><i style={{ width: `${completionRate}%` }} /></span></div>
            </Card>
          </aside>

          <main className="copic-dashboard-main">
            <Card className="copic-dashboard-panel copic-skills-panel">
              <div className="copic-panel-heading">
                <div><p className="copic-eyebrow">Profile</p><h2>Skills</h2></div>
                <Button type="button" variant="secondary" onClick={() => { setEditingSkill(null); setSkillOpen(true); }}><Plus size={16} /> Add</Button>
              </div>
              <div className="copic-skill-list">
                {skillsError && <p className="copic-inline-error">Could not refresh skills: {skillsError}. Showing the profile data already available.</p>}
                {dashboardSkills.length ? dashboardSkills.map(skill => (
                  <article key={skill.id} className="copic-skill-row">
                    <div>
                      <h3>{skill.name}</h3>
                      {skill.description && <p>{skill.description}</p>}
                      <small>{skill.completedJobs} jobs completed · {skill.ratingAverage} rating</small>
                      <span className={`copic-skill-status is-${normalizeSkillVerificationStatus(skill.verificationStatus)}`}>{skillVerificationLabel(skill.verificationStatus)}</span>
                    </div>
                    <div className="copic-row-actions">
                      <button type="button" aria-label={`Edit ${skill.name}`} onClick={() => { setEditingSkill(skill); setSkillOpen(true); }}><Pencil size={15} /></button>
                      {!skill.id.startsWith("legacy-") && <button type="button" className="is-danger" aria-label={`Delete ${skill.name}`} onClick={() => void removeSkill(skill.id)}><Trash2 size={15} /></button>}
                    </div>
                  </article>
                )) : skillsLoading ? <LoadingSpinner label="Loading skills" /> : <EmptyState title="No skills yet" body="Add skills so clients can find you in worker search." />}
              </div>
            </Card>

            <Card className="copic-dashboard-panel copic-current-work">
              <div className="copic-panel-heading">
                <div><p className="copic-eyebrow">In progress</p><h2>Current work</h2></div>
                <span className="copic-count-badge">{liveApplications.length} active</span>
              </div>
              {applicationsLoading && !applications.length ? <LoadingSpinner label="Loading current work" /> : liveApplications.length ? <div className="copic-work-list">{liveApplications.slice(0, 4).map(application => (
                <article key={`task-${application.id}`} className="copic-work-row">
                  <span className="copic-work-icon"><BriefcaseBusiness size={18} /></span>
                  <div><h3>{application.jobTitle ?? "Live job"}</h3><p>{application.jobCategory ?? "Job"}</p></div>
                  <span className="copic-status-badge copic-status-live">Live</span>
                </article>
              ))}</div> : <EmptyState title="No live work yet" body="Accepted jobs will appear here so you can follow their progress." />}
            </Card>
          </main>

          <aside className="copic-dashboard-right" aria-label="Work progress and shortcuts">
            <Card className="copic-work-progress" aria-label="Work progress">
              <div className="copic-panel-heading"><h2>Work progress</h2><span className="copic-progress-dot" /></div>
              <div className="copic-dashboard-metrics">
                <button type="button" onClick={() => { setJobsModalTab("applications"); setOpenModal("jobs"); }}>
                  <strong>{applicationsLoading && !applications.length ? "—" : visibleApplications.length}</strong><small>Applied</small>
                </button>
                <button type="button" onClick={() => { setJobsModalTab("live"); setOpenModal("jobs"); }}>
                  <strong>{applicationsLoading && !applications.length ? "—" : liveApplications.length}</strong><small>Live</small>
                </button>
                <button type="button" onClick={() => { setJobsModalTab("completed"); setOpenModal("jobs"); }}>
                  <strong>{applicationsLoading && !applications.length ? "—" : completedJobsCount}</strong><small>Done</small>
                </button>
              </div>
            </Card>

            <Card className="copic-quick-actions">
              <button type="button" onClick={() => { setJobsModalTab("applications"); setOpenModal("jobs"); }}><BriefcaseBusiness size={17} /> Applications <span>{standardApplications.length}</span></button>
              <button type="button" onClick={() => { setJobsModalTab("live"); setOpenModal("jobs"); }}><Clock size={17} /> Live jobs <span>{liveApplications.length}</span></button>
              <button type="button" onClick={() => { setJobsModalTab("requests"); setOpenModal("jobs"); }}><MessageCircle size={17} /> Requests <span>{directHireRequests.length}</span></button>
              <button type="button" onClick={() => { setJobsModalTab("completed"); setOpenModal("jobs"); }}><CheckCircle2 size={17} /> Completed jobs <span>{completedJobsCount}</span></button>
              <button type="button" onClick={() => setDriverLicenseOpen(true)}><Car size={17} /> Add driver&apos;s license <span>{normalizeVerificationStatus(profile.driverLicenseVerificationStatus) === "approved" ? "Verified" : normalizeVerificationStatus(profile.driverLicenseVerificationStatus) === "pending" ? "Pending" : "New"}</span></button>
              <button type="button" onClick={() => setLocationOpen(true)}><MapPin size={17} /> {profile.location ? "Change Location" : "Set Up Your Location"} <span>{profile.location ? "Saved" : "New"}</span></button>
            </Card>
          </aside>
        </div>
      </section>
      {openModal === "jobs" && (
        <DashboardModal title={jobsModalTab === "applications" ? "Applied jobs" : jobsModalTab === "live" ? "Live jobs" : jobsModalTab === "requests" ? "Requests" : "Completed jobs"} onClose={() => setOpenModal(null)}>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["applications", "live", "requests", "completed"] as const).map(tab => (
              <button key={tab} type="button" onClick={() => setJobsModalTab(tab)} className={`temp-status-pill ${tab === "applications" || tab === "requests" ? "temp-status-applications" : tab === "live" ? "temp-status-live" : "temp-status-completed"} ${jobsModalTab === tab ? "is-active" : ""}`}>{tab === "applications" ? "Applications" : tab === "live" ? "Live jobs" : tab === "requests" ? "Requests" : "Completed jobs"}</button>
            ))}
          </div>
          <ApplicationList
            mode={jobsModalTab}
            applications={jobsModalTab === "applications" ? standardApplications : jobsModalTab === "live" ? liveApplications : jobsModalTab === "requests" ? directHireRequests : doneApplications}
            workerHasLiveJob={liveApplications.length > 0}
            onApplicationUpdated={updatedApplication => {
              setApplications(items => items.map(item => item.id === updatedApplication.id ? { ...item, ...updatedApplication } : item));
            }}
          />
        </DashboardModal>
      )}
      {openModal === "ratings" && (
        <DashboardModal title="Ratings and reviews" onClose={() => setOpenModal(null)}>
          <RatingHistory userId={profile.id} />
        </DashboardModal>
      )}
      {skillOpen && <AddSkillModal skill={editingSkill} onClose={() => { setSkillOpen(false); setEditingSkill(null); }} onSaved={(nextSkills, savedSkill) => {
        if (nextSkills) {
          setProfileSkills(nextSkills);
          return;
        }
        setProfileSkills(current => [
          ...current.filter(item => item.id !== savedSkill.id && item.name.toLowerCase() !== savedSkill.name.toLowerCase()),
          savedSkill
        ]);
      }} />}
      {verificationOpen && <IdentityVerificationModal profile={profile} onClose={() => setVerificationOpen(false)} onSubmitted={refreshProfile} />}
      {driverLicenseOpen && <IdentityVerificationModal profile={profile} kind="driver_license" onClose={() => setDriverLicenseOpen(false)} onSubmitted={refreshProfile} />}
      {locationOpen && <WorkerLocationModal profile={profile} onClose={() => setLocationOpen(false)} onSaved={refreshProfile} />}
    </div>
  );
}

function isConnectionPaused(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("offline") || normalized.includes("network") || normalized.includes("resource_exhausted") || normalized.includes("quota");
}

function DashboardProfilePhoto({ photo, alt }: { photo: { photoURL: string; photoPositionX: number; photoPositionY: number; photoZoom: number }; alt: string }) {
  return (
    <img
      src={photo.photoURL}
      alt={alt}
      className="h-full w-full object-cover"
      style={{
        objectPosition: `${photo.photoPositionX}% ${photo.photoPositionY}%`,
        transform: `scale(${photo.photoZoom})`,
        transformOrigin: `${photo.photoPositionX}% ${photo.photoPositionY}%`
      }}
    />
  );
}

const DashboardModal = AppModal;

function CopyBox({ label, value, copyValue = value }: { label: string; value: string; copyValue?: string }) {
  return (
    <div className="copic-paywall-copy-card">
      <p className="copic-paywall-copy-label">{label}</p>
      <p className="copic-paywall-copy-value">{value}</p>
      <Button type="button" variant="secondary" className="copic-paywall-copy-button" onClick={() => void navigator.clipboard.writeText(copyValue)}>Copy</Button>
    </div>
  );
}

function ApplicationList({ applications, mode, workerHasLiveJob = false, onApplicationUpdated }: { applications: Application[]; mode: "applications" | "live" | "completed" | "requests"; workerHasLiveJob?: boolean; onApplicationUpdated: (application: Application) => void }) {
  const [busyId, setBusyId] = useState("");
  const [busyAction, setBusyAction] = useState<"cancel" | "complete" | "confirm_payment" | "accept_request" | "reject_request" | "">("");
  const [pendingCancel, setPendingCancel] = useState<Application | null>(null);
  const [pendingLiveCancel, setPendingLiveCancel] = useState<Application | null>(null);
  const [pendingComplete, setPendingComplete] = useState<Application | null>(null);
  const [reportingId, setReportingId] = useState("");

  async function cancel(application: Application) {
    setBusyId(application.id);
    setBusyAction("cancel");
    try {
      const updated = await cancelApplication(application);
      onApplicationUpdated({ ...application, ...updated, status: "withdrawn" });
      toast.success("Application cancelled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel application.");
    } finally {
      setBusyId("");
      setBusyAction("");
    }
  }

  async function cancelLive(application: Application) {
    setBusyId(application.id);
    setBusyAction("cancel");
    try {
      const updated = await cancelLiveApplication(application);
      onApplicationUpdated({ ...application, ...updated, status: "cancelled", jobStatus: "cancelled" });
      toast.success("Live job cancelled with no pay.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel live job.");
    } finally {
      setBusyId("");
      setBusyAction("");
    }
  }

  async function answerRequest(application: Application, response: "accept" | "reject") {
    setBusyId(application.id);
    setBusyAction(response === "accept" ? "accept_request" : "reject_request");
    try {
      const updated = await respondDirectHireRequest(application, response);
      onApplicationUpdated({ ...application, ...updated, status: response === "accept" ? "accepted" : "rejected", jobStatus: response === "accept" ? "live" : "cancelled" });
      toast.success(response === "accept" ? "Request accepted. This is now a live job." : "Request rejected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update request.");
    } finally {
      setBusyId("");
      setBusyAction("");
    }
  }

  async function requestComplete(application: Application, stars = 0, review = "", timelineCount?: number) {
    setBusyId(application.id);
    setBusyAction("complete");
    try {
      const updated = await requestApplicationCompletion(application, timelineCount);
      onApplicationUpdated({ ...application, ...updated, status: "completion_requested" });
      let ratingSaved = false;
      if (stars > 0) {
        try {
          await rateClient(application.jobId, application.clientId, stars, review);
          ratingSaved = true;
        } catch {
          toast.warning("Completion was sent, but the client rating could not be saved.");
        }
      }
      toast.success(ratingSaved ? "Completion sent and client rating submitted." : "Completion sent to the client for confirmation.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to mark work complete.");
    } finally {
      setBusyId("");
      setBusyAction("");
    }
  }
  async function confirmPayment(application: Application) {
    setBusyId(application.id);
    setBusyAction("confirm_payment");
    try {
      const updated = await confirmWorkerPaymentReceived(application);
      onApplicationUpdated({ ...application, ...updated, status: "completed" });
      toast.success("Payment received confirmed. Your account is now locked until the service fee is paid.");
      window.location.assign("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to confirm payment received.");
    } finally {
      setBusyId("");
      setBusyAction("");
    }
  }

  async function reportIssue(application: Application) {
    const id = completedJobId(application.id);
    const reason = window.prompt(`Describe the issue for completed job ${id}`);
    if (!reason?.trim()) return;
    setReportingId(application.id);
    try {
      const result = await reportCompletedJob({
        completedJobId: id,
        jobId: application.jobId,
        applicationId: application.id,
        title: `Completed job issue: ${application.jobTitle ?? id}`,
        reason: reason.trim()
      });
      toast.success(`Report submitted. Ticket ${result.ticketId ?? "created"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit report.");
    } finally {
      setReportingId("");
    }
  }

  if (!applications.length) return <EmptyState title={`No ${mode === "completed" ? "completed jobs" : mode}`} body="Jobs will appear here as their status changes." />;
  return (
    <>
      <div className="grid gap-3">
        {applications.map(application => {
          const isBusy = busyId === application.id;
          const timelinePay = applicationTimelinePay(application);
          const fixedPay = calculateJobPaymentBreakdown(Number(application.jobAmount ?? 0));
          const timelineUnitLabel = perDurationUnit(application.jobDurationUnit);
          const statusLabel = application.status === "completed" || application.jobStatus === "completed"
            ? "done"
            : isPayPerTimeline(application.jobPayType)
              ? `${timelineUnitLabel} payments: ${timelinePay.paidTimelineCount}/${timelinePay.timelineCount} paid`
            : application.status === "completion_requested"
              ? "waiting for client confirmation"
              : application.status === "payment_sent"
                ? "confirm payment received"
              : application.status.replace("_", " ");
          return (
            <div key={`${mode}-${application.id}`} className={`rounded-xl border border-[#d8d8d8] p-4 dark:border-[#3B3832] ${mode === "completed" ? "bg-emerald-50 dark:bg-emerald-400/10" : "bg-white dark:bg-[#2A2A2B]"}`}>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#959087]">{application.jobCategory ?? "Job category"}</p>
              <p className="mt-1 font-black text-[#111] dark:text-[#FFFBFF]">{application.jobTitle ?? "Job"}</p>
              <p className="mt-2 text-sm capitalize text-[#4b453e] dark:text-[#CCC6BB]">Status: {statusLabel}</p>
              {mode === "completed" && (
                <div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-100">
                  Completed Job ID: <span className="font-black">{completedJobId(application.id)}</span>
                </div>
              )}
              {mode === "requests" && (
                <div className="mt-3 rounded-xl border border-[#d8d8d8] bg-[#f3f4f5] p-3 text-sm text-[#4b453e] dark:border-bone/10 dark:bg-bone/[.04] dark:text-[#CCC6BB]">
                  <p><strong className="text-[#111] dark:text-[#FFFBFF]">Location:</strong> {directHireRequestLocationLabel(application)}</p>
                  <p><strong className="text-[#111] dark:text-[#FFFBFF]">Start:</strong> {application.requestStartDate ?? "Not provided"}</p>
                  <p><strong className="text-[#111] dark:text-[#FFFBFF]">Duration:</strong> {application.requestDuration ?? "Not provided"}</p>
                  <RequestPricingSummary application={application} />
                  {application.requestPricing ? (
                    <p><strong className="text-[#111] dark:text-[#FFFBFF]">You should receive:</strong> {kes(application.requestPricing.subtotal)}</p>
                  ) : application.jobAmount ? (
                    <>
                      <p><strong className="text-[#111] dark:text-[#FFFBFF]">You should receive:</strong> {kes(fixedPay.workerEarnings)}</p>
                    </>
                  ) : null}
                  {application.requestDescription ? <p className="mt-2">{application.requestDescription}</p> : null}
                </div>
              )}
              {mode === "completed" && application.clientRating && <p className="mt-2 inline-flex items-center gap-1 text-sm font-black text-amber-200"><Star size={16} /> Client rating: {application.clientRating}/5</p>}
              {isPayPerTimeline(application.jobPayType) && (
                <div className="mt-3 rounded-xl border border-[#d8d8d8] bg-[#f3f4f5] p-3 text-sm font-bold text-[#4b453e] dark:border-bone/10 dark:bg-bone/[.04] dark:text-[#CCC6BB]">
                  <p>Pay per {timelineUnitLabel}: {kes(timelinePay.workerPayPerTimeline)}</p>
                  <p className="mt-1">Paid worker amount: {kes(timelinePay.paidWorkerAmount)}</p>
                  <p className="mt-1">Remaining worker amount: {kes(timelinePay.remainingWorkerAmount)}</p>
                </div>
              )}
              {!isPayPerTimeline(application.jobPayType) && Number(application.jobAmount ?? 0) > 0 && ["accepted", "completion_requested", "payment_sent", "completed"].includes(application.status) && (
                <div className="mt-3 rounded-xl border border-[#d8d8d8] bg-[#f3f4f5] p-3 text-sm font-bold text-[#4b453e] dark:border-bone/10 dark:bg-bone/[.04] dark:text-[#CCC6BB]">
                  {application.status === "completed" ? (
                    <>
                      <p className="text-base font-black text-[#111] dark:text-[#FFFBFF]">Payment Received</p>
                      <p className="mt-1">You have been paid {kes(fixedPay.total)} for this job.</p>
                      <p className="mt-1">Your earnings: {kes(fixedPay.workerEarnings)}</p>
                      <p className="mt-1">COPIC service fee (10%): {kes(fixedPay.serviceFee)}</p>
                      <p className="mt-1 font-black text-[#111] dark:text-[#FFFBFF]">Amount Due: {kes(fixedPay.serviceFee)}</p>
                    </>
                  ) : (
                    <p className="text-base font-black text-[#111] dark:text-[#FFFBFF]">You should receive: {kes(fixedPay.workerEarnings)}</p>
                  )}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {mode === "live" && <Link href="/chat" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-bone px-4 py-2 text-sm font-black text-[#1E1B13]"><MessageCircle size={16} /> Chat with employer</Link>}
                {mode === "completed" && (
                  <Button type="button" variant="secondary" disabled={reportingId === application.id} onClick={() => void reportIssue(application)}>
                    {reportingId === application.id ? "Reporting..." : "Report issue"}
                  </Button>
                )}
                {mode === "requests" && application.status === "pending" && (
                  <>
                    <Button type="button" disabled={isBusy || workerHasLiveJob} onClick={() => void answerRequest(application, "accept")}>
                      {workerHasLiveJob ? "Live job active" : isBusy && busyAction === "accept_request" ? "Accepting..." : "Accept request"}
                    </Button>
                    <Button type="button" variant="secondary" disabled={isBusy} onClick={() => void answerRequest(application, "reject")}>
                      {isBusy && busyAction === "reject_request" ? "Rejecting..." : "Reject request"}
                    </Button>
                  </>
                )}
                {application.status === "pending" && mode !== "requests" && (
                  <Button type="button" variant="secondary" disabled={isBusy} onClick={() => setPendingCancel(application)}>
                    {isBusy && busyAction === "cancel" ? "Cancelling..." : "Cancel application"}
                  </Button>
                )}
                {application.status === "accepted" && application.jobStatus !== "completed" && (
                    <Button type="button" disabled={isBusy} onClick={() => setPendingComplete(application)}>
                    {isBusy && busyAction === "complete" ? "Sending..." : isPayPerTimeline(application.jobPayType) ? `Mark ${timelineUnitLabel} ${application.nextTimelineNumber ?? ""} complete` : "Mark complete"}
                  </Button>
                )}
                {mode === "live" && application.status === "accepted" && application.jobStatus !== "completed" && (
                  <Button type="button" variant="secondary" disabled={isBusy} onClick={() => setPendingLiveCancel(application)}>
                    {isBusy && busyAction === "cancel" ? "Cancelling..." : "Cancel live job"}
                  </Button>
                )}
                {application.status === "payment_sent" && application.jobStatus !== "completed" && (
                  <Button type="button" className="temp-success-button" disabled={isBusy} onClick={() => void confirmPayment(application)}>
                    {isBusy && busyAction === "confirm_payment" ? "Confirming..." : "I Received Payment"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {pendingCancel && (
        <AppModal title="Cancel application?" onClose={() => setPendingCancel(null)} maxWidth="max-w-md">
          <p className="text-sm text-[#CCC6BB]">Are you sure you want to cancel? You can only cancel twice per day.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setPendingCancel(null)}>Keep application</Button>
            <Button type="button" disabled={busyId === pendingCancel.id} onClick={() => {
              const application = pendingCancel;
              setPendingCancel(null);
              void cancel(application);
            }}>
              {busyId === pendingCancel.id ? "Cancelling..." : "Yes, cancel"}
            </Button>
          </div>
        </AppModal>
      )}
      {pendingLiveCancel && (
        <AppModal title="Cancel live job?" onClose={() => setPendingLiveCancel(null)} maxWidth="max-w-md">
          <p className="text-sm text-[#CCC6BB]">Are you sure you want to cancel this job? If you cancel after accepting, the job will be cancelled with no pay.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setPendingLiveCancel(null)}>Keep job</Button>
            <Button type="button" disabled={busyId === pendingLiveCancel.id} onClick={() => {
              const application = pendingLiveCancel;
              setPendingLiveCancel(null);
              void cancelLive(application);
            }}>
              {busyId === pendingLiveCancel.id ? "Cancelling..." : "Yes, cancel live job"}
            </Button>
          </div>
        </AppModal>
      )}
      {pendingComplete && (
        <AppModal title={isPayPerTimeline(pendingComplete.jobPayType) ? `Mark ${perDurationUnit(pendingComplete.jobDurationUnit)}s complete` : "Mark job complete"} onClose={() => setPendingComplete(null)} maxWidth="max-w-md">
          <p className="text-sm text-[#CCC6BB]">
            {isPayPerTimeline(pendingComplete.jobPayType)
              ? `Choose how many ${perDurationUnit(pendingComplete.jobDurationUnit)}s you finished. The client will pay only the submitted ${perDurationUnit(pendingComplete.jobDurationUnit)}s.`
              : "Send completion to the client for payment confirmation. You can rate the client now or leave the rating empty."}
          </p>
          {!isPayPerTimeline(pendingComplete.jobPayType) && Number(pendingComplete.jobAmount ?? 0) > 0 && (() => {
            const breakdown = calculateJobPaymentBreakdown(Number(pendingComplete.jobAmount ?? 0));
            return (
              <div className="mt-4 rounded-xl border border-bone/10 bg-bone/[.04] p-3 text-sm font-bold text-[#CCC6BB]">
                <p className="text-base font-black text-[#FFFBFF]">You should receive: {kes(breakdown.workerEarnings)}</p>
              </div>
            );
          })()}
          <form onSubmit={event => {
            event.preventDefault();
            const application = pendingComplete;
            const form = new FormData(event.currentTarget);
            const timelinePay = applicationTimelinePay(application);
            const submittedCount = Math.max(0, Number(application.submittedTimelineCount ?? 0));
            const maxTimelineCount = Math.max(1, timelinePay.timelineCount - timelinePay.paidTimelineCount - submittedCount);
            const timelineCount = isPayPerTimeline(application.jobPayType)
              ? Math.max(1, Math.min(maxTimelineCount, Math.trunc(Number(form.get("timelineCount")) || 1)))
              : undefined;
            setPendingComplete(null);
            void requestComplete(application, Number(form.get("stars") ?? 0), String(form.get("review") ?? ""), timelineCount);
          }} className="mt-5 grid gap-4">
            {isPayPerTimeline(pendingComplete.jobPayType) && (() => {
              const unit = perDurationUnit(pendingComplete.jobDurationUnit);
              const unitTitle = unit.charAt(0).toUpperCase() + unit.slice(1);
              const timelinePay = applicationTimelinePay(pendingComplete);
              const submittedCount = Math.max(0, Number(pendingComplete.submittedTimelineCount ?? 0));
              const maxTimelineCount = Math.max(1, timelinePay.timelineCount - timelinePay.paidTimelineCount - submittedCount);
              return (
                <>
                  <label className="temp-label">{unitTitle}s to mark complete
                    <input name="timelineCount" type="number" min={1} max={maxTimelineCount} defaultValue={1} className="temp-input mt-2 p-3 outline-none" />
                  </label>
                  <p className="text-xs font-bold text-[#CCC6BB]">Available now: {maxTimelineCount} of {timelinePay.timelineCount} {unit}s.</p>
                </>
              );
            })()}
            <StarRatingInput name="stars" label="Rate client optional" />
            <label className="temp-label">Review optional<textarea name="review" className="temp-input min-h-24 p-3 outline-none" placeholder="How was the client to work with?" /></label>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => setPendingComplete(null)}>Cancel</Button>
              <Button type="submit" disabled={busyId === pendingComplete.id}>{busyId === pendingComplete.id ? "Sending..." : "Submit completion"}</Button>
            </div>
          </form>
        </AppModal>
      )}
    </>
  );
}
