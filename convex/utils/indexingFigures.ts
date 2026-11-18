import { normalisePage } from "./pageClassification";
import { INDEXING_REASONS, kindOf, type ReasonKind } from "./indexingReasons";

/**
 * Indexing's figures, the plain parts (search-console-indexing-v1-plan-2026-11-18.md): Google's page checks beside the
 * clicks and impressions Search Console's page lists hold, added up for each reason, and the four boxes a reason's own
 * page shows for its kind. Plain code, so the screen's reads, Google's live answer, the screen, the eye and Ask Hakken
 * all add them up the same way. Only problems: Indexing works from the pages Google gave a reason for, never the pages
 * in Google (Anthony, 18 November 2026: "work from issues, not what is day to day normal").
 */

/** A page Google gave a reason for, as its check keeps it. */
export type ProblemPage = {
  page: string;
  address: string;
  title: string | null;
  reason: string;
  crawled: string | null;
  googleCanonical: string | null;
  inSitemap: boolean;
  linkedOwn: boolean;
};

/** One of Google's page rows: its link, and its figures for the dates. */
export type PageFigureRow = { key: string; clicks: number; impressions: number };

/** Google's page rows folded to the website's own pages, as its list of pages folds them (`normalisePage`), and their whole. */
export type FoldedFigures = { byPage: Map<string, { clicks: number; impressions: number }>; clicks: number; impressions: number };

export function foldPages(rows: readonly PageFigureRow[]): FoldedFigures {
  const byPage = new Map<string, { clicks: number; impressions: number }>();
  let clicks = 0;
  let impressions = 0;
  for (const row of rows) {
    const page = normalisePage(row.key);
    const held = byPage.get(page) ?? { clicks: 0, impressions: 0 };
    held.clicks += row.clicks;
    held.impressions += row.impressions;
    byPage.set(page, held);
    clicks += row.clicks;
    impressions += row.impressions;
  }
  return { byPage, clicks, impressions };
}

/** Figures already by the website's own page, as the reads send them: kept as they are, never folded again. */
export function byOwnPage(rows: ReadonlyArray<{ page: string; clicks: number; impressions: number }>, clicks: number, impressions: number): FoldedFigures {
  return { byPage: new Map(rows.map((row) => [row.page, { clicks: row.clicks, impressions: row.impressions }])), clicks, impressions };
}

/** One reason on the summary: its pages, their clicks and impressions for the dates, and the newest day Google visited one. */
export type ReasonRow = { reason: string; pages: number; clicks: number; impressions: number; crawled: string | null };

const newest = (values: ReadonlyArray<string | null | undefined>) => values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;

/** Every reason the website's pages have, the most pages first, then most clicks, then Google's own order. */
export function reasonRows(problems: readonly ProblemPage[], figures: FoldedFigures | null): ReasonRow[] {
  const rows = new Map<string, ReasonRow>();
  for (const page of problems) {
    const row = rows.get(page.reason) ?? { reason: page.reason, pages: 0, clicks: 0, impressions: 0, crawled: null };
    const own = figures?.byPage.get(page.page);
    row.pages += 1;
    row.clicks += own?.clicks ?? 0;
    row.impressions += own?.impressions ?? 0;
    row.crawled = newest([row.crawled, page.crawled]);
    rows.set(page.reason, row);
  }
  const order = (reason: string) => { const at = INDEXING_REASONS.findIndex((one) => one.words === reason); return at < 0 ? INDEXING_REASONS.length : at; };
  return [...rows.values()].sort((left, right) => right.pages - left.pages || right.clicks - left.clicks || order(left.reason) - order(right.reason));
}

/** A link as Google gives it: the http, bare or no-slash twin of a page is another page, as a redirect between them shows. */
const sameLink = (address: string) => address.trim();

/** The page Google shows in this one's place, where it chose another: its own page as the website's list names it. */
export function mainPageOf(page: { address: string; googleCanonical: string | null }): string | null {
  if (!page.googleCanonical || sameLink(page.googleCanonical) === sameLink(page.address)) return null;
  return page.googleCanonical;
}

/** A reason's page on its own screen: its check, its figures for the dates, and where Google sends it. */
export type ReasonPage = ProblemPage & {
  clicks: number;
  impressions: number;
  /** The page Google shows in its place, where it chose another. */
  main: string | null;
  /** That page is one Google has in its index, as the checks found it. */
  mainIndexed: boolean;
};

/** A reason's pages, the most impressions first. */
export function reasonPages(problems: readonly ProblemPage[], figures: FoldedFigures | null, mainIndexed: (page: string) => boolean): ReasonPage[] {
  return problems
    .map((page) => {
      const own = figures?.byPage.get(page.page);
      const main = mainPageOf(page);
      return { ...page, clicks: own?.clicks ?? 0, impressions: own?.impressions ?? 0, main, mainIndexed: main !== null && mainIndexed(normalisePage(main)) };
    })
    .sort((left, right) => right.impressions - left.impressions || right.clicks - left.clicks || left.page.localeCompare(right.page));
}

