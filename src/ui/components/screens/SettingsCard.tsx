"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "./Button";

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
/**
 * A card that folds away, for a card read once and then wanted out of the way
 * — What Hakken sees (search-console-volatility-plan.md §8, HS1; Anthony,
 * 2026-10-10: "so once you read it you can minimise it and get more screen
 * real estate back"). Its title becomes the button, with the chevron Search
 * Console's side menu draws for its groups; folded, the card is one row — the
 * title, `summary` cut to the line, the chevron — and its contents are not drawn.
 */
export type CardFold = { open: boolean; onToggle: () => void; summary?: string };

export function SettingsCard({ title, className, children, fold }: {
  title: string;
  className?: string;
  children: ReactNode;
  fold?: CardFold;
}) {
  const panelId = useId();
  if (fold) {
    return (
      <section data-part="settings-card" className={cn("flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40", fold.open ? "p-6" : "px-6 py-4", className)}>
        <h2 data-part-title className={cn("text-muted", fold.open && "mb-1")}>
          <Button
            variant="ghost"
            aria-expanded={fold.open}
            aria-controls={panelId}
            onClick={fold.onToggle}
            className="flex w-full items-center gap-4 rounded-none p-0 text-left text-muted hover:bg-transparent hover:text-foreground"
          >
            <span className="shrink-0 text-[13px] font-semibold uppercase tracking-[0.12em]">{title}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-secondary">{fold.open ? null : fold.summary}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", fold.open && "rotate-180")} aria-hidden="true" />
          </Button>
        </h2>
        {fold.open ? <div id={panelId} className="flex flex-col gap-3">{children}</div> : null}
      </section>
    );
  }
  return (
    <section data-part="settings-card" className={cn("flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-6", className)}>
      <h2 data-part-title className="mb-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
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
const SEGMENT_COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function SegmentedChoice<T extends string>({ label, value, options, onChange, size = "field" }: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  /**
   * `field` stands with the form's fields, their height and full width;
   * `compact` is as wide as its choices, for switching between views of one
   * card or table — Sites' and Search Console's view switches, which drew
   * their own until the 2026-10-03 clean-up.
   */
  size?: "field" | "compact";
}) {
  // Three was hardcoded because reasoning effort has three levels. A two-way
  // choice left an empty column and a four-way one wrapped, so anything but a
  // triple had to fork the control — which is how a second segmented control
  // gets written. Tailwind cannot take a computed class name, hence the map.
  const columns = SEGMENT_COLUMNS[options.length] ?? "grid-cols-3";

  return (
    <div
      data-part="choice"
      data-part-label={label}
      role="radiogroup"
      aria-label={label}
      className={cn(
        size === "compact"
          ? "inline-flex w-fit gap-1 rounded-[10px] border border-border-dim bg-black/20 p-1"
          : cn("grid h-[46px] gap-1 rounded-[12px] border border-border-dim bg-black/20 p-1", columns),
      )}
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
            "text-[12px] font-medium transition-colors",
            size === "compact" ? "rounded-[7px] px-3 py-1" : "rounded-[9px]",
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
 * One setting as a row: what it is on the left, the control on the right.
 *
 * The shape `SettingSwitch` already had, opened up to any control — a box, a
 * select, a segmented choice. Anthony chose it for the agent Settings page on
 * 2026-09-23 from a screen where each setting says what it is in a line
 * beside it, rather than a label stacked over a box with a hint underneath.
 *
 * The left side is text, not a `<label>`: the control carries its own
 * accessible name (`Field`'s `labelHidden`, or `aria-label`), so the words are
 * not announced twice. The control column is capped at a readable width —
 * a single control stretched across a monitor looks broken — and stacks
 * under the text on a narrow screen.
 */
export function SettingRow({ label, description, children }: {
  label: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {description ? <div className="text-[12px] leading-relaxed text-muted">{description}</div> : null}
      </div>
      <div className="w-full shrink-0 sm:max-w-[380px]">{children}</div>
    </div>
  );
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
        <Switch label={label} checked={checked} onChange={onChange} className="mt-0.5" />
      </div>
      {children}
    </div>
  );
}

/**
 * The switch itself, for a row that says what it is elsewhere: a table row's
 * "On" (a website's Schedules, docs/plans/active/website-schedules-plan.md,
 * WS3). The one `SettingSwitch` draws, shared rather than copied. `label`
 * names it for a screen reader and its tooltip.
 */
export function Switch({ label, checked, onChange, disabled = false, className }: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Layout only — margin, alignment. */
  className?: string;
}) {
  return (
    // Raw on purpose: a toggle switch drawn by its inner spans — not a
    // button recipe at all.
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("shrink-0 disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      <span
        className={cn(
          "relative block h-5 w-9 rounded-full transition-colors",
          checked ? "bg-brand" : "bg-foreground/15",
        )}
      >
        <span
          className={cn(
            // The knob on a lit switch takes the words-on-brand colour,
            // so it still shows on a pale brand colour (2026-10-03).
            "absolute top-0.5 h-4 w-4 rounded-full transition-all",
            checked ? "left-[18px] bg-on-brand" : "left-0.5 bg-white",
          )}
        />
      </span>
    </button>
  );
}
