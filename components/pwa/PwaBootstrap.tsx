"use client";

import { Download, Plus, Share2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaBootstrap() {
  const { profile } = useAuth();
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const isInstalled = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const userAgent = navigator.userAgent.toLowerCase();
    let lostConnection = !navigator.onLine;
    setInstalled(isInstalled);
    setIsMobile(mobileQuery.matches);
    setIsIos(/iphone|ipad|ipod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const syncMobile = () => setIsMobile(mobileQuery.matches);
    mobileQuery.addEventListener("change", syncMobile);
    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const onOffline = () => {
      lostConnection = true;
    };
    const onOnline = () => {
      if (!lostConnection) return;
      lostConnection = false;
      window.location.reload();
    };
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      mobileQuery.removeEventListener("change", syncMobile);
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (installed || profile?.role === "admin" || (!prompt && !isMobile)) return null;

  const label = prompt ? "Add to Home Screen" : "Install Copic";

  return (
    <>
      <button
        aria-label={label}
        onClick={async () => {
          if (!prompt) {
            setShowGuide(true);
            return;
          }
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice.outcome === "accepted") setPrompt(null);
        }}
        className="copic-install-button fixed bottom-5 right-4 z-50 inline-flex items-center gap-2 rounded-xl bg-bone px-4 py-3 text-sm font-black text-smoky shadow-soft md:bottom-6 md:right-6"
      >
        <Download size={18} /> {label}
      </button>
      {showGuide && (
        <div className="copic-install-guide" role="dialog" aria-modal="true" aria-label="Install Copic">
          <div className="copic-install-guide-card">
            <button type="button" className="copic-install-guide-close" aria-label="Close install help" onClick={() => setShowGuide(false)}>
              <X size={18} aria-hidden="true" />
            </button>
            <h2>Install Copic</h2>
            <ol>
              <li><Share2 size={16} aria-hidden="true" /> Tap {isIos ? "Share" : "the browser menu"}.</li>
              <li><Plus size={16} aria-hidden="true" /> Choose Add to Home Screen.</li>
              <li><Download size={16} aria-hidden="true" /> Confirm Copic.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
