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
 *
 * `chip` draws the same dropdown as a compact filter that names itself —
 * "Position" until a choice is made, then "Position: 1–3" in the brand tint —
 * and is as wide as its words rather than its longest option, so a search box
 * and four filters share one row (Anthony, 2026-09-26, showing Ahrefs'
 * Organic keywords: four dropdowns had wrapped onto a second line). The
 * native select still does the work, laid invisibly over the chip, so the
 * keyboard, the screen reader and the phone's own picker all behave as before.
 */
export function Select({
  id,
  value,
  onChange,
  children,
  disabled = false,
  className = "",
  selectClassName = "",
  chip,
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
  /**
   * Draw it as a compact chip: `label` is what it says, and `choice` — the
   * chosen option's words, or nothing — follows the label in the brand tint.
   * `icon` sits before the words.
   */
  chip?: { label: string; choice?: string | null; icon?: ReactNode };
  "aria-label"?: string;
}) {
  if (chip) {
    const chosen = Boolean(chip.choice);
    return (
      <div
        className={cn(
          "relative inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-[13px] transition-colors focus-within:border-brand/50",
          chosen ? "border-brand/30 bg-brand/15 text-brand" : "border-border-dim bg-background text-foreground hover:bg-hover/40",
          disabled ? "opacity-60" : "",
          className,
        )}
      >
        {chip.icon}
        {/* Hidden from a screen reader, which reads the select's own name and value instead. */}
        {/* Cut short with "…" when the chip is given a width to keep to. */}
        <span aria-hidden="true" className="min-w-0 truncate">{chosen ? `${chip.label}: ${chip.choice}` : chip.label}</span>
        <ChevronDown className={cn("pointer-events-none h-4 w-4", chosen ? "text-brand" : "text-muted")} aria-hidden="true" />
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={ariaLabel ?? chip.label}
          // Over the whole chip and invisible: pressing anywhere on it opens the
          // list. The colours are for the list itself, which some systems draw
          // in the select's own.
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-background text-[13px] text-foreground opacity-0 disabled:cursor-default"
        >
          {children}
        </select>
      </div>
    );
  }

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
