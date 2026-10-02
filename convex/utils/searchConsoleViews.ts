/**
 * How the Search Console lists are shaped and narrowed
 * (docs/plans/active/search-console-plan.md §13): a ready-made period's rows
 * — or Google's answer for other dates — turned into the rows a table shows,
 * then each page's own rule ("view") applied, then the filters chosen. Pure,
 * so the server shapes a ready-made period with it and the page a live
 * answer with the same rules, and both are tested on their own.
 */

import { wordStartMatcher } from "./wordStarts";

export type Band = "1-3" | "4-10" | "11-20" | "21-50" | "51+";
export const BANDS: readonly Band[] = ["1-3", "4-10", "11-20", "21-50", "51+"];

/** Google's average position in its band, read as given: 10.7 is 11–20, 9.8 is 4–10. */
export const bandOf = (position: number): Band =>
  position <= 3 ? "1-3" : position <= 10 ? "4-10" : position <= 20 ? "11-20" : position <= 50 ? "21-50" : "51+";

/**
 * A page's own rule for what it lists (§13.3):
 * - `almost` — keywords at positions 4 to 20 (Almost there);
 * - `lowCtr` — pages clicked less than the website's own click rate at their position (Shown but not clicked);
 * - `competing` — keywords two or more of the website's pages were shown for (Pages competing);
 * - `moves` — keywords whose clicks changed on the period before (Wins and losses);
 * - `missed` — keywords many search for that Google barely shows the website for, or not yet tracked (Missed demand);
 * - `estimates` — pages with Sites' estimated visits beside Google's clicks (Real against estimated).
 */
export const VIEWS = ["all", "almost", "lowCtr", "competing", "moves", "missed", "estimates"] as const;
export type View = (typeof VIEWS)[number];

/** The list a view reads, whatever the page asked. */
export const VIEW_LIST: Partial<Record<View, "query" | "page">> = {
  almost: "query",
  lowCtr: "page",
  competing: "query",
  moves: "query",
  missed: "query",
  estimates: "page",
};

/** Positions the website's own click rate is worked out for (Click rate by position). */
export const CURVE_POSITIONS = 20;
/** Missed demand: "barely shown" is fewer impressions than this in the dates chosen (the drawing's "Fewer than 50"). */
export const BARELY_SHOWN = 50;
/** Missed demand: "searched a lot" is at least this many searches a month, from Sites. */
export const SEARCHED_A_LOT = 100;
/** Real against estimated: an estimate this far from Google's clicks, either way, is too high or too low ("By more than a quarter"). */
export const ESTIMATE_OFF = 0.25;

export type Verdict = "high" | "low" | "close";

export type ListRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  band: Band;
  /** Its clicks in the period before; null when it had none there, or those days are not held. */
  previousClicks: number | null;
  /** Clicks gained or lost on the period before; null when those days are not held. */
  change: number | null;
  /** Its position in the period before, where it had one. */
  previousPosition: number | null;
  /** Places it rose (positive) or fell on the period before; null without one before. */
  positionChange: number | null;
  /** Its share of every row's clicks. */
  share: number;
  /** A keyword: how many of the website's pages it brought people to. A page: how many keywords. */
  count: number | null;
  /** A keyword's top page, or a page's top keyword. */
  top: string | null;
  /** On the company's tracked list. */
  tracked: boolean;
  /** A keyword's intent or a page's type, as Sites judged it. */
  kind: string | null;
  /** A keyword's searches a month, from Sites. */
  volume: number | null;
  /** A page's estimated visits a month, from Sites. */
  estimate: number | null;
  /** A keyword using one of the website's brand words; null for a page. */
  brand: boolean | null;
  /** Shown but not clicked: the website's own click rate at its position, and the clicks it would have had at it. */
  usualCtr: number | null;
  expected: number | null;
  /** Pages competing: the page with the most clicks' share, the next page and its share. */
  topShare: number | null;
  next: string | null;
  nextShare: number | null;
  /** Real against estimated: the estimate against Google's clicks. */
  verdict: Verdict | null;
  /** Estimate less clicks: above nothing, too high. */
  gap: number | null;
};