/** What the days kept say of a page: the last day Google showed it, and on how many of the days it did. */
export type PageShown = { lastShown: string | null; days: number };

/**
 * One of a reason's four boxes, as figures: the screen words each in the reader's language. `rest` is the reason's
 * other pages, for "The other 12 …"; `day` a day to name; `share` the whole clicks for "About 1 in 390".
 */
export type ReasonBox =
  | { key: "pages"; value: number; checked: number }
  | { key: "lastShown"; day: string | null; loading: boolean }
  | { key: "stillClicked"; value: number }
  | { key: "sitemap"; value: number; still: boolean }
  | { key: "clicks"; value: number; all: number }
  | { key: "lastVisited"; day: string | null }
  | { key: "picked"; value: number }
  | { key: "inGoogle"; value: number; rest: number }
  | { key: "linked"; value: number }
  | { key: "stillShown"; value: number | null; rest: number | null; month: string };

/**
 * The four boxes that matter for each kind of reason (the plan's "A reason's own page", item 2), worked out from Google's
 * answer for each page. `shown` is what the days kept say of each page, null while they load; `checked` every page with
 * an answer; `allClicks` the website's clicks for the dates; `month` the first day of this month.
 */
export function reasonBoxes(kind: ReasonKind, pages: readonly ReasonPage[], context: { checked: number; allClicks: number; month: string; shown: ReadonlyMap<string, PageShown> | null }): ReasonBox[] {
  const clicks = pages.reduce((sum, page) => sum + page.clicks, 0);
  const inSitemap = pages.filter((page) => page.inSitemap).length;
  const pagesBox: ReasonBox = { key: "pages", value: pages.length, checked: context.checked };
  const clicksBox: ReasonBox = { key: "clicks", value: clicks, all: context.allClicks };
  const visited: ReasonBox = { key: "lastVisited", day: newest(pages.map((page) => page.crawled)) };
  switch (kind) {
    case "error":
      return [
        pagesBox,
        { key: "lastShown", day: context.shown ? newest(pages.map((page) => context.shown?.get(page.page)?.lastShown)) : null, loading: context.shown === null },
        { key: "stillClicked", value: clicks },
        { key: "sitemap", value: inSitemap, still: true },
      ];
    case "keptOut":
      return [pagesBox, { key: "sitemap", value: inSitemap, still: false }, clicksBox, visited];
    case "duplicate": {
      const toIndexed = pages.filter((page) => page.mainIndexed).length;
      return [pagesBox, { key: "picked", value: pages.filter((page) => page.main !== null).length }, { key: "inGoogle", value: toIndexed, rest: pages.length - toIndexed }, clicksBox];
    }
    case "notChosen":
      return [pagesBox, { key: "sitemap", value: inSitemap, still: false }, { key: "linked", value: pages.filter((page) => page.linkedOwn).length }, visited];
    case "unknown": {
      // "In your sitemap" took the place of "Codes on the end" (Anthony, 18 November 2026: "You do it"). The checks ask only
      // the pages the website's own list holds, which drops codes after a "?", so that box could only ever say 0. A
      // sitemap listing pages Google has no record of is often why it doesn't know them.
      const stillShown = context.shown ? pages.filter((page) => (context.shown?.get(page.page)?.lastShown ?? "") >= context.month).length : null;
      return [
        pagesBox,
        { key: "stillShown", value: stillShown, rest: stillShown === null ? null : pages.length - stillShown, month: context.month },
        clicksBox,
        { key: "sitemap", value: inSitemap, still: false },
      ];
    }
  }
}

/** Each kind's columns in its Examples table, after the page: what tells its pages apart, then Clicks and Shown. */
export const EXAMPLE_COLUMNS: Record<ReasonKind, ReadonlyArray<"main" | "crawled" | "lastShown" | "days" | "clicks" | "shown">> = {
  error: ["crawled", "lastShown", "clicks", "shown"],
  keptOut: ["crawled", "clicks", "shown"],
  duplicate: ["main", "crawled", "clicks", "shown"],
  notChosen: ["crawled", "clicks", "shown"],
  unknown: ["lastShown", "days", "clicks", "shown"],
};

/** "About 1 in 390": the whole over the part, rounded to a figure easy to read. Null for no part, 1 or less for most. */
export function oneIn(all: number, part: number): number | null {
  if (part <= 0) return null;
  const ratio = all / part;
  if (ratio < 1.5) return 1;
  const step = ratio > 1000 ? 100 : ratio > 20 ? 10 : 1;
  return Math.max(2, Math.round(ratio / step) * step);
}

export { kindOf };
