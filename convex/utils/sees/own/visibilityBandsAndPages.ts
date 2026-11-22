import type { FindingFact } from "../findings";
import { isNumber, isRow, named, partWithFacts, rowsOf, type OwnFound, type Row } from "./shared";
import { vsBeside, vsPlace } from "./visibilityMarket";

// ===========================================================================================================================
// One square of Position bands' grid and Your pages (visibility-16-eyes, 22 November 2026; Anthony: "Yes, build them"),
// both on the eye's to-do list until now. Each shows the newest check whatever the dates. The square sets its searches
// against the band they moved into and each band against every search ranked for; Your pages sets each kind of page
// against every page known. What each screen hands its eye is built in `eyeData/visibilityKeywords.ts` and
// `eyeData/visibilityRadar.ts`; every rule runs on every period in `visibilityRestPeriods.test.ts`.
// ===========================================================================================================================

const partOf = (data: Row, name: string): Row => (isRow(data[name]) ? (data[name] as Row) : {});
const numberIn = (row: Row | undefined, field: string): number | null => (row && isNumber(row[field]) ? (row[field] as number) : null);
function nameIn(data: Row, key: string, fallback: string): string {
  const names = partOf(data, "names");
  return typeof names[key] === "string" && (names[key] as string).trim() ? (names[key] as string).trim() : fallback;
}
const mostFirst = (rows: readonly Row[], field: string) => rows.filter((row) => named(row) && isNumber(row[field])).sort((left, right) => (right[field] as number) - (left[field] as number));

// ---------------------------------------------------------------------------------------------------------------------------
// One square of Position bands (`keywords/bands/moved`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The searches that made the move, of every search now in the band they moved into, with how often they're searched
 * (the headline); the biggest climb or drop among them; the most searched of them; each new search's place; and how many
 * searches each of the two bands holds now, of every search ranked for.
 */