/** A row of a list as kept or asked: figures as sums, and what is known beside them. */
export type SourceRow = {
  key: string;
  clicks: number;
  impressions: number;
  positionSum: number;
  count?: number;
  top?: string;
  kind?: string;
  volume?: number;
  estimate?: number;
};

const known = (value: number | undefined) => (value === undefined || value < 0 ? null : value);
const positionOf = (row: { impressions: number; positionSum: number }) => (row.impressions > 0 ? row.positionSum / row.impressions : 0);

/** Whether a keyword uses any of the website's brand words, as written or misspelt in its Profile. */
export function isBrand(keyword: string, brandWords: readonly string[]): boolean {
  const text = keyword.toLowerCase();
  return brandWords.some((word) => word.trim() !== "" && text.includes(word.trim().toLowerCase()));
}

/** Rows as a list shows them: the figures, the change on the period before, the share, tracked or not. */
export function shapeRows(
  now: readonly SourceRow[],
  before: readonly SourceRow[] | null,
  context: { tracked: ReadonlySet<string>; brandWords: readonly string[] | null },
): ListRow[] {
  const earlier = before ? new Map(before.map((row) => [row.key, row])) : null;
  const total = now.reduce((sum, row) => sum + row.clicks, 0);
  return now.map((row) => {
    const was = earlier?.get(row.key) ?? null;
    const position = positionOf(row);
    const previousPosition = was && was.impressions > 0 ? positionOf(was) : null;
    return {
      key: row.key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
      position,
      band: bandOf(position),
      previousClicks: earlier ? (was?.clicks ?? null) : null,
      change: earlier ? row.clicks - (was?.clicks ?? 0) : null,
      previousPosition,
      positionChange: previousPosition === null ? null : previousPosition - position,
      share: total > 0 ? row.clicks / total : 0,
      count: row.count ?? null,
      top: row.top ?? null,
      tracked: context.tracked.has(row.key),
      kind: row.kind ?? null,
      volume: known(row.volume),
      estimate: known(row.estimate),
      brand: context.brandWords ? isBrand(row.key, context.brandWords) : null,
      usualCtr: null,
      expected: null,
      topShare: null,
      next: null,
      nextShare: null,
      verdict: null,
      gap: null,
    };
  });
}

export type CurvePoint = { position: number; keywords: number; impressions: number; clicks: number; ctr: number };

/** The website's own click rate at each whole position, 1 to 20, from its keywords (Click rate by position). */
export function ctrCurve(keywords: readonly { clicks: number; impressions: number; position: number }[]): CurvePoint[] {
  const points = new Map<number, CurvePoint>();
  for (const row of keywords) {
    const at = Math.round(row.position);
    if (at < 1 || at > CURVE_POSITIONS || row.impressions <= 0) continue;
    const point = points.get(at) ?? { position: at, keywords: 0, impressions: 0, clicks: 0, ctr: 0 };
    point.keywords += 1;
    point.impressions += row.impressions;
    point.clicks += row.clicks;
    points.set(at, point);
  }
  return [...points.values()]
    .map((point) => ({ ...point, ctr: point.impressions > 0 ? point.clicks / point.impressions : 0 }))
    .sort((left, right) => left.position - right.position);
}

/** A keyword's pages, most clicks first: for Pages competing. */
export type PairPages = Map<string, { page: string; clicks: number; impressions: number }[]>;

export function pagesByKeyword(pairs: readonly { key: string; page?: string; clicks: number; impressions: number }[]): PairPages {
  const out: PairPages = new Map();
  for (const pair of pairs) {
    const pages = out.get(pair.key) ?? [];
    pages.push({ page: pair.page ?? "", clicks: pair.clicks, impressions: pair.impressions });
    out.set(pair.key, pages);
  }
  for (const pages of out.values()) {
    pages.sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions || left.page.localeCompare(right.page));
  }
  return out;
}

/** A keyword Sites holds for the website that Google barely shows it for: Missed demand. */
export type SitesKeyword = { keyword: string; volume: number; kind: string };

