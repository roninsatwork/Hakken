"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CALENDAR_PERIODS, customSpans, periodSpan, ukDay, type MenuPeriod } from "@/convex/utils/calendarPeriods";
import { LAYER } from "@/src/ui/lib/layers";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "./Button";

/**
 * What the Dates menu holds: a ready-made period, or custom dates — a first
 * and a last day (sees-header-and-rolling-dates-plan.md, part two, rule 4).
 */
export type DateChoice = { period: MenuPeriod } | { period: "custom"; from: string; to: string };

export const isCustomDates = (choice: DateChoice): choice is { period: "custom"; from: string; to: string } => choice.period === "custom";

/**
 * The Dates menu every section shares — board 1 of the canvas of 2026-10-29
 * (sees-header-and-rolling-dates-plan.md, part two; Anthony: "I love the
 * dates they work really well"): a filter chip that names its choice, opening
 * a list of the seven periods with the days each covers today beside it, so
 * nobody has to guess what "Last 3 months" means, then Custom dates: a first
 * and a last day, shown on Show. The days are worked out from the newest day
 * the section holds (`newest`; Sites' is today), by the one rule in
 * `convex/utils/calendarPeriods.ts`.
 *
 * Grey when open or on custom dates, never the brand colour, as every filter
 * chip. Closes on a choice, on Escape, and on a click outside it.
 */
type DatesMenuProps = {
  value: DateChoice;
  /** The newest day the section holds, `YYYY-MM-DD`; null while unknown, when today stands in. */
  newest: string | null;
  /** The oldest day held, for custom dates' lower bound; none when any day may be asked. */
  oldest?: string | null;
  /** The chip's name: "Dates" unless the screen says otherwise. */
  label?: string;
} & (
  /** Custom dates offered, as every section should: the choice may be them. */
  | { custom?: true; onChange: (choice: DateChoice) => void }
  /** A section that cannot answer custom dates yet leaves them out, and only ever gets a period back. */
  | { custom: false; onChange: (choice: { period: MenuPeriod }) => void }
);

export function DatesMenu({ value, newest, oldest, label, ...rest }: DatesMenuProps) {
  const custom = rest.custom !== false;
  const onChange = rest.onChange as (choice: DateChoice) => void;
  const t = useTranslations("common.periods");
  const locale = useLocale();
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const today = ukDay();
  const end = newest ?? today;

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const name = label ?? t("label");
  const words = isCustomDates(value) ? spanWords(value.from, value.to, locale) : t(value.period);
  const narrowed = open || isCustomDates(value);
  const drafting = draft ?? (isCustomDates(value) ? { from: value.from, to: value.to } : { from: customSpans(end, end).before.from, to: end });
  const draftOk = /^\d{4}-\d{2}-\d{2}$/.test(drafting.from) && /^\d{4}-\d{2}-\d{2}$/.test(drafting.to) && drafting.from <= drafting.to && drafting.to <= end;
  const choose = (choice: DateChoice) => {
    onChange(choice);
    setDraft(null);
    setOpen(false);
  };

  return (
    <div ref={wrapper} className="relative inline-flex">
      <Button
        variant="outline"
        data-part="dates-menu"
        data-part-label={name}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((before) => !before)}
        className={cn(
          "inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 py-0 text-[13px] font-normal text-foreground hover:text-foreground",
          narrowed ? "border-secondary/40 bg-hover" : "border-border-dim bg-background hover:bg-hover/40",
        )}
      >
        <span className="min-w-0 truncate"><span className="text-secondary">{name}:</span> {words}</span>
        <ChevronDown className={cn("pointer-events-none h-4 w-4", narrowed ? "text-foreground" : "text-muted")} aria-hidden="true" />
      </Button>
      {open ? (
        <div id={panelId} role="menu" aria-label={name} className={cn("absolute left-0 top-full mt-1 flex w-max min-w-[220px] flex-col gap-0.5 rounded-[10px] border border-border-dim bg-card p-2 shadow-lg", LAYER.PAGE_MENU)}>
          {CALENDAR_PERIODS.map((period) => {
            const span = periodSpan(period, today, end);
            const chosen = !isCustomDates(value) && value.period === period;
            return (
              <Button
                key={period}
                variant="ghost"
                role="menuitemradio"
                aria-checked={chosen}
                onClick={() => choose({ period })}
                className={cn(
                  "flex w-full items-center justify-between gap-8 rounded-[8px] border px-3 py-1.5 text-left text-[13px] font-normal tracking-wide transition-colors hover:bg-transparent",
                  chosen ? "bg-foreground/10 border-border-dim shadow-sm text-foreground font-medium hover:bg-foreground/10" : "border-transparent text-secondary hover:text-foreground",
                )}
              >
                <span>{t(period)}</span>
                <span className="text-[12px] tabular-nums text-secondary">{span ? spanWords(span.from, span.to, locale) : t("noneYet")}</span>
              </Button>
            );
          })}
          {custom ? (
            <div className={cn("mt-0.5 flex flex-col gap-2 rounded-[8px] border px-3 py-1.5", isCustomDates(value) ? "border-border-dim bg-foreground/10" : "border-transparent")}>
              <div className="flex items-center justify-between gap-8 text-[13px] tracking-wide text-foreground">
                <span>{t("custom")}</span>
                <span className="text-[12px] text-secondary">{t("customHint")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`${panelId}-from`}>{t("customFrom")}</label>
                <input
                  id={`${panelId}-from`}
                  type="date"
                  value={drafting.from}
                  min={oldest ?? undefined}
                  max={end}
                  onChange={(event) => setDraft({ ...drafting, from: event.target.value })}
                  className="h-[34px] rounded-[8px] border border-border-dim bg-background px-2 text-[13px] text-foreground outline-none focus:border-brand/50"
                />
                <span className="text-[12px] text-secondary">{t("customTo")}</span>
                <label className="sr-only" htmlFor={`${panelId}-to`}>{t("customToLabel")}</label>
                <input
                  id={`${panelId}-to`}
                  type="date"
                  value={drafting.to}
                  min={oldest ?? undefined}
                  max={end}
                  onChange={(event) => setDraft({ ...drafting, to: event.target.value })}
                  className="h-[34px] rounded-[8px] border border-border-dim bg-background px-2 text-[13px] text-foreground outline-none focus:border-brand/50"
                />
                <Button variant="outline" disabled={!draftOk} onClick={() => choose({ period: "custom", from: drafting.from, to: drafting.to })} className="h-[34px] rounded-[8px] px-3 text-[13px]">
                  {t("customShow")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The days a span covers, as the menu says them: "26–28 Oct" within a month,
 * "29 Jul – 28 Oct" within a year, "29 Oct 2025 – 28 Oct 2026" across two.
 */
export function spanWords(from: string, to: string, locale: string): string {
  const day = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(new Date(`${iso}T00:00:00Z`));
  if (from === to) return day(to, { day: "numeric", month: "short", year: from.slice(0, 4) === ukDay().slice(0, 4) ? undefined : "numeric" });
  if (from.slice(0, 7) === to.slice(0, 7)) return `${day(from, { day: "numeric" })}–${day(to, { day: "numeric", month: "short" })}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${day(from, { day: "numeric", month: "short" })} – ${day(to, { day: "numeric", month: "short" })}`;
  return `${day(from, { day: "numeric", month: "short", year: "numeric" })} – ${day(to, { day: "numeric", month: "short", year: "numeric" })}`;
}
