import { isNumber, isRow, moved, partOf, rowsOf, type OwnFound, type Row } from "./shared";
import { SHOWN_LEAST, fairBefore, namesOf, ratesApart, smallRates, text } from "./searchConsoleShared";

/** A kind of rich result's clicks moved by fewer than this either way isn't worth naming. */
const MOVED_LEAST = 5;

/**
 * Rich results (Way 3, 20 November 2026, search-console-breakdowns-plan-2026-11-20.md): the rich results' clicks against the
 * period before, their share of every click, the kind with most clicks, the kind whose clicks moved most, how often a kind is
 * clicked against plain results, and the newest whole month against the month before it. Every figure is the screen's own:
 * the kinds' rows, Performance's totals beside them, and the six months of the chart.
 */
export function looksFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const names = namesOf(data);
  const kinds = rowsOf(data.kinds).filter((kind) => typeof kind.name === "string" && isNumber(kind.clicks) && isNumber(kind.impressions));
  const totals = isRow(data.totals) ? data.totals : null;
  if (kinds.length === 0 || !totals || !isNumber(totals.clicks) || !isNumber(totals.impressions)) return found;
  const rich = text(names, "rich", "Rich results");
  const plain = text(names, "plain", "Plain results");
  const sum = (field: string, list: Row[] = kinds) => list.reduce((total, kind) => total + (isNumber(kind[field]) ? kind[field] as number : 0), 0);
  const clicks = sum("clicks");
  const held = kinds.every((kind) => isNumber(kind.previousClicks));
  const before = held ? sum("previousClicks") : null;

  // The headline: the rich results' clicks against the period before, where it's kept and whole.
  if (before !== null && before > 0 && fairBefore(clicks, before) && clicks !== before) found.push(moved("rich", rich, "clicks", clicks, before, 1.4 + Math.min(0.4, Math.abs(clicks - before) / before)));
  // Their share of every click, the hidden searches' too, as the second box.
  if (totals.clicks > 0 && clicks > 0) found.push(partOf("share", rich, "clicks", clicks, totals.clicks, 1.15));
  // The kind with most clicks, of the rich results' clicks.
  const ranked = [...kinds].sort((left, right) => (right.clicks as number) - (left.clicks as number));
  const top = ranked[0];
  if (top && clicks > 0 && ranked.length > 1) found.push(partOf("top", top.name as string, "clicks", top.clicks as number, clicks, 1.0));
  // The kind whose clicks moved most since the period before.
  const movedMost = kinds
    .filter((kind) => isNumber(kind.previousClicks) && (kind.previousClicks as number) > 0 && Math.abs((kind.clicks as number) - (kind.previousClicks as number)) >= MOVED_LEAST)
    .sort((left, right) => Math.abs((right.clicks as number) - (right.previousClicks as number)) - Math.abs((left.clicks as number) - (left.previousClicks as number)))[0];
  if (movedMost && movedMost !== top) found.push(moved("kind", movedMost.name as string, "clicks", movedMost.clicks as number, movedMost.previousClicks as number, 0.95));
  else if (movedMost) found.push(moved("kind", movedMost.name as string, "clicks", movedMost.clicks as number, movedMost.previousClicks as number, 0.9));
  // How often the kind clicked most often is clicked, against plain results: every click and impression less the kinds'.
  const plainClicks = totals.clicks - clicks;
  const plainShown = totals.impressions - sum("impressions");
  const best = kinds
    .filter((kind) => (kind.impressions as number) >= SHOWN_LEAST)
    .sort((left, right) => (right.clicks as number) / (right.impressions as number) - (left.clicks as number) / (left.impressions as number))[0];
  if (best && plainClicks > 0 && plainShown >= SHOWN_LEAST) {
    found.push({ ...ratesApart("plain", best.name as string, best.clicks as number, best.impressions as number, plainClicks, plainShown, 0, plain, smallRates(totals.clicks, totals.impressions)), score: 1.05 });
  }
  // The newest whole month against the month before it, from the chart's six months: the newest day's month is never whole.
  const months = rowsOf(data.months).filter((month) => typeof month.month === "string");
  const [earlier, later] = months.slice(0, -1).filter((month) => Array.isArray(month.looks)).slice(-2);
  const richOf = (month: Row) => rowsOf(month.looks).reduce((total, look) => total + (isNumber(look.clicks) ? look.clicks as number : 0), 0);
  // Never the headline again: on Last month the newest whole month is the period itself.
  const sameAsHeadline = earlier && later && richOf(later) === clicks && before !== null && richOf(earlier) === before;
  if (earlier && later && !sameAsHeadline && richOf(earlier) > 0 && richOf(later) !== richOf(earlier)) {
    const name = `${rich}, ${typeof later.name === "string" ? later.name : later.month as string}`;
    found.push(moved("months", name, "clicks", richOf(later), richOf(earlier), 0.85));
  }
  return found;
}
