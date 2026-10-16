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
/**
 * A row's totals: a page on a device, or a device across the website (`page`
 * null) — and, in the asks split a third way, the source or the browser the
 * visits came by (`split`).
 */
export type ClarityTotalsRow = ClarityTotals & { page: string | null; device: string; split?: string };

export const clarityTotalsRowValidator = v.object({
  page: v.union(v.string(), v.null()),
  device: v.string(),
  split: v.optional(v.string()),
  ...(Object.fromEntries(CLARITY_FIGURES.map((figure) => [figure, v.number()])) as Record<ClarityFigure, ReturnType<typeof v.number>>),
});

/**
 * The asks Hakken makes of Clarity's export, each the splits Clarity is asked
 * for (agents-and-clarity-plan.md, "Finishing Parts 3 and 4"): by page and
 * device, and by device — the day's own figures — then by device and source,
 * by page, device and source, by browser and device, and by page, browser and
 * device. Every ask is split by device, so every screen can choose one.
 */
export type ClarityAsk = "URL,Device" | "URL" | "Device" | "Device,Source" | "URL,Device,Source" | "Browser,Device" | "URL,Browser,Device";

/**
 * Rows Clarity sends an answer at most, the busiest first, never paged
 * (its Data Export documentation). An answer this long was cut: what was
 * quieter is missing from it.
 */
export const CLARITY_ROWS_AN_ANSWER = 1_000;

/**
 * The device of a page asked for without its devices — a large website's
 * pages past the busiest few hundred (agents-and-clarity-plan.md, "Large
 * websites"): counted in every figure across devices, in none for one device.
 */
export const ANY_DEVICE = "Any";

/** Whether Clarity cut an answer at its 1,000 rows. */
export function clarityAnswerCut(json: unknown): boolean {
  const metrics = Array.isArray(json) ? (json as Array<{ information?: unknown[] }>) : [];
  return metrics.some((metric) => (metric.information?.length ?? 0) >= CLARITY_ROWS_AN_ANSWER);
}

/**
 * A cut list of pages on each device, filled out from the pages asked for
 * alone: each page the first list holds keeps its rows by device; a page only
 * the second holds joins on `ANY_DEVICE`. A page is never counted twice.
 */
export function withUnsplitPages(byDevice: readonly ClarityTotalsRow[], alone: readonly ClarityTotalsRow[]): ClarityTotalsRow[] {
  const held = new Set(byDevice.map((row) => row.page));
  return [...byDevice, ...alone.filter((row) => !held.has(row.page)).map((row) => ({ ...row, device: ANY_DEVICE }))];
}

/** A row's place, page, device and split together: what adds up across days and what one day less another subtracts. */
export const totalsKey = (row: Pick<ClarityTotalsRow, "page" | "device" | "split">) => `${row.page ?? ""}${DEVICE_JOIN}${row.device}${DEVICE_JOIN}${row.split ?? ""}`;

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

/** A dimension's value by its name, whatever its case: Clarity's answer names them `Device`, `Browser`, `Source`. */
function valueOf(info: Info, dimension: string): string | null {
  for (const [name, value] of Object.entries(info)) {
    if (typeof value === "string" && name.trim().toLowerCase() === dimension.toLowerCase()) return value.trim();
  }
  return null;
}

const deviceOf = (info: Info): string => valueOf(info, "Device") || "Other";

/** A visit's source as Clarity names it ("google", "chatgpt.com"); one it gives no name is a direct visit. */
const sourceOf = (info: Info): string => valueOf(info, "Source") || "Direct";
const browserOf = (info: Info): string => valueOf(info, "Browser") || "Other";

/**
 * The website's address as Clarity records it ("https://www.example.com"),
 * from the first page in an answer split by page: what a link to a page's
 * heatmap in Clarity needs, since Hakken keeps only each page's path.
 */
export function clarityOriginFrom(json: unknown): string | null {
  const metrics = Array.isArray(json) ? (json as Array<{ information?: Info[] }>) : [];
  for (const metric of metrics) {
    for (const info of metric.information ?? []) {
      const address = addressOf(info);
      try {
        if (address) return new URL(address).origin;
      } catch {
        // Not a whole address: the next row may be.
      }
    }
  }
  return null;
}

/** What one row of Clarity's answer said, before it is turned into totals. */
type Raw = { page: string | null; device: string; split?: string; sessions: number; bots: number; users: number; pagesPerVisit: number | null; scroll: number | null; active: number | null; shares: Partial<Record<"dead" | "rage" | "quickBack" | "excessive" | "errors" | "errorClicks", number>> };

const SHARES: Record<string, keyof Raw["shares"]> = {
  DeadClickCount: "dead",
  RageClickCount: "rage",
  QuickbackClick: "quickBack",
  ExcessiveScroll: "excessive",
  ScriptErrorCount: "errors",
  ErrorClickCount: "errorClicks",
};

/**
 * Clarity's answer as totals, one row a page (when the ask is split by page),
 * device and source or browser (when split a third way). A share is turned
 * into the visits it is a share of, so it adds up across days; a page only
 * bots visited is left out, and across the website the bots are kept as
 * their own count.
 */