function bandSquareFindings(data: Row): OwnFound[] {
  const square = partOf(data, "square");
  const name = named(square);
  const moved = numberIn(square, "moved");
  if (!name || moved === null || moved === 0) return [];
  const found: OwnFound[] = [];
  const rows = rowsOf(data.moved).filter((row) => named(row) && isNumber(row.now));
  const bands = partOf(data, "bandsNow");
  const into = partOf(bands, "to");
  const from = partOf(bands, "from");
  const ranked = numberIn(bands, "ranked");
  const volume = numberIn(square, "volume") ?? 0;
  const volumeFact: FindingFact[] = volume > 0 ? [{ key: "volume", value: volume, unit: "count", label: `${name}: monthly searches, together` }] : [];
  const intoNow = numberIn(into, "searches");
  // The square beside the band it moved into: "From 11–20 to 21–50: 2 searches. 21–50: 180", each set named on screen.
  if (intoNow !== null && intoNow > 0 && named(into)) {
    const one = vsBeside("square", name, "searches", moved, intoNow, named(into)!, 2);
    found.push({ ...one, facts: [...one.facts, ...volumeFact] });
  }
  // The biggest move among them by the places it moved: a climb where they climbed, a drop where they dropped.
  const biggest = rows.filter((row) => isNumber(row.was)).sort((left, right) => Math.abs((right.now as number) - (right.was as number)) - Math.abs((left.now as number) - (left.was as number)))[0];
  if (biggest) found.push(vsPlace("move", named(biggest)!, biggest.now as number, biggest.was as number, 1.5 + Math.min(0.3, Math.abs((biggest.now as number) - (biggest.was as number)) / 30)));
  const searched = mostFirst(rows, "volume");
  if (searched.length >= 2 && volume > 0 && named(searched[0]) !== named(biggest ?? {})) {
    const top = searched[0];
    found.push(partWithFacts("busiest", named(top)!, "movedVolume", top.volume as number, volume, 1.3, {
      of: `the monthly searches of the ${rows.length} searches that moved`,
      extra: [{ key: "now", value: top.now as number, unit: "score", label: `${named(top)}: place on Google now` }, ...(isNumber(top.was) ? [{ key: "was", value: top.was as number, unit: "score" as const, label: `${named(top)}: place on Google at the check before` }] : [])],
    }));
  }
  // A search new to the band list has no place before to climb from: its place now and how often it's searched.
  const fresh = mostFirst(rows.filter((row) => !isNumber(row.was)), "volume")[0];
  if (fresh && volume > 0) found.push(partWithFacts("fresh", named(fresh)!, "movedVolume", fresh.volume as number, volume, 1.2, { of: `the monthly searches of the ${rows.length} searches that moved`, extra: [{ key: "now", value: fresh.now as number, unit: "score", label: `${named(fresh)}: place on Google now, new at this check` }] }));
  if (ranked !== null && ranked > 0) {
    const fromNow = numberIn(from, "searches");
    if (fromNow !== null && named(from)) found.push(partWithFacts("fromBand", named(from)!, "keywords", fromNow, ranked, 1.1, { of: "every search ranked for" }));
    if (intoNow !== null && named(into)) found.push(partWithFacts("toBand", named(into)!, "keywords", intoNow, ranked, 1, { of: "every search ranked for" }));
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Your pages (`your-pages`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The pages Google showed, of every page known (the headline); those it never showed; those missing from the sitemap;
 * those ranking at the newest check; those the site audit couldn't reach; the page with the most clicks beside the next;
 * and the Classification bringing most of the clicks listed.
 */
function yourPagesFindings(data: Row): OwnFound[] {
  const site = partOf(data, "yourSite");
  const pages = numberIn(site, "pages");
  if (pages === null || pages === 0) return [];
  const found: OwnFound[] = [];
  const counted = (list: string, key: string, fallback: string, field: string, score: number, always = false) => {
    const value = numberIn(site, field);
    if (value !== null && (always || value > 0)) found.push(partWithFacts(list, nameIn(data, key, fallback), "pages", value, pages, score));
  };
  const shown = numberIn(site, "shown");
  counted("shown", "shownOnGoogle", "Pages Google showed", "shown", 2, true);
  // Only pages in the sitemap can be counted as not shown (`holdPagesJoin.inGap`): set against the sitemap's pages alone,
  // and said only where the sitemap's count is held.
  const neverShown = numberIn(site, "neverShown");
  const inSitemap = numberIn(site, "inSitemap");
  if (neverShown !== null && neverShown > 0 && inSitemap !== null && inSitemap > 0) {
    found.push(partWithFacts("never", nameIn(data, "neverShown", "Pages Google didn't show in the last 90 days"), "sitemapPages", neverShown, inSitemap, 1.5, { of: `the ${inSitemap} pages in your sitemap` }));
  }
  // With no Search Console, the sitemap's gap is the headline.
  counted("sitemap", "notInSitemap", "Pages missing from your sitemap", "notInSitemap", shown === null ? 2 : 1.4);
  counted("ranking", "ranking", "Pages ranking for a search", "ranking", 1.1);
  counted("notCrawled", "notCrawled", "Pages the site audit couldn't reach", "notCrawled", 1);
  const listed = mostFirst(rowsOf(data.pagesShown), "clicks");
  if (listed.length >= 2 && (listed[0].clicks as number) > 0) found.push(vsBeside("topPage", named(listed[0])!, "clicks", listed[0].clicks as number, listed[1].clicks as number, named(listed[1])!, 1.2));
  const clicks = listed.reduce((sum, row) => sum + (row.clicks as number), 0);
  const classification = mostFirst(rowsOf(data.classifications), "clicks")[0];
  if (classification && clicks > 0) found.push(partWithFacts("classification", named(classification)!, "listedClicks", classification.clicks as number, clicks, 1, { of: `the ${clicks} clicks of the ${listed.length} pages listed` }));
  return found;
}

/** Joined into `VISIBILITY_OWN` (`own/visibility.ts`). */
export const VISIBILITY_BANDS_AND_PAGES_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  "visibility.keywordsBandsMoved": { general: false, find: bandSquareFindings },
  "visibility.yourPages": { general: false, find: yourPagesFindings },
};
