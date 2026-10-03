import { normalisePage } from "./pageClassification";
import { pageTypeByAddress } from "./siteShapes";
import { onWebsite } from "./sitemapReading";

/**
 * Every page of a company's website once (docs/plans/active/page-groups-
 * plan.md, decision 4): what its sitemap lists, what the newest crawl
 * reached, what ranks on Google, and what Google showed in Search Console's
 * last 90 days — each address folded to its page with `normalisePage`, so
 * Google's jump links (`#…`), a query, a different case or the www twin all
 * count with the page they belong to. Files — a PDF, an image — are left
 * out wherever they come from (`isWebPage`): the list is pages only.
 *
 * Plain code, no Convex: the rebuild (`holdPages.ts`) reads the four sources
 * and hands them here, and the screen's filters use the same gap rules
 * (`inGap`), so the figures and the lists they open can never disagree.
 */

export type PageSources = {
  host: string;
  /** The website's sitemap pages, already folded, in the order read. */
  sitemap: ReadonlyArray<{ page: string; file: string }>;
  /** This company's `sitemapPagesRead`: its list holds the first this many sitemap pages of the shared reading. */
  sitemapLimit: number;
  /** The newest crawl's pages. Only its HTML pages count: a redirect or a broken page is not a page of the website. */
  crawled: ReadonlyArray<{ url: string; resourceType?: string; statusCode?: number }>;
  /** The pages ranking on Google, from the place the company watches from. */
  ranked: ReadonlyArray<{ page: string; url?: string; pageType?: string }>;
  /** Search Console's page list for the last 90 days, by address, or null when the company has not connected it. */
  shown: ReadonlyArray<{ key: string; clicks: number }> | null;
  /** Kinds judged for the website's pages (`sitePageTypes`). */
  judged: ReadonlyArray<{ page: string; pageType: string }>;
};

export type JoinedPage = {
  page: string;
  sitemapFile: string | null;
  crawled: boolean;
  shown: boolean;
  clicks: number;
  ranks: boolean;
  /** Hakken's own kind of page: by its address, else as judged, else "UNJUDGED". */
  pageType: string;
};

/** The four figures and the four gaps, counted once at the rebuild so the screen never counts rows. */
export type PageCounts = {
  pages: number;
  sitemap: number;
  crawled: number;
  shown: number;
  ranking: number;
  neverShown: number;
  notInSitemap: number;
  crawledNotInSitemap: number;
  notCrawled: number;
};

/** The four figures, each a filter of the list. */
export const FIGURE_KEYS = ["sitemap", "crawled", "shown", "ranking"] as const;

/** Where the sources disagree (decision 4, "filters for the gaps"). */
export const GAP_KEYS = ["neverShown", "notInSitemap", "crawledNotInSitemap", "notCrawled"] as const;

export type PageFilter = (typeof FIGURE_KEYS)[number] | (typeof GAP_KEYS)[number];

type Flags = Pick<JoinedPage, "sitemapFile" | "crawled" | "shown" | "ranks">;

/** Whether a page is in a figure or a gap: the one rule the counts, the filters and the download share. */
export function inGap(row: Flags, key: PageFilter): boolean {
  const listed = row.sitemapFile !== null;
  switch (key) {
    case "sitemap": return listed;
    case "crawled": return row.crawled;
    case "shown": return row.shown;
    case "ranking": return row.ranks;
    // In the sitemap, but Google never showed it in the 90 days.
    case "neverShown": return listed && !row.shown;
    // Google showed it, but the sitemap leaves it out.
    case "notInSitemap": return row.shown && !listed;
    case "crawledNotInSitemap": return row.crawled && !listed;
    // In the sitemap, but the crawl did not reach it.
    case "notCrawled": return listed && !row.crawled;
  }
}

/**
 * Files Google or a sitemap can list beside a website's pages — a PDF, an
 * image, a document, a video — which are not pages (his call, 2026-10-03:
 * "pages only"). Known file endings only, so an address like `/node.js-guide`
 * or `/v2.0/` still counts as the page it is.
 */
