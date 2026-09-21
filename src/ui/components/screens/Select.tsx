"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/src/ui/lib/utils";

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
  /**
   * Classes for the select itself.
   *
   * Merged rather than appended, so a caller can actually replace the height,
   * radius or padding — two class names for the same property in one string
   * leave the winner to stylesheet order, which is how a dropdown ended up 8px
   * shorter than the box beside it on the same row.
   */
  selectClassName?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "h-[38px] w-full appearance-none rounded-[10px] border border-border-dim bg-background pl-3 pr-10 text-[13px] text-foreground outline-none transition-colors focus:border-brand/50 disabled:opacity-60",
          selectClassName,
        )}
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
