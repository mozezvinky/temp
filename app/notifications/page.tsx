"use client";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import { AppModal } from "@/components/ui/AppModal";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { deleteNotification, markNotificationRead, setNotificationArchived, subscribeNotifications } from "@/services/notifications";
import { rateClient } from "@/services/ratings";
import type { AppNotification } from "@/types";
import { Archive, ArchiveRestore, Info, RefreshCw, Trash2, TriangleAlert, Zap } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

export default function NotificationsPage() {
  const { profile, loading: authLoading, isAuthorized } = useProtectedRoute();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingTarget, setRatingTarget] = useState<{ clientId: string; jobId: string } | null>(null);
  const [detailsItem, setDetailsItem] = useState<AppNotification | null>(null);
  const [savingRating, setSavingRating] = useState(false);
  const [archivedView, setArchivedView] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get("rateClient");
    const jobId = params.get("jobId");
    if (clientId && jobId) setRatingTarget({ clientId, jobId });
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthorized || !profile) return;
    return subscribeNotifications(
      profile.id,
      notifications => {
        setItems(notifications);
        setLoading(false);
      },
      () => {
        setItems([]);
        setLoading(false);
      },
      archivedView
    );
  }, [archivedView, authLoading, isAuthorized, profile]);

  useEffect(() => {
    if (archivedView || !items.length) return;
    const unreadIds = items.filter(item => !item.read).map(item => item.id);
    if (!unreadIds.length) return;
    unreadIds.forEach(id => void markNotificationRead(id).catch(() => undefined));
    setItems(current => current.map(item => unreadIds.includes(item.id) ? { ...item, read: true } : item));
  }, [archivedView, items]);

  if (authLoading || !isAuthorized || loading) return <LoadingSpinner label="Opening alerts" />;
  async function submitRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ratingTarget) return;
    const form = new FormData(event.currentTarget);
    const stars = Number(form.get("stars") ?? 0);
    if (!stars) {
      setRatingTarget(null);
      toast.success("Payment confirmed.");
      return;
    }
    setSavingRating(true);
    try {
      await rateClient(ratingTarget.jobId, ratingTarget.clientId, stars, String(form.get("review") ?? ""));
      toast.success("Client rating submitted.");
      setRatingTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save rating.");
    } finally {
      setSavingRating(false);
    }
  }

  async function toggleArchive(item: AppNotification) {
    try {
      await setNotificationArchived(item.id, !item.archived);
      setItems(current => current.filter(alert => alert.id !== item.id));
      toast.success(item.archived ? "Alert restored." : "Alert archived.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update this alert.");
    }
  }

  async function removeArchived(item: AppNotification) {
    try {
      await deleteNotification(item.id);
      setItems(current => current.filter(alert => alert.id !== item.id));
      toast.success("Archived alert deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete this alert.");
    }
  }

  function alertAction(item: AppNotification) {
    if (!item.href) return null;
    const title = item.title.toLowerCase();
    if (title.includes("completion requested")) return { href: "/completed-requests", label: "View completed requests" };
    if (title.includes("new application")) return { href: item.href, label: "Review application" };
    if (title.includes("payment sent")) return { href: item.href, label: "Confirm payment received" };
    if (title.includes("worker confirmed payment")) return { href: item.href, label: "View completed job" };
    if (title.includes("payment rejected") || title.includes("account action required")) return { href: item.href, label: "Open dashboard" };
    if (title.includes("verified") || title.includes("verification")) return { href: item.href, label: "Open profile" };
    return { href: item.href, label: "Open action" };
  }

  return (
    <div className="temp-alerts-page mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#959087]">Alerts</p><h1 className="mt-2 text-3xl font-semibold text-[#FFFBFF]">{archivedView ? "Archived alerts" : "Notifications"}</h1></div>
        <Button type="button" variant="secondary" onClick={() => setArchivedView(current => !current)}>{archivedView ? <ArchiveRestore size={17} /> : <Archive size={17} />}{archivedView ? "Back to alerts" : "Archives"}</Button>
      </div>
      {!items.length && !ratingTarget && <EmptyState title={archivedView ? "No archived alerts" : "No new alerts"} body={archivedView ? "Archived alerts remain here for one week." : "Jobs, messages, payments, and account updates will appear here."} />}
      <div className="temp-alert-list mt-8 grid gap-5 md:mt-12 md:gap-7">
      {items.map(item => {
        const clientPayment = profile?.role === "client" && item.title === "Payment received";
        const title = clientPayment ? "Payment sent" : item.title;
        const lower = title.toLowerCase();
        const tone = lower.includes("payment") || lower.includes("accepted") || lower.includes("complete") ? "success" : lower.includes("failed") || lower.includes("locked") ? "error" : lower.includes("pending") ? "warning" : "info";
        const Icon = tone === "success" ? RefreshCw : tone === "error" ? Zap : tone === "warning" ? TriangleAlert : Info;
        const content = (
          <>
            <h2 className="font-black">{title}</h2>
            <p className="temp-alert-body mt-2 text-sm text-[#CCC6BB]">{clientPayment ? "The client marked the direct worker payment as completed." : item.body}</p>
            {item.href && <button type="button" onClick={() => setDetailsItem(item)} className="temp-alert-details-button mt-3 text-sm font-black text-[#FFFBF4]">View details</button>}
          </>
        );
        return (
          <Card key={item.id} className={`temp-alert-card temp-alert-${tone} flex min-h-[116px] items-center gap-5`}>
            <span className={`temp-alert-icon ${tone === "success" ? "text-emerald-400" : tone === "error" ? "text-red-400" : tone === "warning" ? "text-amber-400" : "text-sky-400"}`}><Icon size={25} /></span>
            <div className="min-w-0 flex-1">{content}</div>
            <div className="temp-alert-actions flex shrink-0 items-center gap-2">
              {archivedView && <button type="button" onClick={() => void removeArchived(item)} className="grid h-10 w-10 place-items-center text-red-200 transition hover:text-red-100" aria-label="Delete archived alert"><Trash2 size={20} /></button>}
              <button type="button" onClick={() => void toggleArchive(item)} className="grid h-10 w-10 place-items-center text-[#959087] transition hover:text-[#FFFBFF]" aria-label={item.archived ? "Restore alert" : "Archive alert"}>{item.archived ? <ArchiveRestore size={20} /> : <Archive size={20} />}</button>
            </div>
          </Card>
        );
      })}
      </div>
      {ratingTarget && profile?.role === "worker" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <Card className="w-full max-w-md">
            <h2 className="text-2xl font-black text-[#FFFBFF]">Payment received</h2>
            <p className="mt-2 text-sm text-[#CCC6BB]">Your payment was recorded. You can rate the client now or skip it.</p>
            <form onSubmit={submitRating} className="mt-5 grid gap-4">
              <StarRatingInput name="stars" label="Rate client optional" />
              <label className="temp-label">Remarks optional<textarea name="review" className="temp-input min-h-24 p-3 outline-none" placeholder="Share a short note" /></label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setRatingTarget(null)}>Later</Button>
                <Button type="submit" disabled={savingRating}>{savingRating ? "Submitting..." : "Submit rating"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
      {detailsItem && (
        <AppModal eyebrow="Notification details" title={detailsItem.title} onClose={() => setDetailsItem(null)} maxWidth="max-w-lg">
          <div className="grid gap-4 text-sm text-[#CCC6BB]">
            <p>{detailsItem.body}</p>
            <div className="flex flex-wrap gap-3">
              {alertAction(detailsItem) && (
                <Link
                  href={alertAction(detailsItem)!.href}
                  onClick={() => setDetailsItem(null)}
                  className="temp-success-button inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-black"
                >
                  {alertAction(detailsItem)!.label}
                </Link>
              )}
              <Button type="button" variant={alertAction(detailsItem) ? "secondary" : "primary"} onClick={() => setDetailsItem(null)}>Close</Button>
            </div>
          </div>
        </AppModal>
      )}
    </div>
  );
}
