"use client";

import React, { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/src/ui/lib/utils";
import { LAYER } from "@/src/ui/lib/layers";

interface HakkenModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

/** Everything a keyboard can land on inside the dialog. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function HakkenModal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  className,
  size = 'md'
}: HakkenModalProps) {
  const t = useTranslations("ui.modal");
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  /**
   * `onClose` held in a ref so the focus effect below does not depend on it.
   *
   * Nearly every caller passes an inline arrow — `onClose={() => setOpen(false)}`
   * — which is a new function on every render. With `onClose` in that effect's
   * dependencies, every keystroke in a modal form re-rendered the parent, tore
   * the effect down (restoring focus to whatever opened the dialog) and set it
   * up again (focusing the first field). The result was a form you could only
   * type one character into at a time, on every modal in the app (Anthony,
   * 2026-08-20). The effect belongs to opening and closing, not to re-rendering.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  /**
   * The three things a dialog owes a keyboard.
   *
   * This is the app's only modal, used for delete confirmations, the agent
   * editor and everything between, and it had none of them: Escape did
   * nothing, Tab walked out of the dialog into the page behind it, and a
   * screen reader was never told a dialog had opened. One fix here reaches
   * every screen that uses it.
   */
  useEffect(() => {
    if (!isOpen) return;

    returnFocusTo.current = document.activeElement as HTMLElement | null;

    const focusFirst = setTimeout(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? dialogRef.current)?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Wrap at both ends, so focus cannot walk out into the page behind.
      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      clearTimeout(focusFirst);
      document.removeEventListener("keydown", handleKeyDown, true);
      // Back where they were, so closing does not dump focus at the top of
      // the page.
      returnFocusTo.current?.focus?.();
    };
    // `isOpen` alone: see the note on `onCloseRef` above.
  }, [isOpen]);

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className={`fixed inset-0 ${LAYER.OVERLAY} flex items-center justify-center p-6`}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
            className="absolute inset-0 bg-black/60 backdrop-blur-[12px]"
          />

          {/* Dialog Body */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            {...(title ? { "aria-labelledby": titleId } : {})}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.9, y: 30, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.9, y: 30, filter: "blur(10px)" }}
            transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
            className={cn(
              "relative w-full bg-sidebar/40 backdrop-blur-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-[32px] overflow-hidden flex flex-col",
              sizeClasses[size],
              className
            )}
          >
            {/* Atmospheric Inner Glow (Top Left) */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[32px]">
              <div className="absolute -top-[150px] -left-[150px] w-[300px] h-[300px] bg-white/5 blur-[80px] rounded-full" />
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50" />
            </div>

            {/* Close Button - Floating Tactical Circle. Raw on purpose: a
                bordered glass circle that grows on hover — not the flat
                `icon` recipe. */}
            <button
              onClick={onClose}
              aria-label={t("close")}
              // z-20, or the z-10 header strip sits over this corner and
              // swallows every click meant for the X (Anthony, 2026-08-17:
              // "none of the modals close on the X").
              className="absolute top-6 right-6 z-20 text-muted hover:text-foreground transition-all p-2 rounded-full border border-white/5 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:scale-110 active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Content */}
            <div className="px-6 sm:px-10 pt-12 pb-6 flex flex-col gap-2 relative z-10">
              {title && (
                <h2 id={titleId} className="text-2xl font-light text-foreground tracking-[0.12em] uppercase opacity-90">
                  {title}
                </h2>
              )}
            </div>

            {/* Content Body */}
            <div className="px-6 sm:px-10 pb-10 overflow-y-auto max-h-[85vh] custom-scrollbar relative z-10">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;

  return createPortal(modalContent, document.body);
}
