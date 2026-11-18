import { isNumber, isRow, moved, named, partOf, rowsOf, type OwnFound, type Row } from "./shared";

// ---------------------------------------------------------------------------
// Indexing, and a reason's own page
// ---------------------------------------------------------------------------

/** A reason's pages must grow this many, and by this share, since a week before to be news. */
const GREW_LEAST = 10;
const GREW_SHARE = 0.1;
/** Pages not in Google named with their clicks: the three with most. */
const CLICKED_NAMED = 3;
/** Reasons named with their share of the pages not in Google: the four biggest. */
const REASONS_NAMED = 4;

/**
 * Indexing (search-console-indexing-v1-plan-2026-11-18.md, "The eye"), problems only, from what the page hands its eye
 * (`indexingPageData`). Google's checks don't follow the dates; the clicks do:
 *
 * - the biggest reason, and its share of the pages not in Google — the page's headline — then the next three;
 * - the clicks on pages not in Google, against all the website's pages' clicks in the dates;
 * - the sitemap's pages Google won't show: kept out, or chosen not to;
 * - the pages that still get clicks but aren't in Google, the most clicks first;
 * - a reason that grew since a week before, once a week of counts is kept.
 */
export function indexingFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const notIndexed = isRow(data.notIndexed) ? data.notIndexed : null;
  const pages = notIndexed && isNumber(notIndexed.pages) ? notIndexed.pages : 0;
  if (pages <= 0) return found;
  const reasons = rowsOf(data.reasons).filter((row) => named(row) && isNumber(row.pages) && (row.pages as number) > 0)
    .sort((left, right) => (right.pages as number) - (left.pages as number));

  // The headline: the biggest reason's share of the pages not in Google; then the next three, lower.
  reasons.slice(0, REASONS_NAMED).forEach((row, at) => {
    found.push(partOf("reason", named(row)!, "notIndexedPages", row.pages as number, pages, at === 0 ? 1.6 : 1.0 - at * 0.1));
  });

  // The clicks pages not in Google still got, against every click on the website's pages in the dates.
  const clicked = isRow(data.clicked) ? data.clicked : null;
  const clickedName = clicked ? named(clicked) : null;
  if (clicked && clickedName && isNumber(clicked.clicks) && isNumber(clicked.allClicks) && clicked.clicks > 0 && clicked.allClicks > 0) {
    found.push(partOf("clicked", clickedName, "pageClicks", clicked.clicks, clicked.allClicks, 1.3 + Math.min(0.3, clicked.clicks / clicked.allClicks)));
  }

  // The sitemap's pages Google won't show, though the sitemap asks it to.
  const sitemap = isRow(data.sitemap) ? data.sitemap : null;
  const sitemapName = sitemap ? named(sitemap) : null;
  if (sitemap && sitemapName && isNumber(sitemap.pages) && sitemap.pages > 0) {
    found.push(partOf("sitemap", sitemapName, "notIndexedPages", sitemap.pages, pages, 1.2));
  }

  // The pages not in Google that still got the most clicks, each its share of the clicks those pages got.
  const notIndexedClicks = clicked && isNumber(clicked.clicks) && clicked.clicks > 0 ? clicked.clicks : null;
  if (notIndexedClicks !== null) {
    rowsOf(data.clickedPages)
      .filter((row) => named(row) && isNumber(row.clicks) && (row.clicks as number) > 0)
      .sort((left, right) => (right.clicks as number) - (left.clicks as number))
      .slice(0, CLICKED_NAMED)
      .forEach((row, at) => found.push(partOf("clickedPage", named(row)!, "notIndexedClicks", row.clicks as number, notIndexedClicks, 0.9 - at * 0.1)));
  }

  // A reason that grew since a week before: only once a week of counts is kept.
  const grew = reasons
    .filter((row) => isNumber(row.pagesBefore) && (row.pagesBefore as number) > 0)
    .map((row) => ({ row, by: (row.pages as number) - (row.pagesBefore as number) }))
    .filter((one) => one.by >= Math.max(GREW_LEAST, GREW_SHARE * (one.row.pagesBefore as number)))
    .sort((left, right) => right.by - left.by)[0];
  if (grew) found.push(moved("grew", named(grew.row)!, "notIndexedPages", grew.row.pages as number, grew.row.pagesBefore as number, 1.4));
  return found;
}

/**
 * A reason's own page (the plan's "A reason's own page"): how many of the pages checked Google gave it for, the clicks
 * its pages still got in the dates against all the website's pages', the sitemap's pages among them, and the pages that
 * got the most clicks. From what the page hands its eye (`reasonPageData`).
 */
export function reasonFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const reason = isRow(data.reason) ? data.reason : null;
  const name = reason ? named(reason) : null;
  const boxes = isRow(data.boxes) ? data.boxes : {};
  const pagesBox = isRow(boxes.pages) ? boxes.pages : null;
  if (!reason || !name || !pagesBox || !isNumber(pagesBox.value) || pagesBox.value <= 0) return found;
  const pages = pagesBox.value;
  if (isNumber(pagesBox.checked) && pagesBox.checked > 0) found.push(partOf("reason", name, "checkedPages", pages, pagesBox.checked, 1.6));

  const rows = rowsOf(data.pages).filter((row) => named(row) && isNumber(row.clicks));
  const clicks = rows.reduce((sum, row) => sum + (row.clicks as number), 0);
  const clicksBox = isRow(boxes.clicks) ? boxes.clicks : null;
  const all = clicksBox && isNumber(clicksBox.all) && clicksBox.all > 0 ? clicksBox.all : null;
  if (all !== null && clicks > 0) found.push(partOf("clicks", name, "pageClicks", clicks, all, 1.3));

  const inSitemap = rows.filter((row) => row.inSitemap === true).length;
  const names = isRow(data.names) ? data.names : {};
  if (inSitemap > 0) found.push(partOf("sitemap", typeof names.sitemap === "string" ? names.sitemap : "In your sitemap", "pages", inSitemap, pages, 1.1));

  const shown = rows.filter((row) => isNumber(row.impressions)).reduce((sum, row) => sum + (row.impressions as number), 0);
  // The pages that got most clicks, or, with none, those Google showed most.
  const busiest = clicks > 0
    ? [...rows].filter((row) => (row.clicks as number) > 0).sort((left, right) => (right.clicks as number) - (left.clicks as number))
    : [...rows].filter((row) => isNumber(row.impressions) && (row.impressions as number) > 0).sort((left, right) => (right.impressions as number) - (left.impressions as number));
  busiest.slice(0, CLICKED_NAMED).forEach((row, at) => {
    if (clicks > 0) found.push(partOf("page", named(row)!, "clicks", row.clicks as number, clicks, 1.0 - at * 0.1));
    else if (shown > 0) found.push(partOf("page", named(row)!, "impressions", row.impressions as number, shown, 0.9 - at * 0.1));
  });
  return found;
}
