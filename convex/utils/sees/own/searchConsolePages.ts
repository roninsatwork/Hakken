import { shortTitle } from "../../pageNames";
import { isNumber, isRow, moved, named, partOf, rowsOf, type OwnFound, type Row } from "./shared";
import { LEAST_CHANGE, RATE_UNDER, SHOWN_LEAST, SPLIT_SHARE_LEAST, changeOf, fairBefore, namesOf, ratesApart, smallRates, text, type Words } from "./searchConsoleShared";

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** A page's clicks that moved fewer than this aren't news, whatever the share. */
const PAGE_MOVED_LEAST = 5;
/** A Classification's clicks, now and before together, under this are too few to trust a change in. */
const KIND_CLICKS_LEAST = 20;

/** A page as the eye says it: its title, short, as the chart's key says it; else its address on the website; the home page in words. */
export function pageName(page: Row, names: Words): string {
  const key = String(page.key ?? "");
  let path = key;
  try {
    const url = new URL(key);
    path = `${url.pathname}${url.search}`;
  } catch {
    // Not an address: said as it is.
  }
  if (path === "/") return text(names, "home", "Home page");
  return typeof page.title === "string" && page.title.trim() ? shortTitle(page.title) : path;
}

/**
 * Pages (search-console-pages-way-1-plan-2026-11-17.md): every page Google showed in the dates chosen, in the country chosen
 * in the menu since 18 November 2026, its four boxes and the pages ticked onto its chart. Every page's clicks against the
 * span before's; how few pages got a click, out of all Google showed, and how few make half of them; the pages that gained
 * and lost most clicks, over the whole list; the Classification with most clicks, and the one that moved most; each page
 * ticked onto the chart; and, once, how many of the country's clicks came from searches Google hides, which it ties to no
 * page: why the boxes and the pages never add up, as Demand by Classification's eye says it. A share is of the clicks on the
 * pages (`pageClicks`), never of the boxes' clicks.
 */
