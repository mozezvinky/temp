"use client";

import { AppModal } from "@/components/ui/AppModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/context/AuthContext";
import type { AdminPermission, AdminRole, Application, Job, UserProfile } from "@/types";
import { Search, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type AdminActionPanel = "profile" | "auth";

export default function AdminsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedAdmin, setSelectedAdmin] = useState<UserProfile | null>(null);
  const [details, setDetails] = useState<{ user: UserProfile; applications: Application[]; jobs: Job[] } | null>(null);
  const [actionOpen, setActionOpen] = useState<AdminActionPanel | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAdmins = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const query = new URLSearchParams({ role: "admin" });
      if (search.trim()) query.set("search", search.trim());
      const response = await fetch(`/api/admin/users?${query}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load admins.");
      setAdmins(payload.users ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load admins.");
    } finally {
      setLoading(false);
    }
  }, [search, user]);

  useEffect(() => {
    if (!user) return;
    const handle = window.setTimeout(() => void loadAdmins(), 250);
    return () => window.clearTimeout(handle);
  }, [loadAdmins, user]);

  async function openDetails(target: UserProfile) {
    if (!user) return;
    try {
      const response = await fetch(`/api/admin/users?userId=${encodeURIComponent(target.id)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load admin details.");
      setDetails(payload as { user: UserProfile; applications: Application[]; jobs: Job[] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load admin details.");
    }
  }

  async function submitAdminAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !selectedAdmin || !actionOpen) return;
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
        bio: data.bio?.trim() ?? ""
      });
      for (const key of ["displayName", "email", "phoneNumber", "bio"]) delete data[key];
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ ...data, patch: data.patch ? JSON.parse(data.patch) : undefined, userId: selectedAdmin.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to complete admin action.");
      toast.success("Admin action completed.");
      setActionOpen(null);
      setSelectedAdmin(null);
      await loadAdmins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to complete admin action.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !admins.length) return <LoadingSpinner label="Loading admins" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">Admin control</p>
          <h1 className="mt-1 text-3xl font-black">Admins</h1>
        </div>
        <label className="temp-input flex min-h-11 min-w-72 items-center gap-2 rounded-xl px-3"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search admins" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
      </div>
      {admins.length ? admins.map(item => (
        <Card key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck size={18} />
                <h2 className="font-black">{item.displayName}</h2>
              </div>
              <p className="mt-2 text-sm text-[#CCC6BB]">{item.email ?? "No email"} - {item.phoneNumber ?? "No phone"}</p>
              <p className="mt-1 text-sm text-[#959087]">{adminRoleLabel(item.adminRole)} - {permissionSummary(item.adminPermissions)}</p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{item.isLocked ? "Suspended" : "Active"}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void openDetails(item)}>View admin</Button>
            <Button type="button" variant="secondary" onClick={() => { setSelectedAdmin(item); setActionOpen("profile"); }}>Edit profile</Button>
            <Button type="button" variant="secondary" onClick={() => { setSelectedAdmin(item); setActionOpen("auth"); }}>Auth security</Button>
          </div>
        </Card>
      )) : <EmptyState title="No admins found" body="Admin accounts will appear here separately from normal users." />}

      {selectedAdmin && actionOpen && (
        <AppModal title={`${actionOpen === "profile" ? "Edit admin" : "Admin security"}: ${selectedAdmin.displayName}`} eyebrow="Controlled admin action" onClose={() => setActionOpen(null)}>
          <form onSubmit={submitAdminAction} className="space-y-4">
            {actionOpen === "profile" ? <AdminProfileFields admin={selectedAdmin} /> : <AdminAuthFields />}
            <label className="block text-sm font-bold text-[#CCC6BB]">
              Reason
              <textarea name="reason" required className="temp-input mt-1 min-h-24 w-full rounded-xl px-3 py-2" placeholder="Explain why this admin action is needed." />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setActionOpen(null)} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Working..." : "Confirm action"}</Button>
            </div>
          </form>
        </AppModal>
      )}

      {details && (
        <AppModal title={details.user.displayName} eyebrow="Admin account details" onClose={() => setDetails(null)} maxWidth="max-w-3xl">
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="job-info-box rounded-xl p-4"><p className="text-xs text-[#959087]">Admin role</p><p className="mt-1 font-black">{adminRoleLabel(details.user.adminRole)}</p></div>
              <div className="job-info-box rounded-xl p-4"><p className="text-xs text-[#959087]">Status</p><p className="mt-1 font-black">{details.user.isLocked ? "Suspended" : "Active"}</p></div>
              <div className="job-info-box rounded-xl p-4"><p className="text-xs text-[#959087]">Permissions</p><p className="mt-1 font-black">{details.user.adminPermissions?.length ?? 0}</p></div>
            </div>
            <section>
              <h3 className="text-xl font-black text-[#FFFBFF]">Permissions</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {(details.user.adminPermissions?.length ? details.user.adminPermissions : ["Role default permissions"]).map(permission => <span key={permission} className="design-chip px-3 py-2">{permission}</span>)}
              </div>
            </section>
          </div>
        </AppModal>
      )}
    </div>
  );
}

function AdminProfileFields({ admin }: { admin: UserProfile }) {
  return (
    <>
      <input type="hidden" name="action" value="update_user_profile" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-bold text-[#CCC6BB]">Display name<input name="displayName" defaultValue={admin.displayName} required className="temp-input mt-1 h-11 w-full rounded-xl px-3" /></label>
        <label className="block text-sm font-bold text-[#CCC6BB]">Email<input name="email" defaultValue={admin.email ?? ""} className="temp-input mt-1 h-11 w-full rounded-xl px-3" /></label>
        <label className="block text-sm font-bold text-[#CCC6BB]">Phone<input name="phoneNumber" defaultValue={admin.phoneNumber ?? ""} className="temp-input mt-1 h-11 w-full rounded-xl px-3" /></label>
        <label className="block text-sm font-bold text-[#CCC6BB] sm:col-span-2">Bio<textarea name="bio" defaultValue={admin.bio ?? ""} className="temp-input mt-1 min-h-20 w-full rounded-xl px-3 py-2" /></label>
      </div>
    </>
  );
}

function AdminAuthFields() {
  return (
    <label className="block text-sm font-bold text-[#CCC6BB]">
      Security action
      <select name="action" defaultValue="force_logout" className="temp-input mt-1 h-11 w-full rounded-xl px-3">
        <option value="force_logout">Force logout admin sessions</option>
        <option value="reset_password_email">Send secure password reset email</option>
        <option value="resend_verification_email">Resend verification notice</option>
      </select>
    </label>
  );
}

function adminRoleLabel(role?: AdminRole) {
  return (role ?? "admin").replace("_", " ");
}

function permissionSummary(permissions?: AdminPermission[]) {
  if (!permissions?.length) return "Default permissions";
  if (permissions.length === 1) return permissions[0];
  return `${permissions.length} explicit permissions`;
}
