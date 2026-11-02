"use client";

import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { ReactNode } from "react";

export function AppModal({ title, eyebrow, onClose, children, maxWidth = "max-w-2xl" }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; maxWidth?: string }) {
  const dialogRef = useDialogFocus<HTMLElement>(true, onClose);

  return (
    <div className="temp-modal-backdrop fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/80 p-4">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`copic-modal copic-app-modal no-visible-scrollbar flex w-full ${maxWidth} flex-col`}>
        <div className="copic-modal-header">
          <div>
            {eyebrow && <p className="text-sm font-bold uppercase tracking-[.2em] text-[#959087]">{eyebrow}</p>}
            <h2 className="mt-1 text-2xl font-black text-[#FFFBFF]">{title}</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="shrink-0 rounded-full" aria-label="Close popup">
            <X size={18} />
          </Button>
        </div>
        <div className="copic-modal-body no-visible-scrollbar flex-1">
          {children}
        </div>
      </section>
    </div>
  );
}
