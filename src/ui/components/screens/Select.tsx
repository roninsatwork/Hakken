"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A dropdown with its arrow where a designer would put it.
 *
 * Padding will not do this. A native select draws its own arrow hard against
 * the control's right edge and ignores `padding-right` when placing it — that
 * padding moves the *text*, which is why an earlier attempt at this changed
 * nothing visible. Anthony, 2026-08-06: *"you have not fixed the down arrows."*
 *
 * So the native arrow is switched off and one is drawn in its place, inset from
 * the border like every other control in the section. It takes no pointer
 * events, so the whole control still opens the menu.
 *
 * Shared rather than repeated inline, because the reason this looked wrong in
 * three places at once is that it was written out three times.
 */
export function Select({
  id,
  value,
  onChange,
  children,
  disabled = false,
  className = "",
  selectClassName = "",
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  /**
   * Width, on the wrapper.
   *
   * The arrow is positioned against the wrapper, so the wrapper has to be the
   * thing that is sized. Putting the width on the select instead left every
   * dropdown stretching to the full row and wrapping onto its own line.
   */
  className?: string;
  /** Border and state classes for the select itself. */
  selectClassName?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`h-[38px] w-full appearance-none rounded-[10px] border border-border-dim bg-background pl-3 pr-10 text-[13px] text-foreground outline-none transition-colors focus:border-brand/50 disabled:opacity-60 ${selectClassName}`}
      >
        {children}
      </select>

      <ChevronDown
        className="pointer-events-none absolute right-3 h-4 w-4 text-muted"
        aria-hidden="true"
      />
    </div>
  );
}
