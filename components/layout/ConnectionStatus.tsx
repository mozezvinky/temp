"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ConnectionStatus() {
  const router = useRouter();
  const [state, setState] = useState<"online" | "offline" | "restored">("online");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const offline = () => { clearTimeout(timer); setState("offline"); };
    const online = () => {
      setState("restored");
      router.refresh(); // Retains client component state and form inputs.
      clearTimeout(timer);
      timer = setTimeout(() => setState("online"), 4000);
    };
    if (!navigator.onLine) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => { clearTimeout(timer); window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [router]);
  if (state === "online") return null;
  return <div role="status" aria-live="polite" className="copic-connection-banner">{state === "offline" ? "You're offline. Trying to reconnect…" : "Connection restored."}</div>;
}
