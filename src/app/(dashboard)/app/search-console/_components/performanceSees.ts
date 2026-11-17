import { dotGroupOf } from "@/src/ui/components/screens/DotGroups";

/**
 * What Performance's charts hand its eye, beside the four boxes and the day chart
 * (search-console-performance-way-3-plan-2026-11-17.md; the rules are `convex/utils/sees/own/searchConsole.ts`):
 * where 100 clicks came from — brand searches, the others Google names and the ones it hides — each Classification's
 * clicks and impressions, each device's, each kind of rich result's, and the dots' group Google shows a lot but people
 * seldom click. Every name in the reader's own words, never a code or an id; pages not sorted yet are Hakken's
 * housekeeping, never a finding. Pure, so the page and the rules' test of every period
 * (`convex/utils/sees/searchConsolePeriods.test.ts`) build the very same figures.
 */

export type Brand = { brandClicks: number; nonBrandClicks: number; brandImpressions: number; nonBrandImpressions: number };
export type TopKeyword = { key: string; clicks: number; impressions: number; brand: boolean };
type Counted = { clicks: number; impressions: number };
type Short = Counted & { key: string };
type Kind = Counted & { kind: string; rows: number; previousClicks: number | null };

export const TIMES = ["half", "middle", "twice"] as const;
export type Times = (typeof TIMES)[number];
export const TIMES_BY: Record<Times, number> = { half: 0.5, middle: 1, twice: 2 };
export type DotChoice = { count: "impressions" | "clicks"; which: "other" | "all"; across: Times; up: Times };
/** The dots as the page opens: impressions across, brand searches left out, each line at the middle. */
export const OPENING_DOTS: DotChoice = { count: "impressions", which: "other", across: "middle", up: "middle" };

/** The middle value of a list: half the keywords are above it. */
function middleOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
}

/** The website's clicks for every 100 impressions, to one place, as the dots' menu says it. */
export const websiteRate = (totals: Counted | null) => (totals && totals.impressions > 0 ? Math.round((1000 * totals.clicks) / totals.impressions) / 10 : 0);

/** Where the dots' lines fall, and the groups they make, from the menus: shared by the chart and the eye. */
export function dotsOf<Row extends TopKeyword>(rows: readonly Row[], choice: DotChoice, siteRate: number) {
  const read = (row: Row) => (choice.count === "impressions" ? row.impressions : row.clicks);
  const list = rows.filter((row) => (choice.which === "all" || !row.brand) && read(row) > 0);
  const middle = middleOf(list.map(read));
  const line = Math.max(1, Math.round(middle * TIMES_BY[choice.across]));
  const rate = Math.round(siteRate * TIMES_BY[choice.up] * 10) / 10;
  const rateOf = (row: Row) => (row.impressions > 0 ? (100 * row.clicks) / row.impressions : 0);
  return { read, list, middle, line, rate, rateOf, groupOf: (row: Row) => dotGroupOf({ x: read(row), y: rateOf(row) }, { x: line, y: rate }) };
}

export type PerformanceRaw = {
  totals: Counted | null;
  previous: Counted | null;
  brand: { now: Brand; before: Brand | null } | null | undefined;
  kinds: readonly Kind[] | undefined;
  devices: readonly Short[] | undefined;
  looks: readonly Short[] | undefined;
  keywords: readonly TopKeyword[] | undefined;
};

export type PerformanceSeesNames = {
  /** A Classification's name, or null for pages not sorted yet. */
  kind: (key: string) => string | null;
  device: (key: string) => string;
  look: (key: string) => string;
  /** The dots' group Google shows a lot but people seldom click, as the chart's key names it. */
  quiet: (line: number, rate: number) => string;
};

/** Rows a split hands the eye: the biggest by impressions, as the squares name four and the bands six. */
const MOST = 6;
const sum = <Row>(rows: readonly Row[], read: (row: Row) => number) => rows.reduce((total, row) => total + read(row), 0);

/** The charts' figures for the eye, each split only once its read has answered. */
export function performanceSplits(raw: PerformanceRaw, names: PerformanceSeesNames): Record<string, unknown> {
  const splits: Record<string, unknown> = {};
  if (raw.brand && raw.totals) {
    const of = (brand: Brand, totals: Counted) => ({
      brand: brand.brandClicks,
      named: brand.nonBrandClicks,
      hidden: Math.max(0, totals.clicks - brand.brandClicks - brand.nonBrandClicks),
      all: totals.clicks,
    });
    splits.searches = { ...of(raw.brand.now, raw.totals), before: raw.brand.before && raw.previous ? of(raw.brand.before, raw.previous) : null };
  }
  if (raw.kinds && raw.kinds.length > 0) {
    const held = raw.kinds.every((kind) => kind.previousClicks !== null);
    const rows = [...raw.kinds]
      .flatMap((kind) => {
        const name = names.kind(kind.kind);
        return name ? [{ name, clicks: kind.clicks, clicksBefore: kind.previousClicks, impressions: kind.impressions }] : [];
      })
      .sort((left, right) => right.impressions - left.impressions)
      .slice(0, MOST);
    splits.classifications = {
      all: { clicks: sum(raw.kinds, (kind) => kind.clicks), impressions: sum(raw.kinds, (kind) => kind.impressions), clicksBefore: held ? sum(raw.kinds, (kind) => kind.previousClicks ?? 0) : null },
      rows,
    };
  }
  if (raw.devices && raw.devices.length > 0) splits.devices = raw.devices.map((row) => ({ name: names.device(row.key), clicks: row.clicks, impressions: row.impressions }));
  if (raw.looks && raw.looks.length > 0) splits.looks = [...raw.looks].sort((left, right) => right.impressions - left.impressions).slice(0, MOST).map((row) => ({ name: names.look(row.key), clicks: row.clicks, impressions: row.impressions }));
  if (raw.keywords && raw.keywords.length > 0) {
    const dots = dotsOf(raw.keywords, OPENING_DOTS, websiteRate(raw.totals));
    const quiet = dots.list.filter((row) => dots.groupOf(row) === "rightLow");
    splits.keywords = {
      drawn: dots.list.length,
      impressions: sum(dots.list, (row) => row.impressions),
      quiet: quiet.length > 0 ? { name: names.quiet(dots.line, dots.rate), keywords: quiet.length, impressions: sum(quiet, (row) => row.impressions), clicks: sum(quiet, (row) => row.clicks) } : null,
    };
  }
  return splits;
}
