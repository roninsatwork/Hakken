import type { ServerWords } from "../serverWords";
import { appearanceName, type SearchConsoleFormats } from "./searchConsoleWords";

/**
 * What Search Console's Click rate by position, Google updates, New and lost and Rich results hand their eye, each built
 * in one place for the screen and for a chat app's question (`chatAppEyes/searchConsole.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). `t` is `searchConsole`: the reader's words on the screen,
 * English on the server.
 */

// ---------------------------------------------------------------------------
// Click rate by position
// ---------------------------------------------------------------------------

type CurvePoint = { position: number; keywords: number; impressions: number; clicks: number; ctr: number };

/**
 * The curve, each position named as the reader says it ("Position 3", never a place), the same curve over the span
 * before where it is kept (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6: "the span before's curve"), and
 * mobile and desktop at each position, as the chart sets them side by side (20 November 2026).
 */
export function curveEyeData<Point extends CurvePoint>(reads: {
  points: readonly Point[] | undefined;
  before: readonly Point[] | null;
  devices: { mobile: readonly Point[]; desktop: readonly Point[] } | null | undefined;
}, t: ServerWords) {
  const { points, before, devices } = reads;
  if (!points) return undefined;
  const placed = (list: readonly Point[]) => list.map((point) => ({ ...point, name: t("ctrCurve.position", { position: point.position }) }));
  return {
    points: placed(points),
    before: before ? placed(before) : null,
    devices: devices ? { mobile: placed(devices.mobile), desktop: placed(devices.desktop) } : null,
    names: {
      firstPage: t("sees.firstPage"), secondPage: t("sees.secondPage"), topThree: t("ctrCurve.boxes.top3"), fourToTen: t("ctrCurve.boxes.first"),
      mobile: t("places.deviceNames.MOBILE"), desktop: t("places.deviceNames.DESKTOP"),
    },
  };
}

// ---------------------------------------------------------------------------
// Google updates
// ---------------------------------------------------------------------------

/** An update as Google updates' read answers it. */
type UpdateRead = {
  id: string;
  title: string;
  startedOn: string;
  finishedOn: string | null;
  state: "done" | "rolling" | "waiting";
  before: { clicks: number; position: number } | null;
  after: { clicks: number; position: number } | null;
};

/** An update as the table lists it: its days before and after, and its volatility before and while it rolled out. */
export type UpdateRow = {
  key: string;
  title: string;
  startedOn: string;
  finishedOn: string | null;
  state: "done" | "rolling" | "waiting";
  beforeClicks: number | null;
  afterClicks: number | null;
  change: number | null;
  beforePosition: number | null;
  afterPosition: number | null;
  moved: number | null;
  /** Volatility the 14 days before it began → while it rolled out (search-console-volatility-plan.md §2.2). */
  volatilityBefore: number | null;
  volatilityDuring: number | null;
};

const volatilityOf = (update: object): { before: number | null; during: number | null } | undefined =>
  "volatility" in update ? (update as { volatility?: { before: number | null; during: number | null } }).volatility : undefined;

/** Each update as the table lists it. */
export function updateRowsOf(updates: readonly UpdateRead[]): UpdateRow[] {
  return updates.map((update) => ({
    key: update.id,
    title: update.title,
    startedOn: update.startedOn,
    finishedOn: update.finishedOn,
    state: update.state,
    beforeClicks: update.before?.clicks ?? null,
    afterClicks: update.after?.clicks ?? null,
    change: update.before && update.after ? update.after.clicks - update.before.clicks : null,
    beforePosition: update.before?.position ?? null,
    afterPosition: update.after?.position ?? null,
    moved: update.before && update.after ? update.before.position - update.after.position : null,
    volatilityBefore: volatilityOf(update)?.before ?? null,
    volatilityDuring: volatilityOf(update)?.during ?? null,
  }));
}

/**
 * Every update in the dates with its days before and after, and the dates' own days and totals against the span before,
 * so a move with no update in the dates reads as the website's own.
 */
export function updatesEyeData(reads: { rows: readonly UpdateRow[] | undefined; days: unknown }, t: ServerWords) {
  if (!reads.rows) return undefined;
  return { updates: reads.rows, days: reads.days ?? null, names: { beforeIt: t("sees.beforeIt") } };
}

