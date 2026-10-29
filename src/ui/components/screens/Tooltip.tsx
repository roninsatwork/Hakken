"use client";

import { cloneElement, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
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
 *
 * It stays on screen (Anthony, 2026-10-29, a square at the map's right edge:
 * "it goes off the screen which is not a good UX for the clients"): centred
 * over its control, then moved in from either edge of the window as far as
 * it needs, and a long label wraps at 14rem, deeper rather than wider
 * (Anthony: "make the hover deeper not wider"); a label's own line breaks
 * are kept.
 */
const EDGE = 8;
export function Tooltip({ label, children, shown: shownAtFirst = false, className = "relative inline-flex" }: { label: string; children: ReactElement<{ "aria-describedby"?: string }>; /** Shown from the start: the drawing kit's example. */ shown?: boolean; /** The wrapper's layout classes, for a wrapped part that must shrink or fill: never a colour. */ className?: string }) {
  const id = useId();
  const [shown, setShown] = useState(shownAtFirst);
  const bubble = useRef<HTMLSpanElement | null>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!shown || !bubble.current) return;
    const rect = bubble.current.getBoundingClientRect();
    const width = typeof window === "undefined" ? 0 : window.innerWidth;
    if (!width || rect.width === 0) return;
    // The box is measured where it would sit unshifted: measured as shifted, every render asked for a new shift.
    const over = Math.max(0, rect.right - shift - (width - EDGE));
    const under = Math.max(0, EDGE - (rect.left - shift));
    const next = Math.round(under - over);
    if (next !== shift) setShift(next);
  }, [shown, label, shift]);
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
          ref={bubble}
          role="tooltip"
          id={id}
          data-part="tooltip"
          className={`pointer-events-none absolute left-1/2 -top-2 w-max max-w-[14rem] whitespace-pre-line rounded-[12px] border border-border-dim bg-card px-3 py-2 text-center text-[12px] font-normal tracking-normal text-foreground shadow-lg ${LAYER.RAISED}`}
          style={{ transform: `translate(calc(-50% + ${shift}px), -100%)` }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
