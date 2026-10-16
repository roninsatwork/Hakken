import { v, type Infer } from "convex/values";

/**
 * Microsoft Clarity's data export, read (docs/plans/active/insights-analyst-plan.md
 * §7b, I24, phase 15; kept as totals since docs/plans/active/agents-and-clarity-plan.md,
 * Part 0): the dashboard's figures for the last day, split by page and device or
 * by device alone, as Clarity's "project-live-insights" answer gives them — a
 * list of metrics, each with its rows.
 *
 * Kept as whole-number totals, never as averages: visits, scroll depth times
 * visits, seconds engaged times visits, and how many visits had each
 * frustration. Days then add up by plain addition, and every screen works the
 * same average from the same totals — the list, Overview and Pages said 28.0%,
 * 27.9% and 19.2% for one website's scroll depth when each averaged averages
 * its own way (2026-10-16 audit).
 */

/** A row as the screens read it: averages and shares worked out from the totals (`rowOf`). */
export const clarityRowValidator = v.object({
  /** A page's path, a device's name, or both ("/path|Mobile"). */
  key: v.string(),
  sessions: v.number(),
  /** Average share of the page scrolled, 0 to 100. */
  scroll: v.union(v.number(), v.null()),
  /** Average active seconds a visit. */
  activeSeconds: v.union(v.number(), v.null()),
  /** Shares of visits, 0 to 100, with a dead click, a rage click, a quick back, an excessive scroll. */
  dead: v.union(v.number(), v.null()),
  rage: v.union(v.number(), v.null()),
  quickBack: v.union(v.number(), v.null()),
  excessiveScroll: v.union(v.number(), v.null()),
});
export type ClarityRow = Infer<typeof clarityRowValidator>;

/** The separator between a page and its device in a page-and-device row's key. */
export const DEVICE_JOIN = "|";

/**
 * What Hakken keeps of a row, every one a whole number: the visits by people
 * (Clarity's bot visits taken out and counted on their own), the scroll depth
 * in tenths of a percent and the seconds engaged each times the visits, the
 * visits with each frustration or error, the people, and the pages seen in
 * hundredths times the visits.
 */
export const CLARITY_FIGURES = ["visits", "bots", "scrollSum", "activeSum", "dead", "rage", "quickBack", "excessive", "errors", "errorClicks", "users", "pagesSum"] as const;
export type ClarityFigure = (typeof CLARITY_FIGURES)[number];
export type ClarityTotals = Record<ClarityFigure, number>;
/** A row's totals: a page on a device, or a device across the website (`page` null). */
export type ClarityTotalsRow = ClarityTotals & { page: string | null; device: string };

export const clarityTotalsRowValidator = v.object({
  page: v.union(v.string(), v.null()),
  device: v.string(),
  ...(Object.fromEntries(CLARITY_FIGURES.map((figure) => [figure, v.number()])) as Record<ClarityFigure, ReturnType<typeof v.number>>),
});

/** Scroll depth is kept to a tenth of a percent, pages a visit to a hundredth. */
export const SCROLL_STEP = 10;
export const PAGES_STEP = 100;

export const emptyTotals = (): ClarityTotals => Object.fromEntries(CLARITY_FIGURES.map((figure) => [figure, 0])) as ClarityTotals;

export function addTotals(into: ClarityTotals, from: ClarityTotals): ClarityTotals {
  for (const figure of CLARITY_FIGURES) into[figure] += from[figure];
  return into;
}

