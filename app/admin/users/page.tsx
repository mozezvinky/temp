"use client";

import { AppModal } from "@/components/ui/AppModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import type { Application, Job, UserProfile } from "@/types";
import { jobLocationLabel } from "@/utils/location-display";
import { normalizeVerificationStatus, verificationLabel } from "@/utils/verification";
import { Search } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type UserActionPanel = "profile" | "role" | "moderate" | "auth";

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [details, setDetails] = useState<{ user: UserProfile; applications: Application[]; jobs: Job[] } | null>(null);
  const [actionOpen, setActionOpen] = useState<UserActionPanel | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      query.set("role", "non-admin");
      const response = await fetch(`/api/admin/users?${query}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load users.");
      setUsers((payload.users ?? []).map((item: UserProfile) => ({ ...item, verificationStatus: normalizeVerificationStatus(item.verificationStatus) })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [search, user]);

  async function submitAdminAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !selectedUser || !actionOpen) return;
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form.entries()) as Record<string, string>;
    if (!data.reason?.trim()) {
      toast.error("Add a reason so this action has an audit trail.");
      return;
    }

    if (data.action === "update_user_profile") {
      data.patch = JSON.stringify({
        displayName: data.displayName?.trim() ?? "",
        email: data.email?.trim() ?? "",
        phoneNumber: data.phoneNumber?.trim() ?? "",
        verificationStatus: data.verificationStatus,
        outstandingServiceFee: Number(data.outstandingServiceFee ?? 0),
        completedJobs: Number(data.completedJobs ?? 0),
        bio: data.bio?.trim() ?? ""
      });
      for (const key of ["displayName", "email", "phoneNumber", "verificationStatus", "outstandingServiceFee", "completedJobs", "bio"]) delete data[key];
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({
          ...data,
          patch: data.patch ? JSON.parse(data.patch) : undefined,
          userId: selectedUser.id
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to complete admin action.");
      toast.success("Admin action completed.");
      setActionOpen(null);
      setSelectedUser(null);
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to complete admin action.");
    } finally {
      setSubmitting(false);
    }
  }

  function openAction(target: UserProfile, panel: UserActionPanel) {
    setSelectedUser(target);
    setActionOpen(panel);
  }

  async function openDetails(target: UserProfile) {
    if (!user) return;
    try {
      const response = await fetch(`/api/admin/users?userId=${encodeURIComponent(target.id)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load user details.");
      setDetails(payload as { user: UserProfile; applications: Application[]; jobs: Job[] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load user details.");
    }
  }

  useEffect(() => {
    if (!user) return;
    const handle = window.setTimeout(() => void loadUsers(), 250);
    return () => window.clearTimeout(handle);
  }, [loadUsers, user]);

  const detailSkills = parseSkillProfiles(details?.user.skillProfiles);

  if (loading && !users.length) return <LoadingSpinner label="Loading users" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black">Users</h1>
        <label className="temp-input flex min-h-11 min-w-72 items-center gap-2 rounded-xl px-3"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search users" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
      </div>
      {users.length ? users.map(item => (
        <Card key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-black">{item.displayName}</h2>
              <p className="mt-2 text-sm text-[#CCC6BB]">{item.email ?? "No email"} - {item.phoneNumber ?? "No phone"}</p>
              <p className="mt-1 text-sm capitalize text-[#959087]">{item.role} - {verificationLabel(item.verificationStatus)}</p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{item.isLocked ? "Suspended" : "Active"}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void openDetails(item)}>View everything</Button>
            <Button type="button" variant="secondary" onClick={() => openAction(item, "profile")}>Edit profile</Button>
            <Button type="button" variant="secondary" onClick={() => openAction(item, "role")}>Update role</Button>
            <Button type="button" variant={item.isLocked ? "secondary" : "danger"} onClick={() => openAction(item, "moderate")}>{item.isLocked ? "Unsuspend" : "Suspend"}</Button>
            <Button type="button" variant="secondary" onClick={() => openAction(item, "auth")}>Auth security</Button>
          </div>
        </Card>
      )) : <EmptyState title="No users found" body="Try another search term." />}
      {selectedUser && actionOpen && (
        <AppModal title={`${actionTitle(actionOpen)}: ${selectedUser.displayName}`} eyebrow="Controlled admin action" onClose={() => setActionOpen(null)}>
          <form onSubmit={submitAdminAction} className="space-y-4">
            {actionOpen === "profile" && <ProfileActionFields userProfile={selectedUser} />}
            {actionOpen === "role" && <RoleActionFields userProfile={selectedUser} />}
            {actionOpen === "moderate" && <ModerationActionFields userProfile={selectedUser} />}
            {actionOpen === "auth" && <AuthActionFields />}
            <label className="block text-sm font-bold text-[#CCC6BB]">
              Reason
              <textarea name="reason" required className="temp-input mt-1 min-h-24 w-full rounded-xl px-3 py-2" placeholder="Explain why this action is needed." />
            </label>
            <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              This action is validated on the server and written to the admin audit log. Worker service-fee payments are reviewed from the Service Fees admin section.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setActionOpen(null)} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Working..." : "Confirm action"}</Button>
            </div>
          </form>
        </AppModal>
      )}
      {details && (
        <AppModal title={details.user.displayName} eyebrow="Full account view" onClose={() => setDetails(null)} maxWidth="max-w-4xl">
          <div className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="job-info-box rounded-xl p-4"><p className="text-xs text-[#959087]">Role</p><p className="mt-1 font-black capitalize">{details.user.role}</p></div>
              <div className="job-info-box rounded-xl p-4"><p className="text-xs text-[#959087]">Status</p><p className="mt-1 font-black">{details.user.isLocked ? "Suspended" : "Active"}</p></div>
              <div className="job-info-box rounded-xl p-4"><p className="text-xs text-[#959087]">Rating</p><p className="mt-1 font-black">{details.user.ratingAverage ?? 0} ({details.user.ratingCount ?? 0})</p></div>
              <div className="job-info-box rounded-xl p-4"><p className="text-xs text-[#959087]">Service fee</p><p className="mt-1 font-black">{details.user.outstandingServiceFee ?? 0}</p></div>
            </div>
            <section>
              <h3 className="text-xl font-black text-[#FFFBFF]">Worker skills</h3>
              <div className="mt-3 grid gap-2">
                {detailSkills.length ? detailSkills.map(skill => (
                  <div key={skill.id} className="rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-3 text-sm text-[#CCC6BB]">
                    <strong className="text-[#FFFBFF]">{skill.name}</strong> - {skill.chargeAmount ? `Ksh ${skill.chargeAmount}` : "Rate not set"} - {skill.completedJobs} completed - {skill.ratingAverage} rating
                  </div>
                )) : <p className="text-sm text-[#959087]">No worker skills saved.</p>}
              </div>
            </section>
            <section>
              <h3 className="text-xl font-black text-[#FFFBFF]">Posted jobs</h3>
              <div className="mt-3 grid gap-2">
                {details.jobs.length ? details.jobs.map(job => <div key={job.id} className="rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-3 text-sm text-[#CCC6BB]"><strong className="text-[#FFFBFF]">{job.title}</strong> - {job.status} - {jobLocationLabel(job)}</div>) : <p className="text-sm text-[#959087]">No posted jobs.</p>}
              </div>
            </section>
            <section>
              <h3 className="text-xl font-black text-[#FFFBFF]">Applications and live jobs</h3>
              <div className="mt-3 grid gap-2">
                {details.applications.length ? details.applications.map(application => (
                  <div key={application.id} className="rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-3 text-sm text-[#CCC6BB]">
                    <strong className="text-[#FFFBFF]">{application.jobTitle ?? application.jobId}</strong> - {application.status} - worker {application.workerName ?? application.workerId}
                  </div>
                )) : <p className="text-sm text-[#959087]">No applications or live jobs.</p>}
              </div>
            </section>
          </div>
        </AppModal>
      )}
    </div>
  );
}

