"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A page title that is also the switch between records of its kind: the
 * record's name, a quiet arrow after it, and the list of the others opening
 * from it. Anthony chose it for a website in Google Analytics on 2026-10-15
 * (docs/plans/active/ga-header-plan.md), where the header had said the
 * website's name twice: once as the title, once in a dropdown beside it.
 *
 * The native select does the work, laid invisibly over the name as the filter
 * chip's is (`Select` with `chip`), so the keyboard, a screen reader and a
 * phone's own picker behave as on any dropdown. It goes inside the header's
 * `<h1>`, which keeps the title's size and weight.
 */
export function TitleSwitch({
  label,
  value,
  onChange,
  children,
  "aria-label": ariaLabel,
}: {
  /** What the title says: the chosen record's name. */
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** The `<option>`s, one per record. */
  children: ReactNode;
  "aria-label": string;
}) {
  return (
    <span
      data-part="title-switch"
      data-part-label={ariaLabel}
      className="relative inline-flex min-w-0 items-center gap-2 rounded-[6px] has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-brand"
    >
      <span className="min-w-0 break-words">{label}</span>
      <ChevronDown className="pointer-events-none h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-background text-[13px] text-foreground opacity-0"
      >
        {children}
      </select>
    </span>
  );
}
