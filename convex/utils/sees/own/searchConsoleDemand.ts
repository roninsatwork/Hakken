import { isNumber, isRow, moved, named, partOf, rowsOf, type OwnFound, type Row } from "./shared";
import { RATE_UNDER, SHOWN_LEAST, SPLIT_SHARE_LEAST, changeOf, fairBefore, namesOf, ratesApart, shareMoved, smallRates, text } from "./searchConsoleShared";

// ---------------------------------------------------------------------------
// Demand by Classification
// ---------------------------------------------------------------------------

/** A Classification's clicks must move this much, and by this share of its clicks before, to be news: as Performance's. */
const CLASS_MOVED_LEAST = 10;
const CLASS_MOVED_SHARE = 0.1;
/** A Classification clicked this many times as often as all the pages, for the times shown, is worth saying. */
const RATE_OVER = 1.25;
/**
 * Demand by Classification (search-console-demand-by-classification-way-2-plan-2026-11-18.md): each of the website's
 * Classifications in the country chosen in the menu, from what the page hands its eye (`demandPageData`), against the
 * dates before where that span is fair. The Classifications share out only the clicks Google ties to a page, as the
 * page's squares and table do:
 *
 * - the Classification with the most clicks, and its share of the pages' clicks, as the squares count it;
 * - the Classifications that gained and lost the most clicks, each beside the other Classifications' own move;
 * - a Classification Google shows a lot but people click less, against all the pages: the bands' gap;
 * - a Classification clicked far more often than the pages, for the times Google showed it;
 * - and, once, how many of the country's clicks came from searches Google hides, which it ties to no page: why the boxes
 *   and the Classifications never add up, as Keywords' eye says it (Anthony, 18 November 2026: "yes i think so").
 *
 * Unclassified is in the figures, never named: Hakken's own housekeeping (Anthony, 2026-11-03). Where the dates have no
 * fair span before (More Handles' Last 6 and 12 months), nothing is said to have moved.
 */
export function demandFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const names = namesOf(data);
  const website = isRow(data.website) ? data.website : null;
  const all = rowsOf(data.classifications).filter((row) => named(row) && isNumber(row.clicks) && isNumber(row.impressions));
  const classes = all.filter((row) => row.sorted !== false);
  const sum = (field: string) => all.reduce((total, row) => total + (isNumber(row[field]) ? (row[field] as number) : 0), 0);
  const pages = { clicks: sum("clicks"), impressions: sum("impressions"), clicksBefore: sum("clicksBefore") };
  const held = all.length > 0 && all.every((row) => isNumber(row.clicksBefore));
  const fair = held && fairBefore(pages.clicks, pages.clicksBefore);
  if (pages.clicks <= 0) return found;

  // The headline: the Classification with the most clicks, its share of the pages' clicks, against its share before.
  const top = [...classes].sort((left, right) => (right.clicks as number) - (left.clicks as number))[0];
  if (top && (top.clicks as number) > 0) {
    const share = (100 * (top.clicks as number)) / pages.clicks;
    const before = fair && isNumber(top.clicksBefore) ? (100 * top.clicksBefore) / pages.clicksBefore : null;
    // Said as a share of the clicks on the pages, never of all the country's, which the boxes show (`pageClicks`).
    if (before !== null && Math.abs(share - before) >= 1) found.push(shareMoved("top", named(top)!, "pageClicks", share, before, 1.5 + Math.min(0.4, Math.abs(share - before) / 20)));
    else found.push(partOf("top", named(top)!, "pageClicks", top.clicks as number, pages.clicks, 1.5));
  }

  // The Classifications that gained and lost the most clicks, each beside the other Classifications' move.
  if (fair) {
    const moves = classes
      .filter((row) => (row.clicksBefore as number) >= CLASS_MOVED_LEAST)
      .map((row) => ({ row, by: (row.clicks as number) - (row.clicksBefore as number) }))
      .filter((move) => Math.abs(move.by) >= Math.max(CLASS_MOVED_LEAST / 2, CLASS_MOVED_SHARE * (move.row.clicksBefore as number)));
    const gained = [...moves].filter((move) => move.by > 0).sort((left, right) => right.by - left.by)[0];
    const lost = [...moves].filter((move) => move.by < 0).sort((left, right) => left.by - right.by)[0];
    const biggest = Math.max(Math.abs(gained?.by ?? 0), Math.abs(lost?.by ?? 0));
    const others = text(names, "others", "The other Classifications");
    for (const [move, list] of [[gained, "gained"], [lost, "lost"]] as const) {
      if (!move) continue;
      const before = move.row.clicksBefore as number;
      const restBefore = pages.clicksBefore - before;
      const rest = restBefore > 0 ? { name: others, change: changeOf(pages.clicks - (move.row.clicks as number), restBefore) } : undefined;
      found.push(moved(list, named(move.row)!, "clicks", move.row.clicks as number, before, (Math.abs(move.by) === biggest ? 1.25 : 1.1) + Math.min(0.2, Math.abs(move.by / before) / 4), rest));
    }
  }

  // The bands' gap and its other side: the Classifications Google shows a fair share of the pages' times for, clicked far
  // less often, or far more, than all the pages. The one shown most of those clicked less; the busiest clicked more.
  if (pages.impressions > 0) {
    const allPages = text(names, "allPages", "All your pages");
    const rate = pages.clicks / pages.impressions;
    const shownFairly = classes.filter((row) => (row.impressions as number) >= SHOWN_LEAST && (row.impressions as number) / pages.impressions >= SPLIT_SHARE_LEAST);
    const rateOf = (row: Row) => (row.clicks as number) / (row.impressions as number);
    const quiet = shownFairly.filter((row) => rateOf(row) <= rate * RATE_UNDER).sort((left, right) => (right.impressions as number) - (left.impressions as number))[0];
    const busy = shownFairly.filter((row) => rateOf(row) >= rate * RATE_OVER && row !== top).sort((left, right) => (right.clicks as number) - (left.clicks as number))[0];
    const small = smallRates(pages.clicks, pages.impressions);
    for (const [one, list, score] of [[quiet, "quiet", 0.95], [busy, "busy", 0.85]] as const) {
      if (!one) continue;
      found.push({ ...ratesApart(list, named(one)!, one.clicks as number, one.impressions as number, pages.clicks, pages.impressions, 0, allPages, small), score });
    }
  }

  // The clicks Google tied to no page, said once, as Keywords' eye says them: the country's clicks less its pages'.
  if (website && isNumber(website.clicks) && website.clicks > pages.clicks) {
    const hidden = website.clicks - pages.clicks;
    found.push(partOf("hidden", text(names, "hidden", "Searches Google hides"), "clicks", hidden, website.clicks, 1.0));
  }
  return found;
}
