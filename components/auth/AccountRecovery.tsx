"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { logout } from "@/services/auth";
import { Button } from "@/components/ui/Button";

export function AccountRecovery({ signOutOnly = false }: { signOutOnly?: boolean }) {
  const { profileError, resolveProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="mx-auto max-w-lg space-y-4 p-4">
    {!signOutOnly && <><p role="alert">{profileError || "Unable to load your account."}</p><Button disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await resolveProfile(); } catch { setError("Unable to load your account. Please try again."); } finally { setBusy(false); }
    }}>{busy ? "Loading…" : "Try again"}</Button></>}
    {error && <p role="alert" className="copic-error">{error}</p>}
    <Button variant="ghost" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await logout(); window.location.replace("/auth/login"); } catch { setError("Unable to sign out. Please try again."); setBusy(false); }
    }}>Sign Out / Use Another Account</Button>
  </div>;
}
