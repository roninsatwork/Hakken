import { isNumber, isRow, moved, named, partOf, rowsOf, type OwnFound, type Row } from "./shared";
import { LEAST_CHANGE, RATE_UNDER, changeOf, fairBefore, namesOf, newAgainstLost, placeAgainst, ratesApart, smallRates, text, wordsOf } from "./searchConsoleShared";
import { pageName } from "./searchConsolePages";

// ---------------------------------------------------------------------------
// Tracked keywords and Tracked pages
// ---------------------------------------------------------------------------

/** A tracked row's clicks that moved fewer than this aren't news: a handful of tracked rows moves by a few clicks all the time. */
const TRACKED_MOVED_LEAST = 3;
/** A Google update's clicks, before and after together, under this are too few to say it moved them. */
const UPDATE_CLICKS_LEAST = 6;

/**
 * Tracked keywords and Tracked pages (search-console-tracked-way-1-plan-2026-11-18.md): only the keywords or pages the
 * company tracks, their four boxes and the rows ticked onto the chart. Everything tracked together, against the span
 * before and as a share of the country's clicks; the rows that gained and lost most clicks and moved most places, over
 * every row tracked (`Summary.trackedList`, never the page of rows on screen); for keywords, how many sit on Google's
 * first page against the span before, and how many came onto it and left it; the one bringing the biggest share of the
 * tracked clicks; the one Google shows often that gets the fewest clicks for each time shown; how many Google didn't show at all; each ticked row's clicks against the span before;
 * and the newest Google update that finished inside the dates, the ticked rows' clicks in the 14 days before it began
 * against the 14 days after it finished, with the row it moved most (`tickedUpdateOf`).
 */