export function pagesFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const names = namesOf(data);
  const summary = isRow(data.summary) ? data.summary : {};
  const before = isRow(summary.beforeTotals) ? summary.beforeTotals : null;
  const clicks = isNumber(summary.clicks) ? summary.clicks : null;
  // The headline: every page's clicks against every page the span before held.
  if (clicks !== null && before && isNumber(before.clicks) && fairBefore(clicks, before.clicks) && Math.abs(changeOf(clicks, before.clicks)) >= LEAST_CHANGE) {
    found.push(moved("clicks", text(names, "allPages", "All your pages"), "clicks", clicks, before.clicks, 1.5 + Math.min(0.3, Math.abs(changeOf(clicks, before.clicks)))));
  }
  // How few of the pages Google showed got a click, and how few of those make half the clicks.
  if (isNumber(summary.clickedRows) && isNumber(summary.rows) && summary.rows > 0 && summary.clickedRows > 0) {
    found.push(partOf("clicked", text(names, "clicked", "Pages that got a click"), "pages", summary.clickedRows, summary.rows, 1.1 + Math.min(0.3, 1 - summary.clickedRows / summary.rows)));
  }
  if (isNumber(summary.halfRows) && isNumber(summary.clickedRows) && summary.clickedRows >= 4) {
    found.push(partOf("half", text(names, "half", "Pages that make half your clicks"), "pages", summary.halfRows, summary.clickedRows, 1.0 + Math.min(0.4, 1 - summary.halfRows / summary.clickedRows)));
  }
  // The pages that gained and lost most clicks, over the whole list, each shown in the span before as well.
  const movers = isRow(summary.pageMovers) ? summary.pageMovers : null;
  for (const way of ["up", "down"] as const) {
    const page = movers && isRow(movers[way]) ? movers[way] as Row : null;
    if (!page || !isNumber(page.clicks) || !isNumber(page.previousClicks) || page.previousClicks <= 0) continue;
    const change = page.clicks - page.previousClicks;
    if (Math.abs(change) < PAGE_MOVED_LEAST) continue;
    found.push(moved(`page.${way}`, pageName(page, names), "clicks", page.clicks, page.previousClicks, 0.9 + Math.min(0.4, Math.abs(change) / Math.max(1, clicks ?? 1) * 20)));
  }
  // The Classification with most clicks, and the one that moved most: pages not sorted yet are never named.
  const kindNames = isRow(names.kinds) ? names.kinds : {};
  const kinds = rowsOf(summary.kinds).filter((kind) => typeof kind.kind === "string" && typeof kindNames[kind.kind] === "string" && isNumber(kind.clicks));
  const busiest = [...kinds].sort((left, right) => (right.clicks as number) - (left.clicks as number))[0];
  // Ranked above a page's own move since the gap joined the findings (18 November 2026): the table's Up or down shows a
  // page's move, and nothing on the page shows a Classification's share.
  if (busiest && clicks !== null && clicks > 0 && (busiest.clicks as number) > 0) {
    found.push(partOf("kind", kindNames[busiest.kind as string] as string, "pageClicks", busiest.clicks as number, clicks, 1.1 + Math.min(0.4, (busiest.clicks as number) / clicks)));
  }
  const kindMoved = kinds
    .filter((kind) => isNumber(kind.previousClicks) && fairBefore(kind.clicks as number, kind.previousClicks) && (kind.clicks as number) + kind.previousClicks >= KIND_CLICKS_LEAST
      && Math.abs(changeOf(kind.clicks as number, kind.previousClicks)) >= LEAST_CHANGE)
    .sort((left, right) => Math.abs((right.clicks as number) - (right.previousClicks as number)) - Math.abs((left.clicks as number) - (left.previousClicks as number)))[0];
  if (kindMoved) {
    const [now, then] = [kindMoved.clicks as number, kindMoved.previousClicks as number];
    found.push(moved("kindMoved", kindNames[kindMoved.kind as string] as string, "clicks", now, then, 0.95 + Math.min(0.4, Math.abs(changeOf(now, then)))));
  }
  // The Classification Google shows most among those clicked far less than all the pages, as Performance's bands say it:
  // a finding on every period, the span before or not.
  const allShown = isNumber(summary.impressions) ? summary.impressions : 0;
  if (clicks !== null && clicks > 0 && allShown > 0) {
    const allRate = clicks / allShown;
    const quiet = kinds
      .filter((kind) => isNumber(kind.impressions) && kind.impressions >= SHOWN_LEAST && kind.impressions / allShown >= SPLIT_SHARE_LEAST && (kind.clicks as number) / kind.impressions <= allRate * RATE_UNDER)
      .sort((left, right) => (right.impressions as number) - (left.impressions as number))[0];
    if (quiet) {
      found.push({ ...ratesApart("kindRate", kindNames[quiet.kind as string] as string, quiet.clicks as number, quiet.impressions as number, clicks, allShown, 0, text(names, "allPages", "All your pages"), smallRates(clicks, allShown)), score: 0.85 });
    }
  }
  // A page the reader ticked is the one they asked about: it ranks with the page's headlines.
  const ticked = rowsOf(data.ticked)
    .filter((row) => named(row) && isNumber(row.clicks) && isNumber(row.previousClicks) && fairBefore(row.clicks, row.previousClicks) && row.clicks !== row.previousClicks)
    .sort((left, right) => Math.abs(changeOf(right.clicks as number, right.previousClicks as number)) - Math.abs(changeOf(left.clicks as number, left.previousClicks as number)));
  const most = ticked[0];
  if (most) found.push(moved("ticked", named(most)!, "clicks", most.clicks as number, most.previousClicks as number, 1.3 + Math.min(0.3, Math.abs(changeOf(most.clicks as number, most.previousClicks as number)) / 2)));
  // The clicks Google tied to no page, said once: the country's clicks, the boxes', less its pages'. Ranked with the page's
  // headlines, as Keywords' eye ranks it, so it's said on every period: why the boxes and the table never add up.
  const website = isRow(data.website) ? data.website : null;
  if (website && isNumber(website.clicks) && clicks !== null && website.clicks > clicks) {
    const hidden = website.clicks - clicks;
    found.push(partOf("hidden", text(names, "hidden", "Searches Google hides"), "clicks", hidden, website.clicks, 1.2 + Math.min(0.3, hidden / website.clicks / 2)));
  }
  return found;
}
