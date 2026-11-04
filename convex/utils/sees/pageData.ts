import { keyedRead } from "../agentTools";
import type { Fact } from "../insightFacts";
import { MOST_FIGURES } from "../startedOn";
import { seesScreenFor, sourceOfSection } from "./screens";

/**
 * A page's own figures, handed to the eye (docs/plans/active/sees-every-page-plan-2026-10-31.md, phase 1). Every page
 * already holds what it shows — the answer of the very query that draws it — so the eye takes that, not a second read:
 * the writer, the panel's findings and the chat then name exactly the figures the reader sees. Kept short (each list
 * its first rows, as the page opens), numbers given keys the writer names and the Editor fills in. No database here.
 */

/** Rows a list keeps, depth an answer is followed to, and the words a string keeps: a page's first screen, never all of it. */
const MOST_ROWS = 25;
/**
 * Rows a dated list keeps (a chart's days, weeks or months), newest first kept: a year of days and more, so a 90-day
 * chart hands all 90 (ask-hakken-every-chart-page-plan-2026-11-03.md, shared work 1). Before, every list kept its first
 * 25 rows, and a chart's first rows are its oldest: the eye lost a 90-day chart's newest 65 days.
 */
const MOST_DATED_ROWS = 400;
const MOST_DEPTH = 6;
const MOST_TEXT = 200;
/** A page's figures handed over at most, as JSON text: well inside what a Convex argument and a saved answer may hold. */
export const MOST_PAGE_DATA_CHARS = 120_000;
/** Fields that are the page's own plumbing, never a figure or a name a reader sees. */
const PLUMBING = /^(_id|_creationTime|siteId|companyId|companyWebsiteId|websiteId|holdId|userId|threadId|runId|iconUrl|icon|href|link|links|seen|rule|sees|ok)$/;
/** A field kept as a fraction a screen shows as a percentage: a click rate, a share, a rate. */
const FRACTION = /(rate|share|ctr)$/i;
/**
 * A change kept as a fraction: Google Analytics' only (`FRACTIONS_ALWAYS`). Elsewhere a `change` counts places or clicks
 * (ask-hakken-every-chart-page-plan-2026-11-03.md, shared work 2): Visibility's is the places a search moved, Search
 * Console's `positionChange` too and its `change` the clicks gained, so a move of 0.4 places once read as 40%.
 */
const CHANGE = /change$/i;
/** A dated row's day, week or month, as the answers keep them: "2026-10-31", "2026-W44", "2026-10". */
const DATED_FIELDS = ["day", "date", "week", "month"] as const;
const DATED = /^\d{4}-(\d{2}(-\d{2})?|W\d{2})$/;

/**
 * Whether a screen keeps every rate, share and change as a fraction, past 1 as well: Google Analytics' do, every one of
 * them (checked 2026-11-03: its `change` fields are all "against the span before, as a fraction"; a channel's
 * conversions over its visits read 1.83, 183%; a campaign's visits against the span before 2, +200%). Elsewhere a
 * figure past 1 may already be a percentage (Insights' page plan keeps its rates as 3.4) or a count of places (Search
 * Console's moves keep a `change` of 16): there only a fraction of 1 or less is turned round, as before.
 */
const FRACTIONS_ALWAYS = /^googleAnalytics\./;
/**
 * Screens that keep every rate and share as a percentage already, whatever its size: Insights' (its builder, 2026-11-03:
 * an enquiry rate of 0.8% reached the writer as 80%). Nothing on them is turned round.
 */
const PERCENTS_ALWAYS = /^insights\./;

/**
 * The page's answer cut to what it shows first: lists to their first rows, long words shortened, plumbing dropped, and
 * a rate kept as a fraction (0.034) turned into the percentage the page shows (3.4), so the writer reads it right.
 * `always`: the screen keeps its rates, shares and changes as fractions whatever their size (`FRACTIONS_ALWAYS`).
 */
export function trimPageData(value: unknown, depth = 0, always: boolean | "never" = false): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.length > MOST_TEXT ? `${value.slice(0, MOST_TEXT)}…` : value;
  if (typeof value === "boolean") return value;
  if (depth >= MOST_DEPTH) return null;
  if (Array.isArray(value)) return keptRows(value, MOST_ROWS, MOST_DATED_ROWS).map((item) => trimPageData(item, depth + 1, always));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [name, inner] of Object.entries(value as Record<string, unknown>)) {
      if (PLUMBING.test(name) || inner === undefined || inner === null || name.startsWith("$")) continue;
      const fraction = always !== "never" && (FRACTION.test(name) || (always === true && CHANGE.test(name)));
      if (typeof inner === "number" && Number.isFinite(inner) && fraction && !/percent$/i.test(name) && (always === true || Math.abs(inner) <= 1)) {
        out[`${name}Percent`] = Math.round(inner * 1000) / 10;
        continue;
      }
      const kept = trimPageData(inner, depth + 1, always);
      if (kept === null) continue;
      out[name] = kept;
      // A list cut to its first rows says how long it was, so no rule reads 25 rows of 9,000 as a whole (shared work 4).
      if (Array.isArray(inner) && Array.isArray(kept) && kept.length < inner.length && !(`${name}AllRows` in out)) out[`${name}AllRows`] = inner.length;
    }
    return out;
  }
  return null;
}