export function trackedFindings(kind: "keywords" | "pages") {
  return (data: Row): OwnFound[] => {
    const found: OwnFound[] = [];
    const names = namesOf(data);
    const words = wordsOf(data);
    const summary = isRow(data.summary) ? data.summary : {};
    const tracked = isRow(summary.trackedList) ? summary.trackedList : null;
    const rows = isNumber(summary.rows) ? summary.rows : 0;
    if (!tracked || rows === 0) return found;
    const nameOf = (row: Row) => (kind === "pages" ? pageName(row, names) : String(row.key ?? ""));
    const unit = kind === "keywords" ? "searches" : "pages";
    const all = text(names, "allTracked", kind === "keywords" ? "Your tracked keywords" : "Your tracked pages");
    const clicks = isNumber(summary.clicks) ? summary.clicks : 0;
    const before = isRow(tracked.before) ? tracked.before : null;

    // The headline: everything tracked together, against the span before.
    if (before && isNumber(before.clicks) && fairBefore(clicks, before.clicks) && Math.abs(changeOf(clicks, before.clicks)) >= LEAST_CHANGE) {
      found.push(moved("tracked", all, "clicks", clicks, before.clicks, 1.5 + Math.min(0.3, Math.abs(changeOf(clicks, before.clicks)))));
    }
    // And as a share of every click the country had: on every period, the span before or not. A share that rounds to
    // nothing is left out: "0% of all the clicks" told the reader nothing (one page with 1 click of 22,121, 18 November 2026).
    const website = isRow(data.website) ? data.website : null;
    if (website && isNumber(website.clicks) && website.clicks > 0 && clicks > 0 && (1000 * clicks) / website.clicks >= 1) {
      found.push(partOf("share", all, "clicks", clicks, website.clicks, 1.35 + Math.min(0.3, clicks / website.clicks)));
    }
    // The tracked rows that gained and lost most clicks.
    const movers = isRow(tracked.movers) ? tracked.movers : null;
    for (const way of ["up", "down"] as const) {
      const row = movers && isRow(movers[way]) ? movers[way] as Row : null;
      if (!row || !isNumber(row.clicks) || !isNumber(row.previousClicks) || row.previousClicks <= 0) continue;
      const change = row.clicks - row.previousClicks;
      if (Math.abs(change) < TRACKED_MOVED_LEAST) continue;
      found.push(moved(`row.${way}`, nameOf(row), "clicks", row.clicks, row.previousClicks, 1.0 + Math.min(0.4, Math.abs(change) / Math.max(1, clicks) * 4)));
    }
    // The rows that moved most places, up and down, where Google showed them enough in both spans.
    const places = isRow(tracked.places) ? tracked.places : null;
    const beforeName = text(words, "before", "The span before");
    for (const way of ["up", "down"] as const) {
      const row = places && isRow(places[way]) ? places[way] as Row : null;
      if (!row) continue;
      const place = placeAgainst(`place.${way}`, nameOf(row), row.position as number | null, row.previousPosition as number | null, 0.85, beforeName, 1);
      if (place) found.push(place);
    }
    // Keywords on Google's first page, against the span before, and how many came onto it and left it.
    const first = isRow(tracked.firstPage) ? tracked.firstPage : null;
    if (kind === "keywords" && first && isNumber(first.now)) {
      const firstName = text(names, "firstPage", "On Google's first page");
      if (isNumber(first.before) && first.before > 0 && first.before !== first.now) {
        found.push(moved("firstPage", firstName, "searches", first.now, first.before, 1.2 + Math.min(0.4, Math.abs(changeOf(first.now, first.before)))));
      } else {
        found.push(partOf("firstPage", firstName, "searches", first.now, rows, 1.0 + Math.min(0.3, first.now / rows)));
      }
      if (isNumber(first.came) && isNumber(first.left) && first.came + first.left > 0) {
        found.push(newAgainstLost("pageOne", "pageOne", first.came, first.left, null, 1.05 + Math.min(0.3, (first.came + first.left) / rows)));
      }
    }
    // The one bringing the biggest share of the tracked clicks, on every period, the span before or not.
    const busiest = isRow(tracked.busiest) ? tracked.busiest : null;
    if (busiest && isNumber(busiest.clicks) && clicks > 0 && rows > 1) {
      found.push(partOf("busiest", nameOf(busiest), kind === "pages" ? "trackedPageClicks" : "trackedKeywordClicks", busiest.clicks, clicks, 1.1 + Math.min(0.3, busiest.clicks / clicks)));
    }
    // The one Google shows often that gets the fewest clicks for each time shown, against everything tracked together.
    const quiet = isRow(tracked.quietest) ? tracked.quietest : null;
    const shown = isNumber(summary.impressions) ? summary.impressions : 0;
    if (quiet && isNumber(quiet.clicks) && isNumber(quiet.impressions) && quiet.impressions > 0 && clicks > 0 && shown > 0 && rows > 1
      && quiet.clicks / quiet.impressions <= (clicks / shown) * RATE_UNDER) {
      found.push({ ...ratesApart("quiet", nameOf(quiet), quiet.clicks, quiet.impressions, clicks, shown, 0, all, smallRates(clicks, shown)), score: 0.9 });
    }
    // Tracked rows Google didn't show at all in the dates.
    if (isNumber(tracked.notShown) && tracked.notShown > 0) {
      found.push(partOf("notShown", text(names, "notShown", "Not shown at all"), unit, tracked.notShown, rows, 0.95 + Math.min(0.4, tracked.notShown / rows)));
    }
    // A row the reader ticked is the one they asked about: it ranks with the page's headlines.
    const ticked = rowsOf(data.ticked)
      .filter((row) => named(row) && isNumber(row.clicks) && isNumber(row.previousClicks) && fairBefore(row.clicks, row.previousClicks) && row.clicks !== row.previousClicks)
      .sort((left, right) => Math.abs(changeOf(right.clicks as number, right.previousClicks as number)) - Math.abs(changeOf(left.clicks as number, left.previousClicks as number)));
    const most = ticked[0];
    if (most) found.push(moved("ticked", named(most)!, "clicks", most.clicks as number, most.previousClicks as number, 1.3 + Math.min(0.3, Math.abs(changeOf(most.clicks as number, most.previousClicks as number)) / 2)));
    // The newest Google update that finished inside the dates: the ticked rows' clicks either side of it.
    const update = isRow(data.update) ? data.update : null;
    const onChart = text(names, "onChart", kind === "keywords" ? "the keywords on the chart" : "the pages on the chart");
    if (update && typeof update.title === "string") found.push(...updateFindings(update, `${update.title}, for ${onChart}`));
    return found;
  };
}

/** The ticked rows' clicks in the 14 days before an update began against the 14 days after it finished, beside the row it moved most. */
function updateFindings(update: Row, title: string): OwnFound[] {
  const rows = rowsOf(update.rows).filter((row) => named(row) && isNumber(row.before) && isNumber(row.after));
  const before = rows.reduce((sum, row) => sum + (row.before as number), 0);
  const after = rows.reduce((sum, row) => sum + (row.after as number), 0);
  if (before <= 0 || before + after < UPDATE_CLICKS_LEAST || before === after) return [];
  const most = rows
    .filter((row) => (row.before as number) > 0 && row.before !== row.after)
    .sort((left, right) => Math.abs((right.after as number) - (right.before as number)) - Math.abs((left.after as number) - (left.before as number)))[0];
  const one = moved("update", title, "clicks", after, before, 1.25 + Math.min(0.4, Math.abs(changeOf(after, before))),
    most ? { name: named(most)!, change: changeOf(most.after as number, most.before as number) } : undefined);
  // Whose clicks, and over which days: both drafts on 18 November 2026 called the ticked rows "your top pages", and the
  // sentence was left off as a guess.
  const over: Record<string, string> = { now: "the 14 days after it finished", before: "the 14 days before it began" };
  one.facts = one.facts.map((fact) => (over[fact.key] ? { ...fact, label: `${title}: clicks, ${over[fact.key]}` } : fact));
  return [one];
}
