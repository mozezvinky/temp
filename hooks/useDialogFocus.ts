"use client";
import { useEffect, useRef } from "react";

const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
let openDialogs = 0;
let previousBodyOverflow = "";

/** Shared keyboard containment, scroll locking and focus restoration for dialogs. */
export function useDialogFocus<T extends HTMLElement>(enabled: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const dialog = ref.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openDialogs++ === 0) { previousBodyOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    const visibleControls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => element.getClientRects().length > 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]'));
    const frame = requestAnimationFrame(() => (visibleControls()[0] ?? dialog).focus());
    const keydown = (event: KeyboardEvent) => {
      // A nested modal owns keyboard input until it is dismissed.
      const activeDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(element => element.getClientRects().length > 0);
      if (activeDialogs.length && activeDialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const controls = visibleControls(), first = controls[0], last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown);
      if (--openDialogs === 0) document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [enabled]);
  return ref;
}
