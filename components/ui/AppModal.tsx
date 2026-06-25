"use client";

import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";

export function AppModal({ title, eyebrow, onClose, children, maxWidth = "max-w-2xl" }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; maxWidth?: string }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="temp-modal-backdrop fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/80 p-4">
      <section role="dialog" aria-modal="true" aria-label={title} className={`copic-modal no-visible-scrollbar flex max-h-[88vh] w-full ${maxWidth} flex-col overflow-y-auto`}>
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-5 pt-6 md:px-8 md:pt-8">
          <div>
            {eyebrow && <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">{eyebrow}</p>}
            <h2 className="mt-1 text-2xl font-black text-[#FFFBFF]">{title}</h2>
          </div>
          <Button type="button" variant="ghost" onClick={onClose} className="shrink-0 rounded-full px-3" aria-label="Close popup">
            <X size={18} />
          </Button>
        </div>
        <div className="no-visible-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-6 md:px-8 md:pb-8">
          {children}
        </div>
      </section>
    </div>
  );
}