const FILE_ENDINGS = new Set([
  "pdf", "jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "ico", "bmp", "tif", "tiff",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "rtf", "odt", "ods", "odp",
  "mp4", "mov", "webm", "avi", "mp3", "wav", "m4a", "zip", "rar", "gz", "7z", "xml",
  "woff", "woff2", "ttf", "otf", "eot",
]);

/** Whether an address is a page of the website rather than a file on it. */
export function isWebPage(address: string): boolean {
  const last = normalisePage(address).split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  return dot < 0 || !FILE_ENDINGS.has(last.slice(dot + 1));
}

/** A crawled page that is a page: HTML, or a row from before the crawl said what it was, answering 2xx. */
export function isCrawledPage(row: { resourceType?: string; statusCode?: number }): boolean {
  if (row.resourceType !== undefined) return row.resourceType === "html";
  return row.statusCode === undefined || (row.statusCode >= 200 && row.statusCode < 300);
}

export function emptyCounts(): PageCounts {
  return { pages: 0, sitemap: 0, crawled: 0, shown: 0, ranking: 0, neverShown: 0, notInSitemap: 0, crawledNotInSitemap: 0, notCrawled: 0 };
}

/** Count rows into the figures and gaps. */
export function countPages(rows: ReadonlyArray<Flags>): PageCounts {
  const counts = emptyCounts();
  for (const row of rows) {
    counts.pages += 1;
    for (const key of [...FIGURE_KEYS, ...GAP_KEYS]) if (inGap(row, key)) counts[key] += 1;
  }
  return counts;
}

/**
 * Join the sources into every page once, A to Z, with the counts. `heldCut`
 * is whether this company's limit held its list to fewer sitemap pages than
 * the shared reading kept.
 */
export function joinHoldPages(sources: PageSources): { pages: JoinedPage[]; counts: PageCounts; heldCut: boolean } {
  const byPage = new Map<string, JoinedPage>();
  const entry = (page: string): JoinedPage => {
    let held = byPage.get(page);
    if (!held) {
      held = { page, sitemapFile: null, crawled: false, shown: false, clicks: 0, ranks: false, pageType: "UNJUDGED" };
      byPage.set(page, held);
    }
    return held;
  };

  const limit = Math.max(0, Math.floor(sources.sitemapLimit));
  let listed = 0;
  let heldCut = false;
  for (const row of sources.sitemap) {
    if (!isWebPage(row.page)) continue;
    const page = normalisePage(row.page);
    const held = byPage.get(page);
    if (held?.sitemapFile) continue;
    if (listed >= limit) {
      heldCut = true;
      break;
    }
    entry(page).sitemapFile = row.file;
    listed += 1;
  }
  for (const row of sources.crawled) {
    if (!isCrawledPage(row) || !onWebsite(row.url, sources.host)) continue;
    entry(normalisePage(row.url)).crawled = true;
  }
  const rankedKinds = new Map<string, string>();
  for (const row of sources.ranked) {
    const address = row.url ?? row.page;
    if (!onWebsite(address, sources.host) || !isWebPage(address)) continue;
    const page = normalisePage(address);
    entry(page).ranks = true;
    if (row.pageType && row.pageType !== "UNJUDGED") rankedKinds.set(page, row.pageType);
  }
  for (const row of sources.shown ?? []) {
    if (!onWebsite(row.key, sources.host) || !isWebPage(row.key)) continue;
    const held = entry(normalisePage(row.key));
    held.shown = true;
    held.clicks += row.clicks;
  }

  const judged = new Map(sources.judged.map((row) => [normalisePage(row.page), row.pageType]));
  const pages = [...byPage.values()].sort((left, right) => left.page.localeCompare(right.page));
  for (const row of pages) {
    row.pageType = pageTypeByAddress(row.page) ?? judged.get(row.page) ?? rankedKinds.get(row.page) ?? "UNJUDGED";
    row.clicks = Math.round(row.clicks);
  }
  return { pages, counts: countPages(pages), heldCut };
}
