"use client";

import { useAuth } from "@/context/AuthContext";
import { useCallback, useEffect, useState } from "react";

const pending = new Map<string, Promise<unknown>>();
export async function authenticatedJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const key = `${token}:${url}`;
  const execute = async () => {
    const response = await fetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers, Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Unable to load data. Please try again.");
    return payload as T;
  };
  if (init?.method && init.method !== "GET") return execute();
  if (!pending.has(key)) pending.set(key, execute().finally(() => pending.delete(key)));
  return pending.get(key) as Promise<T>;
}

/** One in-flight read per account/URL; refresh only visible operational screens. */
export function useOperationalData<T>(url: string | null, interval = 30000) {
  const { user } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!url || !user) return;
    let stopped = false;
    let busy = false;
    const load = async () => {
      if (busy || document.hidden || !navigator.onLine) return;
      busy = true;
      try {
        const payload = await authenticatedJson<T>(url, await user.getIdToken());
        if (!stopped) { setData(payload); setError(""); }
      } catch (reason) {
        if (!stopped) setError(reason instanceof Error ? reason.message : "Unable to load data.");
      } finally { busy = false; }
    };
    void load();
    const timer = interval > 0 ? window.setInterval(load, interval) : undefined;
    window.addEventListener("online", load);
    document.addEventListener("visibilitychange", load);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("online", load); document.removeEventListener("visibilitychange", load); };
  }, [url, user, interval, revision]);
  return { data, error, refresh, loading: !data && !error };
}
