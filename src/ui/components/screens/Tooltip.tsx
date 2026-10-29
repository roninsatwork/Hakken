"use client";

import { cloneElement, useId, useState, type ReactElement } from "react";
import { LAYER } from "@/src/ui/lib/layers";

/**
 * A tooltip the app draws itself: what a control is, shown above it while
 * the mouse rests on it or it has keyboard focus, and named to a screen
 * reader through `aria-describedby`. Chosen for the eye in the header on
 * 2026-10-29 (sees-header-and-rolling-dates-plan.md, part one; Anthony: "we
 * need a hover state for the what it is"); until then the app's icon buttons
 * used the browser's own `title`, which looks different in every browser.
 *
 * Wrap one control: `<Tooltip label="…"><Button … /></Tooltip>`. The child
 * keeps its own `aria-label`; the tooltip adds the description. Escape hides
 * it while the control keeps focus.
 */
export function Tooltip({ label, children, shown: shownAtFirst = false, className = "relative inline-flex" }: { label: string; children: ReactElement<{ "aria-describedby"?: string }>; /** Shown from the start: the drawing kit's example. */ shown?: boolean; /** The wrapper's layout classes, for a wrapped part that must shrink or fill: never a colour. */ className?: string }) {
  const id = useId();
  const [shown, setShown] = useState(shownAtFirst);
  return (
    <span
      className={className}
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setShown(false);
      }}
    >
      {cloneElement(children, { "aria-describedby": shown ? id : undefined })}
      {shown ? (
        <span
          role="tooltip"
          id={id}
          data-part="tooltip"
          className={`pointer-events-none absolute left-1/2 -top-2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[12px] border border-border-dim bg-card px-3 py-2 text-[12px] font-normal tracking-normal text-foreground shadow-lg ${LAYER.RAISED}`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
