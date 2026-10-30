"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { LAYER } from "@/src/ui/lib/layers";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "./Button";

/**
 * A panel that slides over the right of any page, the page dimmed behind it (Anthony, 2026-10-31: "Are you making
 * the slide out as a core component we can reuse" — yes). A head with the title and a close button; a body that
 * scrolls; an optional foot fixed at the bottom. Escape, the close button or a click on the page behind closes it.
 * 480 pixels wide, the whole screen on a phone. Drawn first on the canvas "Conversions page, four ways", board
 * "Panel" (docs/plans/active/sees-side-panel-plan-2026-10-31.md); the eye's panel (`SeesPanel`) is the first to
 * use it. It never decides what goes inside: that is the caller's.
 */
export function SidePanel({ open, onClose, title, icon, children, foot, id, labelledBy }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  /** What stays at the bottom while the body scrolls: a box to type in, a save button. */
  foot?: ReactNode;
  id?: string;
  labelledBy?: string;
}) {
  const t = useTranslations("ui.sidePanel");
  const panel = useRef<HTMLDivElement>(null);
  const ownId = useId();
  useEffect(() => {
    if (!open) return;
    const escaped = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escaped);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", escaped);
  }, [open, onClose]);
  // Drawn into the page's body, so no header or blurred bar can trap it under its own layer (src/ui/lib/layers.ts). It
  // opens only after a click, so the server never draws it.
  if (!open || typeof document === "undefined") return null;
  const host = document.body;
  const titleId = labelledBy ?? `${id ?? ownId}-title`;
  return createPortal(
    <>
      <div data-part="side-panel-scrim" aria-hidden="true" className={cn("fixed inset-0 bg-background/50", LAYER.OVERLAY)} onMouseDown={onClose} />
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-part="side-panel"
        className={cn("fixed inset-y-0 right-0 flex w-full flex-col border-l border-border-dim bg-sidebar shadow-2xl outline-none sm:w-[480px] animate-[side-panel-in_200ms_ease-out] motion-reduce:animate-none", LAYER.OVERLAY)}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border-dim px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            <span id={titleId} className="truncate text-[15px] font-medium text-foreground">{title}</span>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label={t("close")} title={t("close")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] p-0 text-secondary hover:bg-hover hover:text-foreground">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {foot ? <div className="border-t border-border-dim px-6 py-4">{foot}</div> : null}
      </div>
    </>,
    host,
  );
}
