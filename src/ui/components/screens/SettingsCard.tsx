"use client";

import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";

/**
 * The card an admin settings screen is built from.
 *
 * Lifted out of the agent settings screen unchanged, because the create screen
 * was built from something else entirely. Anthony, 2026-08-01, with both open:
 * *"there is massive inconsistencies between the edit and the add. I like the
 * edit so don't change that, the add is terrible and not consistent."*
 *
 * Two screens about the same object should not need the reader to relearn where
 * a heading sits and what a field label looks like. Shared here so they cannot
 * drift apart again by one of them being edited.
 */
export function SettingsCard({ title, className, children }: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-6", className)}>
      <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mt-1 text-[12px] font-medium text-secondary">
      {children}
    </label>
  );
}

/** The input, textarea and select styling both screens use. */
export const fieldClassName =
  "h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted focus:border-brand/50";

export const textAreaClassName =
  "min-h-[96px] w-full flex-1 resize-none rounded-[12px] border border-border-dim bg-black/20 px-4 py-3 text-[13px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted focus:border-brand/50";

/**
 * The three-way choice the settings screen uses for reasoning effort.
 *
 * A segmented control rather than three bordered cards: the levels are one
 * setting with three states, and reading them as three separate boxes is what
 * made the create screen's version look like something else.
 */
export function SegmentedChoice<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid h-[46px] grid-cols-3 gap-1 rounded-[12px] border border-border-dim bg-black/20 p-1"
    >
      {options.map((option) => (
        // Raw on purpose: a segment of a radio group, not a standalone button —
        // no Button variant is a selected/unselected segment.
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[9px] text-[12px] font-medium transition-colors",
            value === option.value
              ? "bg-brand/20 text-brand"
              : "text-secondary hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function FieldHint({ children, id }: { children: ReactNode; id?: string }) {
  return <p id={id} className="text-[11px] leading-relaxed text-muted">{children}</p>;
}

/**
 * A yes/no setting, said once.
 *
 * Each of these was two side-by-side buttons filling the width, so the reader
 * had to read both labels to work out which state they were in. A switch states
 * the setting once and shows its state, and the sentence underneath is free to
 * describe what that state actually does.
 */
export function SettingSwitch({ label, description, checked, onChange, children }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-medium text-foreground">{label}</span>
          <p className="text-[12px] leading-relaxed text-muted">{description}</p>
        </div>
        {/* Raw on purpose: a toggle switch drawn by its inner spans — not a
            button recipe at all. */}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          className="mt-0.5 shrink-0"
        >
          <span
            className={cn(
              "relative block h-5 w-9 rounded-full transition-colors",
              checked ? "bg-brand" : "bg-foreground/15",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                checked ? "left-[18px]" : "left-0.5",
              )}
            />
          </span>
        </button>
      </div>
      {children}
    </div>
  );
}