export function clarityTotalsFrom(json: unknown, dimension: ClarityAsk): ClarityTotalsRow[] {
  const metrics = Array.isArray(json) ? (json as Array<{ metricName?: string; information?: Info[] }>) : [];
  const split = dimension.includes("Source") ? sourceOf : dimension.includes("Browser") ? browserOf : null;
  const raws = new Map<string, Raw>();
  const rawOf = (info: Info) => {
    const page = dimension.startsWith("URL") ? pathOf(addressOf(info)) : null;
    const device = dimension.includes("Device") ? deviceOf(info) : ANY_DEVICE;
    const by = split ? split(info) : undefined;
    const key = totalsKey({ page, device, split: by });
    const held = raws.get(key) ?? { page, device, ...(by === undefined ? {} : { split: by }), sessions: 0, bots: 0, users: 0, pagesPerVisit: null, scroll: null, active: null, shares: {} };
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
      ...(raw.split === undefined ? {} : { split: raw.split }),
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

/**
 * A missed morning caught up (agents-and-clarity-plan.md, CC4): Clarity
 * answers for the last 24, 48 or 72 hours, never one day on its own, so the
 * day before yesterday is the two days' totals less yesterday's — visits
 * exactly, and the averages and shares with them, since every figure kept is
 * a total. A row Clarity's list held one way and not the other is left as it
 * is; no figure goes below nought.
 */
export function subtractTotalsRows(longer: readonly ClarityTotalsRow[], shorter: readonly ClarityTotalsRow[]): ClarityTotalsRow[] {
  const later = new Map(shorter.map((row) => [totalsKey(row), row]));
  const rows: ClarityTotalsRow[] = [];
  for (const row of longer) {
    const after = later.get(totalsKey(row));
    const day = { ...row };
    if (after) for (const figure of CLARITY_FIGURES) day[figure] = Math.max(0, row[figure] - after[figure]);
    if (day.visits > 0 || (day.page === null && day.bots > 0)) rows.push(day);
  }
  return rows.sort((a, b) => b.visits - a.visits);
}

/**
 * Fewer visits than this and a page's, a device's, a source's or a browser's
 * figures are too few to judge: shown greyed, with the reason on hover, and
 * never left out ("Finishing Parts 3 and 4", decision 4; CS9).
 */
export const CLARITY_FEW_VISITS = 10;

const nullableNumber = v.union(v.number(), v.null());

/**
 * Every measure a Clarity screen shows, worked out once from the totals: the
 * visits by people and by bots, the people, how far down a page is scrolled
 * and how long a visit is active on average, pages a visit, and each
 * frustration and error as visits and as a share of the visits — so the
 * Overview, Pages, a page's own screen and Errors can never disagree (CF4).
 */
export const clarityMeasuresValidator = v.object({
  visits: v.number(),
  bots: v.number(),
  users: v.number(),
  scroll: nullableNumber,
  activeSeconds: nullableNumber,
  pagesPerVisit: nullableNumber,
  quickBack: v.number(),
  dead: v.number(),
  rage: v.number(),
  excessive: v.number(),
  errors: v.number(),
  errorClicks: v.number(),
  /** Each of the six above as a share of the visits, 0 to 100, to a tenth; null with no visits. */
  shares: v.object({
    quickBack: nullableNumber,
    dead: nullableNumber,
    rage: nullableNumber,
    excessive: nullableNumber,
    errors: nullableNumber,
    errorClicks: nullableNumber,
  }),
});
export type ClarityMeasures = Infer<typeof clarityMeasuresValidator>;

export function measuresOf(totals: ClarityTotals): ClarityMeasures {
  const visits = totals.visits;
  const share = (count: number) => (visits > 0 ? oneDecimal((count / visits) * 100) : null);
  return {
    visits,
    bots: totals.bots,
    users: totals.users,
    scroll: visits > 0 ? oneDecimal(totals.scrollSum / SCROLL_STEP / visits) : null,
    activeSeconds: visits > 0 ? Math.round(totals.activeSum / visits) : null,
    pagesPerVisit: visits > 0 && totals.pagesSum > 0 ? oneDecimal(totals.pagesSum / PAGES_STEP / visits) : null,
    quickBack: totals.quickBack,
    dead: totals.dead,
    rage: totals.rage,
    excessive: totals.excessive,
    errors: totals.errors,
    errorClicks: totals.errorClicks,
    shares: {
      quickBack: share(totals.quickBack),
      dead: share(totals.dead),
      rage: share(totals.rage),
      excessive: share(totals.excessive),
      errors: share(totals.errors),
      errorClicks: share(totals.errorClicks),
    },
  };
}

/** Rows' totals added up into one: a website's, a page's across its devices, a source's. */
export function sumTotals(rows: Iterable<ClarityTotals>): ClarityTotals {
  const sum = emptyTotals();
  for (const row of rows) addTotals(sum, row);
  return sum;
}