// ---------------------------------------------------------------------------
// New and lost
// ---------------------------------------------------------------------------

type NewLostRead<Row> = {
  counts: unknown;
  countsBefore?: unknown;
  watchedFrom: string | null;
  bands?: unknown;
  periods: ReadonlyArray<{ start: string; lastDay: string; gained: number; lost: number }>;
  rows: readonly Row[];
};

/**
 * The four counts against the span before's, where on Google the new and lost sit, and the chart's days, weeks or months
 * (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6), each named as the chart names it, so a day that lost far
 * more than the rest is said by its date; by their first day (`day`) too, so the eye keeps a month's newest days.
 */
export function newLostEyeData<Row>(reads: { result: NewLostRead<Row> | null | undefined; rows: readonly Row[] | null; step: "day" | "week" | "month" }, t: ServerWords, formats: Pick<SearchConsoleFormats, "shortDay" | "month">) {
  const { result, step } = reads;
  if (!result) return undefined;
  return {
    counts: result.counts,
    countsBefore: result.countsBefore ?? null,
    watchedFrom: result.watchedFrom,
    bands: result.bands ?? null,
    periods: result.periods.map((period) => ({ ...period, day: period.start, name: step === "month" ? formats.month(period.start.slice(0, 7)) : formats.shortDay(period.start) })),
    rows: reads.rows,
    picked: true,
    names: { lostFirstPage: t("sees.lostFirstPage"), newFirstPage: t("sees.newFirstPage") },
  };
}

// ---------------------------------------------------------------------------
// Rich results
// ---------------------------------------------------------------------------

/** A kind of rich result as the table lists it. */
export type AppearanceRow = { key: string; name: string; clicks: number; impressions: number; ctr: number; position: number; pages: number | null; counted: boolean; previousClicks: number | null; change: number | null };

type AppearanceRead = { key: string; clicks: number; impressions: number; ctr: number; position: number; previousClicks?: number | null; count: number | null };

/**
 * Each kind of rich result as the table lists it, by its name in the reader's words. A ready-made list counts each kind's
 * pages after each collection (`countedReady`: a negative count for a kind past those counted); otherwise they are asked
 * of Google (`pagesOf`, undefined while on their way).
 */
export function appearanceRowsOf(appearances: readonly AppearanceRead[] | undefined, countedReady: boolean, pagesOf: ReadonlyMap<string, number> | undefined, t: ServerWords): AppearanceRow[] | undefined {
  const known = (key: string) => (t.has(`appearance.names.${key}`) ? t(`appearance.names.${key}`) : null);
  return appearances?.map((row) => {
    const counted = countedReady ? (row.count ?? 0) >= 0 : pagesOf === undefined || pagesOf.has(row.key);
    return {
      key: row.key,
      name: appearanceName(row.key, known),
      previousClicks: row.previousClicks ?? null,
      change: row.previousClicks === null || row.previousClicks === undefined ? null : row.clicks - row.previousClicks,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      pages: !counted ? null : countedReady ? row.count : (pagesOf?.get(row.key) ?? null),
      counted,
    };
  });
}

/**
 * Each kind with its clicks against the span before, every click the website had (the boxes'), the last six months, and
 * every page Google showed in the country chosen, as Pages counts them. Undefined until the kinds and the boxes are in.
 */
export function appearanceEyeData(reads: {
  rows: readonly AppearanceRow[] | undefined;
  performance: { totals: unknown; previous: unknown } | null | undefined;
  months: { months: ReadonlyArray<{ month: string }> } | null | undefined;
  pagesShown: number | null;
}, t: ServerWords, formats: Pick<SearchConsoleFormats, "month">) {
  const { rows, performance, months } = reads;
  if (!rows || !performance) return undefined;
  return {
    kinds: rows.map((row) => ({ name: row.name, clicks: row.clicks, previousClicks: row.previousClicks, impressions: row.impressions, position: row.position, pages: row.pages })),
    totals: performance.totals ?? null,
    previous: performance.previous ?? null,
    months: months ? months.months.map((month) => ({ ...month, name: formats.month(month.month.slice(0, 7)) })) : null,
    pagesShown: reads.pagesShown,
    names: { plain: t("appearance.months.plain"), rich: t("appearance.title") },
  };
}