type Info = Record<string, unknown>;
const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** The path of a page Clarity names by its full address, without its query or fragment. */
function pathOf(address: string): string {
  try {
    return new URL(address).pathname || "/";
  } catch {
    return address.split(/[?#]/)[0] || "/";
  }
}

/**
 * A row's page address. Clarity's documentation names the dimension "URL" but
 * not the field its answer carries it in, and reading `URL` alone filed every
 * page of a connected website as "/" (2026-10-16 audit): so any field named for an
 * address, whatever its case, and failing that any value that is one.
 */
function addressOf(info: Info): string {
  for (const [name, value] of Object.entries(info)) {
    if (typeof value === "string" && /^(page\s*)?ur[li]$/i.test(name.trim())) return value;
  }
  for (const value of Object.values(info)) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return "";
}

function deviceOf(info: Info): string {
  for (const [name, value] of Object.entries(info)) {
    if (typeof value === "string" && /^device$/i.test(name.trim()) && value.trim()) return value.trim();
  }
  return "Other";
}

/** What one row of Clarity's answer said, before it is turned into totals. */
type Raw = { page: string | null; device: string; sessions: number; bots: number; users: number; pagesPerVisit: number | null; scroll: number | null; active: number | null; shares: Partial<Record<"dead" | "rage" | "quickBack" | "excessive" | "errors" | "errorClicks", number>> };

const SHARES: Record<string, keyof Raw["shares"]> = {
  DeadClickCount: "dead",
  RageClickCount: "rage",
  QuickbackClick: "quickBack",
  ExcessiveScroll: "excessive",
  ScriptErrorCount: "errors",
  ErrorClickCount: "errorClicks",
};

/**
 * Clarity's answer as totals: by page and device ("URL,Device"), or by device
 * across the website ("Device"). A share is turned into the visits it is a
 * share of, so it adds up across days; a page only bots visited is left out,
 * and across the website the bots are kept as their own count.
 */
export function clarityTotalsFrom(json: unknown, dimension: "URL,Device" | "Device"): ClarityTotalsRow[] {
  const metrics = Array.isArray(json) ? (json as Array<{ metricName?: string; information?: Info[] }>) : [];
  const raws = new Map<string, Raw>();
  const rawOf = (info: Info) => {
    const page = dimension === "URL,Device" ? pathOf(addressOf(info)) : null;
    const device = deviceOf(info);
    const key = `${page ?? ""}${DEVICE_JOIN}${device}`;
    const held = raws.get(key) ?? { page, device, sessions: 0, bots: 0, users: 0, pagesPerVisit: null, scroll: null, active: null, shares: {} };
    raws.set(key, held);
    return held;
  };
  for (const metric of metrics) {
    for (const info of metric.information ?? []) {
      const raw = rawOf(info);
      const share = metric.metricName ? SHARES[metric.metricName] : undefined;
      if (metric.metricName === "Traffic") {
        raw.sessions += num(info.totalSessionCount) ?? 0;
        raw.bots += num(info.totalBotSessionCount) ?? 0;
        raw.users += num(info.distantUserCount ?? info.distinctUserCount) ?? 0;
        raw.pagesPerVisit = num(info.PagesPerSessionPercentage ?? info.pagesPerSessionPercentage);
      } else if (metric.metricName === "ScrollDepth") {
        raw.scroll = num(info.averageScrollDepth);
      } else if (metric.metricName === "EngagementTime") {
        raw.active = num(info.activeTime);
      } else if (share) {
        const value = num(info.sessionsWithMetricPercentage);
        if (value !== null) raw.shares[share] = value;
      }
    }
  }
  const rows: ClarityTotalsRow[] = [];
  for (const raw of raws.values()) {
    const visits = Math.max(0, Math.round(raw.sessions - raw.bots));
    if (visits === 0 && (raw.page !== null || raw.bots === 0)) continue;
    const of = (share: number | undefined) => (share === undefined ? 0 : Math.round((share / 100) * visits));
    rows.push({
      page: raw.page,
      device: raw.device,
      visits,
      bots: Math.max(0, Math.round(raw.bots)),
      scrollSum: raw.scroll === null ? 0 : Math.round(raw.scroll * SCROLL_STEP * visits),
      activeSum: raw.active === null ? 0 : Math.round(raw.active * visits),
      dead: of(raw.shares.dead),
      rage: of(raw.shares.rage),
      quickBack: of(raw.shares.quickBack),
      excessive: of(raw.shares.excessive),
      errors: of(raw.shares.errors),
      errorClicks: of(raw.shares.errorClicks),
      users: Math.max(0, Math.round(raw.users)),
      pagesSum: raw.pagesPerVisit === null ? 0 : Math.round(raw.pagesPerVisit * PAGES_STEP * visits),
    });
  }
  return rows.sort((a, b) => b.visits - a.visits);
}

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** A row as the screens read it, from its totals: each average and share over the visits by people. */
export function rowOf(key: string, totals: ClarityTotals): ClarityRow {
  const visits = totals.visits;
  const share = (count: number) => (visits > 0 ? oneDecimal((count / visits) * 100) : null);
  return {
    key,
    sessions: visits,
    scroll: visits > 0 ? oneDecimal(totals.scrollSum / SCROLL_STEP / visits) : null,
    activeSeconds: visits > 0 ? oneDecimal(totals.activeSum / visits) : null,
    dead: share(totals.dead),
    rage: share(totals.rage),
    quickBack: share(totals.quickBack),
    excessiveScroll: share(totals.excessive),
  };
}
