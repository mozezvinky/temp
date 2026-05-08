"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaBootstrap() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt) return null;
  return (
    <button
      aria-label="Install Temp"
      onClick={async () => {
        await prompt.prompt();
        setPrompt(null);
      }}
      className="fixed bottom-24 right-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-bone text-smoky shadow-soft md:bottom-6"
    >
      <Download size={20} />
    </button>
  );
}