function parseSkillProfiles(value: UserProfile["skillProfiles"] | unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as NonNullable<UserProfile["skillProfiles"]> : [];
    } catch {
      return [];
    }
  }
  return [];
}

function actionTitle(action: UserActionPanel) {
  const titles: Record<UserActionPanel, string> = {
    profile: "Edit profile",
    role: "Update role",
    moderate: "Moderation",
    auth: "Auth security"
  };
  return titles[action];
}

function ProfileActionFields({ userProfile }: { userProfile: UserProfile }) {
  return (
    <>
      <input type="hidden" name="action" value="update_user_profile" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#CCC6BB]">Display name<input name="displayName" defaultValue={userProfile.displayName} required className="temp-input mt-1 h-11 w-full rounded-xl px-3" /></label>
        <label className="block text-sm font-bold text-[#CCC6BB]">Email<input name="email" defaultValue={userProfile.email ?? ""} className="temp-input mt-1 h-11 w-full rounded-xl px-3" /></label>
        <label className="block text-sm font-bold text-[#CCC6BB]">Phone<input name="phoneNumber" defaultValue={userProfile.phoneNumber ?? ""} className="temp-input mt-1 h-11 w-full rounded-xl px-3" /></label>
        <label className="block text-sm font-bold text-[#CCC6BB]">Verification<select name="verificationStatus" defaultValue={userProfile.verificationStatus} className="temp-input mt-1 h-11 w-full rounded-xl px-3"><option value="not_submitted">Not submitted</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
        <label className="block text-sm font-bold text-[#CCC6BB]">Outstanding service fee<input name="outstandingServiceFee" type="number" defaultValue={userProfile.outstandingServiceFee ?? 0} className="temp-input mt-1 h-11 w-full rounded-xl px-3" /></label>
        <label className="block text-sm font-bold text-[#CCC6BB]">Completed jobs<input name="completedJobs" type="number" defaultValue={userProfile.completedJobs ?? 0} className="temp-input mt-1 h-11 w-full rounded-xl px-3" /></label>
        <label className="block text-sm font-bold text-[#CCC6BB] sm:col-span-2">Bio<textarea name="bio" defaultValue={userProfile.bio ?? ""} className="temp-input mt-1 min-h-20 w-full rounded-xl px-3 py-2" /></label>
      </div>
    </>
  );
}

