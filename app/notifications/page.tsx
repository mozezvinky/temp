"use client";

import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { demoNotifications } from "@/lib/demoData";

export default function NotificationsPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute();
  if (loading || !isAuthorized) return <LoadingSpinner label="Opening alerts" />;
  const roleAlerts = profile?.role === "client"
    ? [{ id: "client-accept", title: "Worker accepted", body: "A verified worker accepted your invitation." }, { id: "client-payment", title: "Payment update", body: "Your escrow wallet is ready for job completion." }]
    : [{ id: "worker-invite", title: "Job invitation", body: "You have a new job invitation in Cleaning." }, { id: "worker-chat", title: "Chat message", body: "A client sent you a new message." }];
  return <div className="space-y-3">{[...roleAlerts, ...demoNotifications].map(item => <Card key={item.id}><h2 className="font-black">{item.title}</h2><p className="mt-2 text-sm text-smoky/70">{item.body}</p></Card>)}</div>;
}
