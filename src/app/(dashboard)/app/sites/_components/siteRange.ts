/**
 * The date range and step every Sites page shares, kept in the URL
 * (`?from=…&to=…&step=…`) so a link, a refresh and the side menu all keep
 * them. Docs/plans/active/user-sites-plan.md, "Where it lives".
 */

export type SiteStep = "day" | "week" | "month";

/** The quick picks, in days: a week to two years (D3, D8). */
export const SITE_PRESETS = ["7", "30", "90", "365", "730"] as const;
export type SitePreset = (typeof SITE_PRESETS)[number];

export type SiteRange = {
  /** Inclusive, `YYYY-MM-DD`. */
  from: string;
  to: string;
  step: SiteStep;
  /** The quick pick this range came from, or custom. */
  preset: SitePreset | "custom";
};

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dayString(date);
}

/** A `YYYY-MM` month moved by whole months, across years. */
export function shiftMonth(month: string, by: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Daily up to 90 days, weekly up to a year, monthly beyond. */
export function defaultStep(from: string, to: string): SiteStep {
  const span = daysBetween(from, to);
  if (span <= 90) return "day";
  if (span <= 366) return "week";
  return "month";
}

function isDay(value: string | null): value is string {
  return value !== null && DAY_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isStep(value: string | null): value is SiteStep {
  return value === "day" || value === "week" || value === "month";
}

/** The address key that says the dates were chosen by hand, whatever they are. */
export const CUSTOM_RANGE_KEY = "range";

/**
 * The range in the address, or the last 30 days.
 *
 * A malformed or back-to-front range falls back rather than throwing: the
 * address bar is typed by people. Dates chosen by hand say so
 * (`range=custom`): without it, "Custom" chosen over the last 30 days would
 * read straight back as "Last 30 days", and the date fields would never open.
 */
export function parseSiteRange(params: URLSearchParams, now: Date = new Date()): SiteRange {
  const today = dayString(now);
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const stepParam = params.get("step");

  let to = isDay(toParam) ? toParam : today;
  let from = isDay(fromParam) ? fromParam : shiftDay(to, -29);
  if (from > to) [from, to] = [to, from];

  const span = String(daysBetween(from, to) + 1);
  const chosenByHand = params.get(CUSTOM_RANGE_KEY) === "custom";
  const preset: SiteRange["preset"] =
    !chosenByHand && to === today && (SITE_PRESETS as readonly string[]).includes(span) ? (span as SitePreset) : "custom";
  return { from, to, step: isStep(stepParam) ? stepParam : defaultStep(from, to), preset };
}

/**
 * The range as query text, with the defaults left out so a plain link stays
 * plain. Dates chosen by hand are always written out, and marked as such.
 */
export function siteRangeQuery(range: SiteRange, now: Date = new Date()): string {
  const defaults = parseSiteRange(new URLSearchParams(), now);
  const params = new URLSearchParams();
  if (range.preset === "custom" || range.from !== defaults.from || range.to !== defaults.to) {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  if (range.preset === "custom") params.set(CUSTOM_RANGE_KEY, "custom");
  if (range.step !== defaultStep(range.from, range.to)) params.set("step", range.step);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The range a quick pick names, ending today. */
export function presetRange(preset: SitePreset, now: Date = new Date()): SiteRange {
  const to = dayString(now);
  const from = shiftDay(to, -(Number(preset) - 1));
  return { from, to, step: defaultStep(from, to), preset };
}