function RoleActionFields({ userProfile }: { userProfile: UserProfile }) {
  return (
    <>
      <input type="hidden" name="action" value="update_user_role" />
      <label className="block text-sm font-bold text-[#CCC6BB]">
        Role
        <select name="role" defaultValue={userProfile.role} className="temp-input mt-1 h-11 w-full rounded-xl px-3">
          <option value="worker">Worker</option>
          <option value="client">Client</option>
        </select>
      </label>
    </>
  );
}

function ModerationActionFields({ userProfile }: { userProfile: UserProfile }) {
  return (
    <label className="block text-sm font-bold text-[#CCC6BB]">
      Moderation action
      <select name="action" defaultValue={userProfile.isLocked ? "unsuspend_user" : "suspend_user"} className="temp-input mt-1 h-11 w-full rounded-xl px-3">
        <option value="suspend_user">Suspend account</option>
        <option value="unsuspend_user">Unsuspend account</option>
      </select>
    </label>
  );
}

function AuthActionFields() {
  return (
    <label className="block text-sm font-bold text-[#CCC6BB]">
      Security action
      <select name="action" defaultValue="reset_password_email" className="temp-input mt-1 h-11 w-full rounded-xl px-3">
        <option value="reset_password_email">Send secure password reset email</option>
        <option value="resend_verification_email">Resend verification notice</option>
        <option value="force_logout">Force logout user sessions</option>
      </select>
    </label>
  );
}
