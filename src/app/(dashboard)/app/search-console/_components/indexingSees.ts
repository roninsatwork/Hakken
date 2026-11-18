import { kindOf, reasonOf, type ReasonKind } from "@/convex/utils/indexingReasons";
import { oneIn, type ReasonBox, type ReasonPage } from "@/convex/utils/indexingFigures";

/**
 * Indexing's figures as the screens and their eye hold them (search-console-indexing-v1-plan-2026-11-18.md): the
 * summary's rows, worked out once from the checks and the dates' clicks, and what each page hands What Hakken sees, by
 * the names the page says them by. Plain code, so the page and the tests of every period build them the same way.
 */

/** A reason as the summary's table lists it, in the reader's words. */
export type IndexingRow = {
  key: string;
  /** Google's term, in the reader's language; Google's own words for a reason not on the list. */
  name: string;
  short: string;
  means: string;
  source: string;
  slug: string;
  kind: ReasonKind;
  pages: number;
  inSitemap: number;
  clicks: number;
  impressions: number;
  crawled: string | null;
};

/** What a reason is called, in the reader's words: Google's term, its short name, its plain line and its Source. */
export type ReasonNames = { name: string; short: string; means: string; source: string };

type SummaryReason = { reason: string; pages: number; inSitemap: number; crawled: string | null };
type SummaryFigures = { clicks: number; impressions: number; byReason: ReadonlyArray<{ reason: string; clicks: number; impressions: number }> } | null;

/** The summary's rows: each reason with its pages, and its clicks for the dates once they're in. The most pages first. */
export function indexingRows(reasons: readonly SummaryReason[], figures: SummaryFigures, namesOf: (words: string) => ReasonNames, slugOf: (words: string) => string): IndexingRow[] {
  const byReason = new Map((figures?.byReason ?? []).map((one) => [one.reason, one]));
  return reasons.map((one) => ({
    key: one.reason,
    ...namesOf(one.reason),
    slug: slugOf(one.reason),
    kind: kindOf(one.reason),
    pages: one.pages,
    inSitemap: one.inSitemap,
    clicks: byReason.get(one.reason)?.clicks ?? 0,
    impressions: byReason.get(one.reason)?.impressions ?? 0,
    crawled: one.crawled,
  }));
}

/** The summary's four boxes, as figures. */
export type IndexingBoxes = {
  notIndexed: number;
  reasons: number;
  indexed: number;
  biggest: IndexingRow | null;
  clicks: number;
  allClicks: number | null;
  /** "About 1 in 390": null for none, 1 for most of them. */
  oneIn: number | null;
};

export function indexingBoxes(rows: readonly IndexingRow[], indexed: number, allClicks: number | null): IndexingBoxes {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  return {
    notIndexed: rows.reduce((sum, row) => sum + row.pages, 0),
    reasons: rows.length,
    indexed,
    // "The biggest reason" only when it has more pages than the next: More Handles' first checks gave four reasons a
    // page each, and the box named one of them the biggest (18 November 2026).
    biggest: rows[0] && !(rows[1] && rows[1].pages >= rows[0].pages) ? rows[0] : null,
    clicks,
    allClicks,
    oneIn: allClicks === null ? null : oneIn(allClicks, clicks),
  };
}

/** The kinds whose pages Google won't show though the website asks: kept out, or Google chose not to. */
const UNSHOWN_KINDS: ReadonlySet<ReasonKind> = new Set(["keptOut", "notChosen"]);

/**
 * What Indexing hands its eye (`searchConsole.indexing`): the boxes, each reason with its pages, its share of the pages
 * not indexed and its clicks, the pages that still get clicks, the sitemap's pages Google won't show, and each reason a
 * week before once a week is kept — every one named as the page names it.
 */
export function indexingPageData(input: {
  rows: readonly IndexingRow[];
  boxes: IndexingBoxes;
  clickedPages: ReadonlyArray<{ name: string; reason: string; clicks: number; impressions: number }>;
  weekBefore: ReadonlyArray<{ reason: string; pages: number }> | null;
  names: { notIndexed: string; clicks: string; sitemap: string };
}): Record<string, unknown> {
  const { rows, boxes } = input;
  const nameOfReason = new Map(rows.map((row) => [row.key, row.name]));
  const before = input.weekBefore ? new Map(input.weekBefore.map((one) => [one.reason, one.pages])) : null;
  return {
    boxes: { notIndexed: boxes.notIndexed, reasons: boxes.reasons, indexed: boxes.indexed, clicksNotIndexed: boxes.clicks, allClicks: boxes.allClicks },
    notIndexed: { name: input.names.notIndexed, pages: boxes.notIndexed, indexed: boxes.indexed },
    clicked: { name: input.names.clicks, clicks: boxes.clicks, allClicks: boxes.allClicks },
    reasons: rows.map((row) => ({
      name: row.name,
      kind: row.kind,
      pages: row.pages,
      clicks: row.clicks,
      impressions: row.impressions,
      inSitemap: row.inSitemap,
      ...(before ? { pagesBefore: before.get(row.key) ?? 0 } : {}),
    })),
    sitemap: { name: input.names.sitemap, pages: rows.filter((row) => UNSHOWN_KINDS.has(row.kind)).reduce((sum, row) => sum + row.inSitemap, 0), of: boxes.notIndexed },
    clickedPages: input.clickedPages.map((page) => ({ name: page.name, reason: nameOfReason.get(page.reason) ?? page.reason, clicks: page.clicks, impressions: page.impressions })),
    names: { notIndexed: input.names.notIndexed },
  };
}

/** A page as Indexing names it: the home page, its title before any "|" where no other page shares it, else its path. */
export function pageNameOf(page: { page: string; title: string | null }, titles: ReadonlyMap<string, number>, home: string): string {
  if (page.page === "/") return home;
  const cut = page.title?.split("|")[0].trim();
  return cut && (titles.get(cut) ?? 0) === 1 ? cut : page.page;
}

/** How many pages share each title before its "|". */
export function titleCounts(pages: ReadonlyArray<{ title: string | null }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const cut = page.title?.split("|")[0].trim();
    if (cut) counts.set(cut, (counts.get(cut) ?? 0) + 1);
  }
  return counts;
}

/**
 * What a reason's own page hands its eye (`searchConsole.indexingReason`): its four boxes, and its pages with their
 * clicks and impressions, the most impressions first, by the names the page says them by.
 */
export function reasonPageData(input: {
  reason: ReasonNames & { kind: ReasonKind };
  pages: readonly ReasonPage[];
  boxes: readonly ReasonBox[];
  nameOf: (page: ReasonPage) => string;
  names: { pages: string };
}): Record<string, unknown> {
  return {
    reason: { name: input.reason.name, means: input.reason.means, kind: input.reason.kind, pages: input.pages.length },
    boxes: Object.fromEntries(input.boxes.map((box) => [box.key, box])),
    pages: input.pages.map((page) => ({ name: input.nameOf(page), clicks: page.clicks, impressions: page.impressions, crawled: page.crawled, inSitemap: page.inSitemap })),
    names: input.names,
  };
}

/** Whether Google's words are a reason on the list. */
export const listed = (words: string) => reasonOf(words) !== null;