export type ViewContext = {
  curve?: readonly CurvePoint[];
  pages?: PairPages;
  /** Missed demand's first list: the website's most-searched keywords in Sites. */
  sitesKeywords?: readonly SitesKeyword[];
  missedList?: "searched" | "untracked";
};

/** Each view's rows: the rows it lists, with the figures it adds. */
export function applyView(view: View, rows: ListRow[], context: ViewContext = {}): ListRow[] {
  switch (view) {
    case "almost":
      return rows.filter((row) => row.position > 3 && row.position <= 20);
    case "lowCtr": {
      const curve = new Map((context.curve ?? []).map((point) => [point.position, point.ctr]));
      return rows.flatMap((row) => {
        const usual = curve.get(Math.round(row.position));
        if (usual === undefined) return [];
        const expected = Math.round(row.impressions * usual);
        return row.clicks < expected ? [{ ...row, usualCtr: usual, expected }] : [];
      });
    }
    case "competing":
      return rows.flatMap((row) => {
        const pages = context.pages?.get(row.key) ?? [];
        if (pages.length < 2) return [];
        const clicks = pages.reduce((sum, page) => sum + page.clicks, 0);
        return [{
          ...row,
          count: pages.length,
          top: pages[0].page,
          topShare: clicks > 0 ? pages[0].clicks / clicks : null,
          next: pages[1].page,
          nextShare: clicks > 0 ? pages[1].clicks / clicks : null,
        }];
      });
    case "moves":
      return rows.filter((row) => row.change !== null && row.change !== 0);
    case "missed": {
      if (context.missedList === "untracked") return rows.filter((row) => !row.tracked);
      const shown = new Map(rows.map((row) => [row.key, row]));
      return (context.sitesKeywords ?? []).flatMap((keyword) => {
        if (keyword.volume < SEARCHED_A_LOT) return [];
        const row = shown.get(keyword.keyword);
        if (row && row.impressions >= BARELY_SHOWN) return [];
        return [row
          ? { ...row, volume: keyword.volume, kind: row.kind ?? keyword.kind }
          : { ...emptyRow(keyword.keyword), volume: keyword.volume, kind: keyword.kind, tracked: false }];
      });
    }
    case "estimates":
      return rows.flatMap((row) => {
        if (row.estimate === null) return [];
        const gap = row.estimate - row.clicks;
        const verdict: Verdict = Math.abs(gap) > ESTIMATE_OFF * row.clicks ? (gap > 0 ? "high" : "low") : "close";
        return [{ ...row, gap: verdict === "close" ? 0 : gap, verdict }];
      });
    default:
      return rows;
  }
}

/** A keyword Google did not show the website for at all in the dates chosen. */
function emptyRow(key: string): ListRow {
  return {
    key, clicks: 0, impressions: 0, ctr: 0, position: 0, band: "51+", previousClicks: null, change: null, previousPosition: null,
    positionChange: null, share: 0, count: null, top: null, tracked: false, kind: null, volume: null, estimate: null, brand: null,
    usualCtr: null, expected: null, topShare: null, next: null, nextShare: null, verdict: null, gap: null,
  };
}

export type Filters = {
  q?: string;
  tracked?: "yes" | "no";
  band?: Band;
  /** An intent or a page type, as Sites words them. */
  kind?: string;
  brand?: "yes" | "no";
  move?: "win" | "loss";
  verdict?: Verdict;
};

/** The rows the filters chosen keep. */
export function filterRows(rows: readonly ListRow[], filters: Filters): ListRow[] {
  const matches = wordStartMatcher(filters.q?.trim().toLowerCase());
  return rows.filter((row) =>
    (!matches || matches(row.key))
    && (!filters.tracked || (filters.tracked === "yes") === row.tracked)
    && (!filters.band || row.band === filters.band)
    && (!filters.kind || row.kind === filters.kind)
    && (!filters.brand || (filters.brand === "yes") === (row.brand === true))
    && (!filters.move || (filters.move === "win" ? (row.change ?? 0) > 0 : (row.change ?? 0) < 0))
    && (!filters.verdict || row.verdict === filters.verdict));
}