/** Whether a list is dated: two rows or more, each with a day, week or month. */
export function isDated(list: readonly unknown[]): boolean {
  return list.length >= 2 && list.every((item) => item !== null && typeof item === "object" && !Array.isArray(item) && DATED_FIELDS.some((field) => typeof (item as Record<string, unknown>)[field] === "string" && DATED.test((item as Record<string, unknown>)[field] as string)));
}

const dateOf = (item: unknown): string => {
  const row = item as Record<string, unknown>;
  const field = DATED_FIELDS.find((one) => typeof row[one] === "string" && DATED.test(row[one] as string));
  return field ? (row[field] as string) : "";
};

/** A list's rows kept: a dated list its newest `dated`, whichever way it runs; any other list its first `rows`, as the page opens. */
function keptRows<T>(list: readonly T[], rows: number, dated: number): T[] {
  if (!isDated(list)) return list.slice(0, rows);
  if (list.length <= dated) return [...list];
  return dateOf(list[0]) > dateOf(list[list.length - 1]) ? list.slice(0, dated) : list.slice(list.length - dated);
}

/**
 * The page's answer trimmed and held to its size: rows dropped from the end of the longest lists until it fits. With
 * its screen's key, a Google Analytics screen's rates and shares past 1 are turned into percentages too.
 */
export function pageDataFor(value: unknown, screen = ""): unknown {
  let trimmed = trimPageData(value, 0, FRACTIONS_ALWAYS.test(screen) ? true : PERCENTS_ALWAYS.test(screen) ? "never" : false);
  for (let rows = MOST_ROWS; rows > 2 && JSON.stringify(trimmed ?? null).length > MOST_PAGE_DATA_CHARS; rows = Math.floor(rows / 2)) {
    // A dated list shrinks with the rest, keeping as many more rows as it started with: 400, 192, 96 newest.
    trimmed = cutLists(trimmed, rows, Math.round((rows * MOST_DATED_ROWS) / MOST_ROWS));
  }
  return JSON.stringify(trimmed ?? null).length > MOST_PAGE_DATA_CHARS ? null : trimmed;
}

/**
 * The page's figures as a short brief: each list to its first `rows` (page-screen-redo-plan-2026-11-03.md, step 6). With
 * code's findings in hand the writer writes them up and needs the page only for its setting; a press handed the whole page
 * cost three times one handed a short brief (More Handles, 3 November: 9,000 words in, 5 cents; 94,000, 50 cents).
 */
export function briefOf(value: unknown, rows: number): unknown {
  return cutLists(value, rows, rows);
}

/** Each list to its first `rows`, a dated one to its newest `dated`. */
function cutLists(value: unknown, rows: number, dated: number): unknown {
  if (Array.isArray(value)) return keptRows(value, rows, dated).map((item) => cutLists(item, rows, dated));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, inner]) => [name, cutLists(inner, rows, dated)]));
  return value;
}

/** The page's figures as facts the writer names by key, and the page as it reads it, keys beside each number. */
export function pageFacts(screen: string, data: unknown, at: { from?: string; to?: string; country?: string; currency?: string | null } = {}): { shown: unknown; facts: Fact[] } {
  const entry = seesScreenFor(screen);
  if (!entry || data === null || data === undefined) return { shown: null, facts: [] };
  return keyedRead(data, "page", { source: sourceOfSection(entry.section), ...at });
}


/**
 * The page's figures as lines for Ask Hakken, when a conversation starts from the eye's panel: "keywords · door
 * handles · clicks: 840". The page's own, as it showed them, so "why did this fall?" is answered about these.
 */
export function pageFigureLines(screen: string, data: unknown): string[] {
  const { facts } = pageFacts(screen, data);
  const shown = (value: number, unit: Fact["unit"]) => `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: unit === "count" ? 0 : 2 }).format(value)}${unit === "percent" ? "%" : ""}`;
  return facts.slice(0, MOST_FIGURES).map((fact) => `${fact.label.replace(/^page · /, "")}: ${shown(fact.value, fact.unit)}`);
}
