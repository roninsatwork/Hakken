import type { FindingFact } from "../findings";
import { MEASURES, measureWords } from "../measures";
import { firstOfEachList, isNumber, isRow, moved, named, partOf, round1, rowsOf, type OwnFound, type Row } from "./shared";

/**
 * Search Console's pages with rules of their own (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6; Anthony,
 * 2026-11-03: "every page we touch needs its own finding … i have asked this more than once across all pages"). Each
 * rule reads the figures its page hands the eye (`SearchConsoleSees`: the page's own reads, with the names the page
 * says things by in `words` and `names`, in the reader's language) and sets each figure against something: the span
 * before, the rest of the website, another group, another place on Google. They pick the biggest things for whatever
 * dates are chosen; a bar only keeps out what is too small to trust. `searchConsolePeriods.test.ts` holds them to every
 * period the date menu offers on More Handles' own figures.
 *
 * Positions are places, lower the better (`placeOnGoogle`): the panel's arrow follows the number and its colour turns
 * round. A click rate under 2% is said as clicks for every 1,000 times shown, as the panel keeps one decimal and 0.85%
 * against 0.92% would read "0.9% against 0.9%" (morehandles.co.uk's, October 2026).
 *
 * A span before far smaller than the span itself is no span before (`fairBefore`): morehandles.co.uk's connection said
 * its days began on 11 June 2025, while its first day held was 23 April 2026, so Last 6 months set 184 days against 9
 * and every figure read as up 1,800% (checked 2026-11-03). Where the dates have no fair span before, the rules set the
 * newest weeks against the weeks before them inside the dates, or groups against each other.
 */

// ---------------------------------------------------------------------------
// Shared to the section
// ---------------------------------------------------------------------------

/** A change too small to be news: under this share of the span before. */
const LEAST_CHANGE = 0.02;
/** A span before under this share of the span itself is a part of one, never a span before. */
const FAIR_BEFORE = 1 / 3;
/** A click rate under this many per cent is said per 1,000 times shown. */
const PER_THOUSAND_UNDER = 2;
/** A place moved this many places or more is worth saying: a search's own, and the whole website's average over all its searches. */
const PLACES_MOVED = 0.3;
const WEBSITE_PLACES_MOVED = 0.1;
/** Times shown that make a click rate worth trusting. */
const SHOWN_LEAST = 500;

type Words = Row;
const text = (holder: Row, key: string, fallback: string): string => (typeof holder[key] === "string" && (holder[key] as string).trim() ? (holder[key] as string).trim() : fallback);
const wordsOf = (data: Row): Words => (isRow(data.words) ? data.words : {});
const namesOf = (data: Row): Words => (isRow(data.names) ? data.names : {});
const changeOf = (now: number, before: number) => (now - before) / before;
/** Two counts a day that still differ once said whole, as the panel says them: never "11 against 11" (Ronins, 2026-11-03). */
const apartWhole = (now: number, before: number) => Math.round(now) !== Math.round(before);
/** A span before worth setting against: held, and not a sliver of the span itself. */
const fairBefore = (now: number | null | undefined, before: number | null | undefined): before is number => isNumber(now) && isNumber(before) && before > 0 && before >= now * FAIR_BEFORE;
const unitOf = (measure: string): FindingFact["unit"] => (MEASURES[measure]?.kind === "percent" ? "percent" : MEASURES[measure]?.kind === "place" || MEASURES[measure]?.kind === "score" ? "score" : "count");

/** A figure set against another's, named (`apartOther`): another group's, another place's, the span before's. */
function against(list: string, name: string, measure: string, value: number, mean: number, score: number, other: string, extra: { facts?: FindingFact[] } = {}): OwnFound {
  const kind = value > mean ? "rowAbove" : "rowBelow";
  const words = measureWords(measure);
  const unit = unitOf(measure);
  return {
    id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
    params: { name, measure, value: round1(value), mean: round1(mean), against: "other", other, ...(MEASURES[measure]?.lessIsBetter ? { lessIsBetter: 1 } : {}) },
    facts: [
      { key: "value", value: round1(value), unit, label: `${name}: ${words}` },
      { key: "mean", value: round1(mean), unit, label: `${other}: ${words}` },
      ...(extra.facts ?? []),
    ],
  };
}

/** Whether a page's click rates are said per 1,000 times shown: its whole click rate under 2%. */
const smallRates = (clicks: number, shown: number) => shown > 0 && (100 * clicks) / shown < PER_THOUSAND_UNDER;

/**
 * Two click rates set against each other, each as clicks over times shown: per cent, or per 1,000 times shown under 2%.
 * `perThousandChosen`: the page's own choice, so every rate on one page is said the same way (`smallRates`): on More
 * Handles' Click rate by position, place 1 read "14.4 for every 1,000" beside place 2, and "1.4%" beside the month before.
 */
function ratesApart(list: string, name: string, clicks: number, shown: number, otherClicks: number, otherShown: number, score: number, other: string, perThousandChosen?: boolean): OwnFound {
  const rate = (100 * clicks) / shown;
  const otherRate = (100 * otherClicks) / otherShown;
  const perThousand = perThousandChosen ?? Math.max(rate, otherRate) < PER_THOUSAND_UNDER;
  return against(list, name, perThousand ? "clicksPerThousand" : "ctrPercent", perThousand ? rate * 10 : rate, perThousand ? otherRate * 10 : otherRate, score, other, {
    facts: [
      { key: "clicks", value: clicks, unit: "count", label: `${name}: clicks` },
      { key: "shown", value: shown, unit: "count", label: `${name}: times shown` },
    ],
  });
}

/** A share of a whole against its share before: "Brand: 9.1% of all the clicks, from 9.2% the span before". */
function shareMoved(list: string, name: string, measure: string, share: number, shareBefore: number, score: number): OwnFound {
  const words = measureWords(measure);
  return {
    id: `shareMoved:${list}:${measure}:${name}`, kind: "shareMoved", list, score,
    params: { name, measure, share: round1(share), shareBefore: round1(shareBefore) },
    facts: [
      { key: "share", value: round1(share), unit: "percent", label: `${name}: its share of all the ${words}` },
      { key: "shareBefore", value: round1(shareBefore), unit: "percent", label: `${name}: its share of all the ${words}, the span before` },
    ],
  };
}

/** New against lost, with the span before's where held. */
function newAgainstLost(list: string, measure: string, gained: number, lost: number, before: { gained: number; lost: number } | null, score: number): OwnFound {
  const words = measureWords(measure);
  return {
    id: `newLost:${list}:${measure}`, kind: "newLost", list, score,
    params: { measure, gained, lost, ...(before ? { gainedBefore: before.gained, lostBefore: before.lost } : {}) },
    facts: [
      { key: "gained", value: gained, unit: "count", label: `${words}: new` },
      { key: "lost", value: lost, unit: "count", label: `${words}: lost` },
      ...(before ? [
        { key: "gainedBefore", value: before.gained, unit: "count" as const, label: `${words}: new, the span before` },
        { key: "lostBefore", value: before.lost, unit: "count" as const, label: `${words}: lost, the span before` },
      ] : []),
    ],
  };
}

/**
 * A place set against another (the span before's, before an update), said when it moved a third of a place or more: as
 * a place on Google, where the higher number is the worse, so the panel's colour turns round and its arrow follows the
 * number (`placeOnGoogle`, as Visibility's own rules set a place beside another).
 */
function placeAgainst(list: string, name: string, now: number | null | undefined, before: number | null | undefined, score: number, other: string, least = PLACES_MOVED): OwnFound | null {
  if (!isNumber(now) || !isNumber(before) || now <= 0 || before <= 0 || Math.abs(now - before) < least) return null;
  return against(list, name, "placeOnGoogle", now, before, score + Math.min(0.5, Math.abs(now - before) / 6), other);
}

/** Figures a day over the newest `days` days of a daily list, against the same number of days before them inside it. */
function newestAgainstEarlier(days: Row[], field: string, span: number): { now: number; before: number } | null {
  const held = days.filter((day) => typeof day.day === "string" && isNumber(day[field])).sort((left, right) => String(left.day).localeCompare(String(right.day)));
  if (held.length < span * 2) return null;
  const sum = (rows: Row[]) => rows.reduce((total, row) => total + (row[field] as number), 0);
  return { now: sum(held.slice(-span)) / span, before: sum(held.slice(-span * 2, -span)) / span };
}

/** A position over some days, weighted by times shown as Google's own. */
function positionOver(days: Row[]): number | null {
  const shown = days.reduce((sum, day) => sum + (isNumber(day.impressions) ? day.impressions : 0), 0);
  if (shown <= 0) return null;
  return days.reduce((sum, day) => sum + (isNumber(day.impressions) && isNumber(day.position) ? day.impressions * day.position : 0), 0) / shown;
}

/** Weekends against weekdays, a day's clicks, where every point is a day: four weekend days and ten weekdays at least. */
function weekendsOf(list: string, days: Row[], words: Words, score: number): OwnFound | null {
  const sums = { weekend: { days: 0, clicks: 0 }, weekday: { days: 0, clicks: 0 } };
  for (const day of days) {
    if (typeof day.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day.day) || !isNumber(day.clicks)) continue;
    const weekday = new Date(`${day.day}T12:00:00Z`).getUTCDay();
    const part = weekday === 0 || weekday === 6 ? sums.weekend : sums.weekday;
    part.days += 1;
    part.clicks += day.clicks;
  }
  if (sums.weekend.days < 4 || sums.weekday.days < 10) return null;
  const weekend = sums.weekend.clicks / sums.weekend.days;
  const weekday = sums.weekday.clicks / sums.weekday.days;
  if (weekday <= 0 || Math.abs(weekend / weekday - 1) < 0.15 || !apartWhole(weekend, weekday)) return null;
  return against(list, text(words, "weekends", "At weekends"), "clicksADay", Math.round(weekend), Math.round(weekday), score + Math.min(0.4, Math.abs(weekend / weekday - 1)), text(words, "weekdays", "On weekdays"));
}

/**
 * The period's clicks, times shown, click rate and place against the span before — or, without a fair one, the newest
 * 28 days against the 28 before them, inside the dates. The headline (clicks) is always said where a span before is.
 */
function wholeFigures(list: string, totals: Row | null, previous: Row | null, days: Row[], words: Words, previousDays: number | null): OwnFound[] {
  const found: OwnFound[] = [];
  const website = text(words, "website", "The whole website");
  const beforeName = text(words, "before", "The span before");
  // A span before held for far fewer days than the span itself is a part of one (morehandles.co.uk, 2026-11-03).
  const partBefore = previousDays !== null && days.length > 0 && previousDays < days.length * FAIR_BEFORE * 2;
  if (totals && previous && !partBefore && fairBefore(totals.impressions as number, previous.impressions as number) && isNumber(totals.clicks) && isNumber(previous.clicks) && previous.clicks > 0) {
    const clicks = changeOf(totals.clicks, previous.clicks);
    found.push(moved(list, website, "clicks", totals.clicks, previous.clicks, 1.4 + Math.min(0.5, Math.abs(clicks))));
    const shown = changeOf(totals.impressions as number, previous.impressions as number);
    if (Math.abs(shown) >= LEAST_CHANGE || Math.sign(shown) !== Math.sign(clicks)) {
      found.push(moved(`${list}Shown`, website, "impressions", totals.impressions as number, previous.impressions as number, 1.0 + Math.min(0.5, Math.abs(shown - clicks) * 2), { name: text(words, "clicks", "Clicks"), change: clicks }));
    }
    const rate = ratesApart(`${list}Rate`, website, totals.clicks, totals.impressions as number, previous.clicks, previous.impressions as number, 0, beforeName, smallRates(totals.clicks, totals.impressions as number));
    const rateMove = Math.abs((rate.params.value as number) / Math.max(0.01, rate.params.mean as number) - 1);
    if (rateMove >= LEAST_CHANGE) found.push({ ...rate, score: 0.8 + Math.min(0.5, rateMove) });
    const place = placeAgainst(`${list}Place`, website, totals.position as number, previous.position as number, 0.8, beforeName, WEBSITE_PLACES_MOVED);
    if (place) found.push(place);
    // Where the dates are heading: their newest days against the same number before them, inside the dates.
    const span = days.length >= 56 ? 28 : days.length >= 14 ? 7 : 0;
    const heading = span > 0 ? newestAgainstEarlier(days, "clicks", span) : null;
    if (heading && heading.before > 0 && Math.abs(changeOf(heading.now, heading.before)) >= 0.05 && apartWhole(heading.now, heading.before)) {
      const [recent, earlier] = span === 28 ? [text(words, "recent", "The last 28 days"), text(words, "earlier", "The 28 days before")] : [text(words, "recent.7", "The last 7 days"), text(words, "before7", "The 7 days before")];
      found.push(against(`${list}Heading`, recent, "clicksADay", Math.round(heading.now), Math.round(heading.before), 0.7 + Math.min(0.4, Math.abs(changeOf(heading.now, heading.before))), earlier));
    }
    return found;
  }
  // No fair span before: the newest 28 days against the 28 before them, where the dates hold both.
  const recent = text(words, "recent", "The last 28 days");
  const earlier = text(words, "earlier", "The 28 days before");
  const clicks = newestAgainstEarlier(days, "clicks", 28);
  if (clicks && clicks.before > 0 && apartWhole(clicks.now, clicks.before)) found.push(against(`${list}Recent`, recent, "clicksADay", Math.round(clicks.now), Math.round(clicks.before), 1.1 + Math.min(0.5, Math.abs(changeOf(clicks.now, clicks.before))), earlier));
  const shown = newestAgainstEarlier(days, "impressions", 28);
  if (shown && shown.before > 0 && Math.abs(changeOf(shown.now, shown.before)) >= LEAST_CHANGE) {
    found.push(against(`${list}RecentShown`, recent, "impressionsADay", Math.round(shown.now), Math.round(shown.before), 0.9 + Math.min(0.5, Math.abs(changeOf(shown.now, shown.before))), earlier));
  }
  const sorted = days.filter((day) => typeof day.day === "string").sort((left, right) => String(left.day).localeCompare(String(right.day)));
  if (sorted.length >= 56) {
    const place = placeAgainst(`${list}RecentPlace`, recent, positionOver(sorted.slice(-28)), positionOver(sorted.slice(-56, -28)), 0.8, earlier);
    if (place) found.push(place);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Performance (the section's overview)
// ---------------------------------------------------------------------------

function performanceFindings(data: Row): OwnFound[] {
  const words = wordsOf(data);
  const days = rowsOf(data.days);
  const totals = isRow(data.totals) ? data.totals : null;
  const previous = isRow(data.previous) ? data.previous : null;
  const previousDays = isNumber(data.previousDays) ? data.previousDays : null;
  const found = wholeFigures("whole", totals, previous, days, words, previousDays);
  const weekends = weekendsOf("weekends", days, words, 0.8);
  if (weekends) found.push(weekends);
  // Searches for the business's name against every other search, from the chart's days, where the chart holds every
  // day of the dates and of the span before (one built for fewer days, waiting on its rebuild, is never set beside these).
  const brand = isRow(data.brandDays) ? data.brandDays : null;
  const dates = isRow(data.dates) ? data.dates : null;
  const now = brand && isRow(brand.now) ? brand.now : null;
  const before = brand && isRow(brand.before) ? brand.before : null;
  if (now && before && dates && now.days === dates.days && before.days === dates.beforeDays) found.push(...brandMoves("brand", { now, before }, namesOf(data), 0.9));
  return found;
}

/** Non-brand searches' clicks against the span before, said beside the brand searches' own move. */
function brandMoves(list: string, split: Row, names: Words, score: number): OwnFound[] {
  const now = isRow(split.now) ? split.now : null;
  const before = isRow(split.before) ? split.before : null;
  if (!now || !before) return [];
  const brand = text(names, "brand", "Brand");
  const other = text(names, "other", "Non-brand");
  const [brandNow, brandBefore, otherNow, otherBefore] = [now.brandClicks, before.brandClicks, now.nonBrandClicks, before.nonBrandClicks];
  if (!isNumber(brandNow) || !isNumber(brandBefore) || !isNumber(otherNow) || !isNumber(otherBefore) || otherBefore <= 0) return [];
  // Times shown where the split keeps them (the lists'), else the clicks, for a fair span before.
  const shown = isNumber(now.nonBrandImpressions) && isNumber(before.nonBrandImpressions);
  if (!fairBefore(shown ? (now.nonBrandImpressions as number) : otherNow, shown ? (before.nonBrandImpressions as number) : otherBefore)) return [];
  const otherChange = changeOf(otherNow, otherBefore);
  const brandChange = brandBefore > 0 ? changeOf(brandNow, brandBefore) : null;
  return [moved(list, other, "clicks", otherNow, otherBefore, score + Math.min(0.5, Math.abs(otherChange)), brandChange === null ? undefined : { name: brand, change: brandChange })];
}

// ---------------------------------------------------------------------------
// Brand and non-brand
// ---------------------------------------------------------------------------

function brandFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const words = wordsOf(data);
  const names = namesOf(data);
  const summary = isRow(data.summary) ? data.summary : {};
  const split = isRow(summary.brand) ? summary.brand : null;
  const now = split && isRow(split.now) ? split.now : null;
  const before = split && isRow(split.before) ? split.before : null;
  if (!now) return found;
  const brand = text(names, "brand", "Brand");
  const other = text(names, "other", "Non-brand");
  const [brandClicks, otherClicks, brandShown, otherShown] = [now.brandClicks, now.nonBrandClicks, now.brandImpressions, now.nonBrandImpressions].map((value) => (isNumber(value) ? value : 0));
  // A website with no brand words, or no brand search clicked, has no split to speak of.
  if (brandClicks <= 0 || brandShown <= 0 || otherShown <= 0) return found;
  const fair = before !== null && fairBefore(otherShown, before.nonBrandImpressions as number) && isNumber(before.nonBrandClicks) && (before.nonBrandClicks as number) > 0;

  // The headline: non-brand searches' clicks against the span before, beside the brand searches' own move.
  if (fair) found.push(...brandMoves("split", split!, names, 1.4));
  // How much more often a search for the name is clicked than any other: the business's own name against the market.
  found.push({ ...ratesApart("rate", brand, brandClicks, brandShown, otherClicks, otherShown, 0, other, smallRates(brandClicks + otherClicks, brandShown + otherShown)), score: 1.1 });
  const share = (100 * brandClicks) / (brandClicks + otherClicks);
  if (fair) {
    const shareBefore = (100 * (before!.brandClicks as number)) / ((before!.brandClicks as number) + (before!.nonBrandClicks as number));
    if (Math.abs(share - shareBefore) >= 0.5) found.push(shareMoved("share", brand, "clicks", share, shareBefore, 0.8 + Math.min(0.5, Math.abs(share - shareBefore) / 10)));
    // Non-brand searches shown more or less, beside their clicks: is it demand, or is it the clicks?
    const shownChange = changeOf(otherShown, before!.nonBrandImpressions as number);
    const clickChange = changeOf(otherClicks, before!.nonBrandClicks as number);
    if (Math.abs(shownChange) >= 0.03) found.push(moved("shown", other, "impressions", otherShown, before!.nonBrandImpressions as number, 0.9 + Math.min(0.5, Math.abs(shownChange - clickChange) * 2), { name: text(words, "clicks", "Clicks"), change: clickChange }));
  } else {
    found.push(partOf("share", brand, "clicks", brandClicks, brandClicks + otherClicks, 0.8));
  }
  // The searches that gained and lost most clicks over the whole list, never only the page of it on screen.
  const whole = isRow(summary.wholeList) ? summary.wholeList : {};
  const movers = fair && isRow(whole.movers) ? whole.movers : {};
  for (const [way, score] of [["otherDown", 1.2], ["otherUp", 1.0], ["brandDown", 0.85]] as const) {
    const row = isRow(movers[way]) ? movers[way] : null;
    if (!row || typeof row.key !== "string" || !isNumber(row.clicks) || !isNumber(row.previousClicks) || row.previousClicks <= 0) continue;
    if (Math.abs(row.clicks - row.previousClicks) < 5) continue;
    found.push(moved(`mover${way}`, row.key, "clicks", row.clicks, row.previousClicks, score + Math.min(0.3, Math.abs(row.clicks - row.previousClicks) / 100)));
  }
  // Without a fair span before: the newest weeks against the weeks before them, from the chart.
  if (!fair) found.push(...chartTrend("trend", rowsOf(data.chart), [["otherClicks", other], ["brandClicks", brand]], words, 1.0));
  return found;
}

/**
 * The chart's newest periods against those before them inside the dates (by day: the last 7 days; by week: the last 4
 * weeks; by month: the last 3 months), for each field named, the biggest move first. Periods with nothing in them at
 * all are left out: they are days not held, not days nobody searched (morehandles.co.uk's months before 23 April 2026).
 */
function chartTrend(list: string, periods: Row[], fields: ReadonlyArray<readonly [string, string]>, words: Words, score: number): OwnFound[] {
  const held = periods.filter((period) => typeof period.start === "string" && fields.some(([field]) => isNumber(period[field]) && (period[field] as number) > 0));
  const whole = held.filter((period) => !isNumber(period.days) || !isNumber(period.length) || period.days === period.length);
  const step = whole.length >= 2 && whole[1].start && whole[0].start ? (Date.parse(`${whole[1].start}T00:00:00Z`) - Date.parse(`${whole[0].start}T00:00:00Z`)) / 86_400_000 : 1;
  const span = step <= 1 ? 7 : step <= 7 ? 4 : 3;
  if (whole.length < span * 2) return [];
  const recent = whole.slice(-span);
  const earlier = whole.slice(-span * 2, -span);
  const out: OwnFound[] = [];
  for (const [field, name] of fields) {
    const sum = (rows: Row[]) => rows.reduce((total, row) => total + (isNumber(row[field]) ? (row[field] as number) : 0), 0);
    const [now, before] = [sum(recent), sum(earlier)];
    if (before <= 0 || Math.abs(changeOf(now, before)) < 0.05) continue;
    out.push(against(`${list}${field}`, `${name} · ${text(words, `recent.${span}`, "The newest weeks")}`, "clicks", now, before, score + Math.min(0.5, Math.abs(changeOf(now, before))), text(words, `earlier.${span}`, "The weeks before")));
  }
  return out.sort((left, right) => right.score - left.score).slice(0, 1);
}

// ---------------------------------------------------------------------------
// Click rate by position
// ---------------------------------------------------------------------------

function curveFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const words = wordsOf(data);
  const names = namesOf(data);
  const points = rowsOf(data.points).filter((point) => isNumber(point.position) && isNumber(point.clicks) && isNumber(point.impressions));
  const at = (place: number, list = points) => list.find((point) => point.position === place);
  const nameOf = (point: Row) => named(point) ?? `${text(names, "place", "Place")} ${point.position}`;
  const trusted = (point: Row | undefined): point is Row => Boolean(point) && (point!.impressions as number) >= SHOWN_LEAST;
  const sum = (list: Row[], field: string) => list.reduce((total, point) => total + (point[field] as number), 0);
  const small = smallRates(sum(points, "clicks"), sum(points, "impressions"));

  // The headline: the top place against the next, as the chart's first two bars.
  const [first, second] = [at(1), at(2)];
  if (trusted(first) && trusted(second)) {
    const one = ratesApart("top", nameOf(first), first.clicks as number, first.impressions as number, second.clicks as number, second.impressions as number, 0, nameOf(second), small);
    found.push({ ...one, score: 1.4 + Math.min(0.4, Math.abs(Math.log(Math.max(0.01, (one.params.value as number) / Math.max(0.01, one.params.mean as number))))) });
  }
  // A place clicked more often than the one above it, the biggest such gap where both are shown enough to trust.
  const outOfOrder = points
    .filter((point) => (point.position as number) > 2 && (point.position as number) <= 10)
    .map((point) => ({ point, above: at((point.position as number) - 1) }))
    .filter((one): one is { point: Row; above: Row } => trusted(one.point) && trusted(one.above))
    .map((one) => ({ ...one, gap: (one.point.clicks as number) / (one.point.impressions as number) - (one.above.clicks as number) / (one.above.impressions as number) }))
    .filter((one) => one.gap > 0 && one.gap / ((one.above.clicks as number) / Math.max(1, one.above.impressions as number) || 1) >= 0.2)
    .sort((left, right) => right.gap - left.gap)[0];
  if (outOfOrder) found.push({ ...ratesApart("order", nameOf(outOfOrder.point), outOfOrder.point.clicks as number, outOfOrder.point.impressions as number, outOfOrder.above.clicks as number, outOfOrder.above.impressions as number, 0, nameOf(outOfOrder.above), small), score: 1.1 });
  // Google's first page against its second.
  const pageOne = points.filter((point) => (point.position as number) <= 10);
  const pageTwo = points.filter((point) => (point.position as number) > 10 && (point.position as number) <= 20);
  if (sum(pageOne, "impressions") >= SHOWN_LEAST && sum(pageTwo, "impressions") >= SHOWN_LEAST) {
    found.push({ ...ratesApart("pages", text(names, "firstPage", "Google's first page"), sum(pageOne, "clicks"), sum(pageOne, "impressions"), sum(pageTwo, "clicks"), sum(pageTwo, "impressions"), 0, text(names, "secondPage", "Google's second page"), small), score: 0.9 });
  }
  // What a climb into the top 3 is worth here: the top three places' click rate against places 4 to 10.
  const fourToTen = points.filter((point) => (point.position as number) >= 4 && (point.position as number) <= 10);
  const topPlaces = points.filter((point) => (point.position as number) <= 3);
  if (sum(topPlaces, "impressions") >= SHOWN_LEAST && sum(fourToTen, "impressions") >= SHOWN_LEAST) {
    found.push({ ...ratesApart("climb", text(names, "topThree", "Places 1 to 3"), sum(topPlaces, "clicks"), sum(topPlaces, "impressions"), sum(fourToTen, "clicks"), sum(fourToTen, "impressions"), 0, text(names, "fourToTen", "Places 4 to 10"), small), score: 1.0 });
  }
  // Where the clicks come from: the top three places' share of every click, beside their share of the times shown.
  const top = points.filter((point) => (point.position as number) <= 3);
  const [clicks, shown] = [sum(points, "clicks"), sum(points, "impressions")];
  if (clicks > 0 && shown > 0 && sum(top, "clicks") > 0) {
    const part = partOf("topShare", text(names, "topThree", "Places 1 to 3"), "clicks", sum(top, "clicks"), clicks, 0.85);
    part.facts.push({ key: "shownShare", value: round1((100 * sum(top, "impressions")) / shown), unit: "percent", label: `${text(names, "topThree", "Places 1 to 3")}: share of all the times shown` });
    found.push(part);
  }
  // Against the span before: the top place whose click rate moved most, where both spans show it enough to trust.
  // Only a whole span before: More Handles' Last 6 months held 9 of its 181 days before (`fairBefore`).
  const held = rowsOf(data.before).filter((point) => isNumber(point.position) && isNumber(point.clicks) && isNumber(point.impressions));
  const before = fairBefore(sum(points, "impressions"), sum(held, "impressions")) ? held : [];
  const beforeName = text(words, "before", "The span before");
  const movedMost = points
    .filter((point) => (point.position as number) <= 5)
    .map((point) => ({ point, then: at(point.position as number, before) }))
    .filter((one): one is { point: Row; then: Row } => trusted(one.point) && trusted(one.then) && (one.then.clicks as number) > 0)
    .map((one) => ({ ...one, move: Math.abs(Math.log(Math.max(0.01, ((one.point.clicks as number) / (one.point.impressions as number)) / ((one.then.clicks as number) / (one.then.impressions as number))))) }))
    .filter((one) => one.move >= Math.log(1.2))
    .sort((left, right) => right.move - left.move)[0];
  if (movedMost) found.push({ ...ratesApart("before", nameOf(movedMost.point), movedMost.point.clicks as number, movedMost.point.impressions as number, movedMost.then.clicks as number, movedMost.then.impressions as number, 0, beforeName, small), score: 1.0 + Math.min(0.4, movedMost.move) });
  return found;
}

// ---------------------------------------------------------------------------
// Demand by service
// ---------------------------------------------------------------------------

/** A service with this many clicks the span before, or times shown, is enough to trust a move. */
const SERVICE_CLICKS = 20;

function servicesFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const words = wordsOf(data);
  const names = namesOf(data);
  const others = text(names, "others", "The other services");
  // Pages not sorted yet are in the totals, never named: Hakken's own housekeeping (Anthony, 2026-11-03).
  const all = rowsOf(data.services).filter((row) => isNumber(row.impressions) && isNumber(row.clicks));
  const services = all.filter((row) => named(row) && row.sorted !== false);
  const total = (field: string, rows = all) => rows.reduce((sum, row) => sum + (isNumber(row[field]) ? (row[field] as number) : 0), 0);
  const [shown, clicks] = [total("impressions"), total("clicks")];
  const fair = fairBefore(shown, total("impressionsBefore")) && total("clicksBefore") > 0;

  if (fair) {
    // The headline: the service whose clicks moved most, weighed by the clicks it gained or lost, against the rest.
    const movers = services
      .filter((row) => isNumber(row.clicksBefore) && (row.clicksBefore as number) >= SERVICE_CLICKS)
      .map((row) => ({ row, by: (row.clicks as number) - (row.clicksBefore as number) }))
      .filter((one) => Math.abs(one.by) >= 5 && Math.abs(one.by / (one.row.clicksBefore as number)) >= 0.05)
      .sort((left, right) => Math.abs(right.by) - Math.abs(left.by));
    const restChange = (row: Row) => {
      const before = total("clicksBefore") - (row.clicksBefore as number);
      return before > 0 ? changeOf(clicks - (row.clicks as number), before) : 0;
    };
    const head = movers[0];
    if (head) found.push(moved("services", named(head.row)!, "clicks", head.row.clicks as number, head.row.clicksBefore as number, 1.4 + Math.min(0.4, Math.abs(head.by) / Math.max(1, total("clicksBefore")) * 5), { name: others, change: restChange(head.row) }));
    // The biggest move the other way, where there is one.
    const otherWay = movers.find((one) => head && Math.sign(one.by) !== Math.sign(head.by));
    if (otherWay) found.push(moved("servicesOther", named(otherWay.row)!, "clicks", otherWay.row.clicks as number, otherWay.row.clicksBefore as number, 1.0 + Math.min(0.4, Math.abs(otherWay.by) / Math.max(1, total("clicksBefore")) * 5), { name: others, change: restChange(otherWay.row) }));
    // A service Google showed more while people clicked it less: the clicks, not the demand.
    const split = services
      .filter((row) => isNumber(row.impressionsBefore) && (row.impressionsBefore as number) > 0 && isNumber(row.clicksBefore) && (row.clicksBefore as number) >= SERVICE_CLICKS)
      .map((row) => ({ row, shown: changeOf(row.impressions as number, row.impressionsBefore as number), clicked: changeOf(row.clicks as number, row.clicksBefore as number) }))
      .filter((one) => one.shown >= 0.05 && one.clicked <= -0.1 && one.row !== head?.row)
      .sort((left, right) => (right.shown - right.clicked) - (left.shown - left.clicked))[0];
    if (split) found.push(moved("servicesShown", named(split.row)!, "impressions", split.row.impressions as number, split.row.impressionsBefore as number, 1.1 + Math.min(0.4, split.shown - split.clicked), { name: text(words, "clicks", "Clicks"), change: split.clicked }));
    // The service whose share of every time Google showed the website moved most.
    const shownBefore = total("impressionsBefore");
    const shares = services
      .filter((row) => isNumber(row.impressionsBefore))
      .map((row) => ({ row, share: (100 * (row.impressions as number)) / shown, before: (100 * (row.impressionsBefore as number)) / shownBefore }))
      .filter((one) => Math.abs(one.share - one.before) >= 1)
      .sort((left, right) => Math.abs(right.share - right.before) - Math.abs(left.share - left.before))[0];
    if (shares) found.push(shareMoved("servicesShare", named(shares.row)!, "impressions", shares.share, shares.before, 0.8 + Math.min(0.4, Math.abs(shares.share - shares.before) / 10)));
  } else {
    // Without a fair span before: the service with most of the clicks.
    const top = [...services].sort((left, right) => (right.clicks as number) - (left.clicks as number))[0];
    if (top && clicks > 0) found.push(partOf("servicesClicks", named(top)!, "clicks", top.clicks as number, clicks, 1.0));
  }
  // Clicked far more or less often than the other services, for the times Google showed it: the most and the least.
  const rated = services
    .filter((row) => (row.impressions as number) >= SHOWN_LEAST * 10 && shown - (row.impressions as number) > 0)
    .map((row) => {
      const rate = (row.clicks as number) / (row.impressions as number);
      const rest = (clicks - (row.clicks as number)) / (shown - (row.impressions as number));
      return { row, rate, rest, weight: Math.abs(Math.log(Math.max(0.01, rate / Math.max(1e-6, rest)))) * Math.sqrt((row.impressions as number) / shown) };
    })
    .filter((one) => one.rest > 0 && (one.rate / one.rest >= 1.5 || one.rate / one.rest <= 1 / 1.5));
  const ranked = firstOfEachList(
    [...rated].sort((left, right) => right.weight - left.weight).map((one) => ({ ...one, list: one.rate > one.rest ? "above" : "below" })),
    2,
  );
  for (const one of ranked) {
    found.push({ ...ratesApart(`rate${one.list}`, named(one.row)!, one.row.clicks as number, one.row.impressions as number, clicks - (one.row.clicks as number), shown - (one.row.impressions as number), 0, others, smallRates(clicks, shown)), score: 0.9 + Math.min(0.4, one.weight) });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Google updates
// ---------------------------------------------------------------------------

function updatesFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const words = wordsOf(data);
  const names = namesOf(data);
  const beforeIt = text(names, "beforeIt", "Before it");
  const updates = rowsOf(data.updates).filter((row) => typeof row.title === "string");
  const done = updates.filter((row) => row.state === "done" && isNumber(row.beforeClicks) && isNumber(row.afterClicks) && (row.beforeClicks as number) > 0);
  // The update that moved clicks most, the 14 days after against the 14 before, beside the one that moved them next most.
  const ranked = [...done].sort((left, right) => Math.abs(changeOf(right.afterClicks as number, right.beforeClicks as number)) - Math.abs(changeOf(left.afterClicks as number, left.beforeClicks as number)));
  const [most, next] = ranked;
  if (most) {
    const change = changeOf(most.afterClicks as number, most.beforeClicks as number);
    found.push(moved("updates", most.title as string, "clicks", most.afterClicks as number, most.beforeClicks as number, 1.4 + Math.min(0.5, Math.abs(change)), next ? { name: next.title as string, change: changeOf(next.afterClicks as number, next.beforeClicks as number) } : undefined));
  }
  // The update after which the website's place moved most, with where it stands now.
  const today = isRow(data.days) && isRow(data.days.totals) ? data.days.totals : null;
  const placed = done
    .filter((row) => isNumber(row.beforePosition) && isNumber(row.afterPosition))
    .sort((left, right) => Math.abs((right.afterPosition as number) - (right.beforePosition as number)) - Math.abs((left.afterPosition as number) - (left.beforePosition as number)))[0];
  const place = placed ? placeAgainst("updatesPlace", placed.title as string, placed.afterPosition as number, placed.beforePosition as number, 0.9, beforeIt) : null;
  if (place) {
    if (today && isNumber(today.position)) place.facts.push({ key: "today", value: round1(today.position), unit: "score", label: "the website's place over the dates chosen" });
    found.push(place);
  }
  // An update during which the website's places moved far more than in the fortnight before it.
  const shaken = updates
    .filter((row) => isNumber(row.volatilityBefore) && isNumber(row.volatilityDuring) && (row.volatilityBefore as number) > 0)
    .map((row) => ({ row, more: (row.volatilityDuring as number) / (row.volatilityBefore as number) - 1 }))
    .filter((one) => one.more >= 0.3)
    .sort((left, right) => right.more - left.more)[0];
  if (shaken) found.push(against("updatesVolatility", shaken.row.title as string, "volatility", shaken.row.volatilityDuring as number, shaken.row.volatilityBefore as number, 1.0 + Math.min(0.4, shaken.more), beforeIt));
  // The dates' own figures, beside how many updates they hold: with none, a move is the website's own.
  const figures = isRow(data.days) ? data.days : {};
  const whole = wholeFigures("dates", isRow(figures.totals) ? figures.totals : null, isRow(figures.previous) ? figures.previous : null, rowsOf(figures.days), words, isNumber(figures.previousDays) ? figures.previousDays : null);
  for (const one of whole) {
    one.facts.push({ key: "updates", value: updates.length, unit: "count", label: "Google updates that began in the dates chosen" });
    found.push({ ...one, score: one.score - (updates.length > 0 ? 0.4 : 0) });
  }
  return found;
}

// ---------------------------------------------------------------------------
// A search's and a page's own screens
// ---------------------------------------------------------------------------

/** A split row's share of the record's clicks against the whole website's share, this many points apart. */
const SPLIT_POINTS = 10;

function recordFindings(dimension: "keyword" | "page") {
  return (data: Row): OwnFound[] => {
    const found: OwnFound[] = [];
    const words = wordsOf(data);
    const names = namesOf(data);
    const beforeName = text(words, "before", "The span before");
    const name = text(data, "name", text(data, dimension, dimension === "keyword" ? "This search" : "This page"));
    const figures = isRow(data.figures) ? data.figures : {};
    const totals = isRow(figures.totals) ? figures.totals : null;
    const previous = isRow(figures.previous) ? figures.previous : null;
    if (!totals || !isNumber(totals.clicks) || !isNumber(totals.impressions)) return found;
    const fair = previous !== null && fairBefore(totals.impressions, previous.impressions as number);

    // The headline: its clicks against the span before.
    if (fair && isNumber(previous!.clicks) && (previous!.clicks as number) > 0) {
      found.push(moved("record", name, "clicks", totals.clicks, previous!.clicks as number, 1.4 + Math.min(0.5, Math.abs(changeOf(totals.clicks, previous!.clicks as number)))));
    }
    // Its place against the span before.
    const place = fair ? placeAgainst("recordPlace", name, totals.position as number, previous!.position as number, 1.0, beforeName) : null;
    if (place) found.push(place);
    // How often it was clicked for the times shown, against the span before.
    if (fair && isNumber(previous!.clicks) && (previous!.clicks as number) > 0 && totals.clicks > 0) {
      const rate = ratesApart("recordRateBefore", name, totals.clicks, totals.impressions, previous!.clicks as number, previous!.impressions as number, 0, beforeName, smallRates(totals.clicks, totals.impressions));
      const move = Math.abs(Math.log(Math.max(0.01, (rate.params.value as number) / Math.max(0.01, rate.params.mean as number))));
      if (move >= Math.log(1.1)) found.push({ ...rate, score: 0.9 + Math.min(0.4, move) });
    }
    // Clicked more or less often than the whole website at the same place on Google (its own click curve).
    const website = isRow(data.website) ? data.website : {};
    const curve = rowsOf(website.curve);
    const at = isNumber(totals.position) ? curve.find((point) => point.position === Math.round(totals.position as number)) : undefined;
    if (at && isNumber(at.clicks) && isNumber(at.impressions) && (at.impressions as number) >= SHOWN_LEAST && totals.impressions >= 100) {
      const one = ratesApart("recordRate", name, totals.clicks, totals.impressions, at.clicks as number, at.impressions as number, 0, named(at) ?? `${text(names, "websiteAt", "The whole website at place")} ${at.position}`, smallRates(totals.clicks, totals.impressions));
      const gap = Math.abs(Math.log(Math.max(0.01, (one.params.value as number) / Math.max(0.01, one.params.mean as number))));
      if (gap >= Math.log(1.3)) found.push({ ...one, score: 1.1 + Math.min(0.4, gap / 2) });
    }
    // Where its clicks came from against the whole website: the device and the country furthest from the website's share.
    const cameFrom = isRow(data.cameFrom) ? data.cameFrom : {};
    for (const [list, label] of [["devices", "device"], ["countries", "country"]] as const) {
      const mine = rowsOf(cameFrom[list]).filter((row) => named(row) && isNumber(row.clicks));
      const theirs = rowsOf(website[list]).filter((row) => named(row) && isNumber(row.clicks));
      const [myClicks, allClicks] = [mine, theirs].map((rows) => rows.reduce((sum, row) => sum + (row.clicks as number), 0));
      if (myClicks < 20 || allClicks <= 0) continue;
      const apart = mine
        .map((row) => {
          const share = (100 * (row.clicks as number)) / myClicks;
          const same = theirs.find((other) => named(other) === named(row));
          return { row, share, site: same ? (100 * (same.clicks as number)) / allClicks : 0 };
        })
        .filter((one) => Math.abs(one.share - one.site) >= SPLIT_POINTS && Math.max(one.share, one.site) >= 15)
        .sort((left, right) => Math.abs(right.share - right.site) - Math.abs(left.share - left.site))[0];
      if (!apart) continue;
      found.push({
        ...against(`record${label}`, named(apart.row)!, "ownClicksSharePercent", apart.share, apart.site, 0.8 + Math.min(0.4, Math.abs(apart.share - apart.site) / 50), text(words, "website", "The whole website")),
        params: { name: named(apart.row)!, measure: "ownClicksSharePercent", value: round1(apart.share), mean: round1(apart.site), against: "website" },
      });
    }
    // The other side of the record: a search split between pages, or a page's search that moved most.
    const rows = rowsOf(data.rows).filter((row) => named(row) && isNumber(row.clicks));
    const rowClicks = rows.reduce((sum, row) => sum + (row.clicks as number), 0);
    if (dimension === "keyword" && rows.length >= 2 && rowClicks >= 10) {
      const [, second] = [...rows].sort((left, right) => (right.clicks as number) - (left.clicks as number));
      if (second && (second.clicks as number) / rowClicks >= 0.2) {
        const part = partOf("recordPages", named(second)!, "clicks", second.clicks as number, rowClicks, 1.0 + Math.min(0.3, (second.clicks as number) / rowClicks - 0.2));
        part.facts.push({ key: "pages", value: rows.length, unit: "count", label: `${name}: the website's pages Google showed for it` });
        found.push(part);
      }
    }
    if (dimension === "page" && fair) {
      const lost = isNumber(previous!.clicks) ? (previous!.clicks as number) - totals.clicks : 0;
      const movers = rows
        .filter((row) => isNumber(row.previousClicks) && (row.previousClicks as number) > 0)
        .map((row) => ({ row, by: (row.clicks as number) - (row.previousClicks as number) }))
        .filter((one) => Math.abs(one.by) >= 5)
        .sort((left, right) => Math.abs(right.by) - Math.abs(left.by));
      const most = movers.find((one) => (lost > 0 ? one.by < 0 : one.by > 0)) ?? movers[0];
      if (most) {
        const one = moved("recordSearch", named(most.row)!, "clicks", most.row.clicks as number, most.row.previousClicks as number, 1.0 + Math.min(0.4, Math.abs(most.by) / Math.max(10, Math.abs(lost))));
        if (lost !== 0) one.facts.push({ key: "pageChange", value: Math.abs(lost), unit: "count", label: `${name}: clicks ${lost > 0 ? "lost" : "gained"} in all` });
        found.push(one);
      }
    }
    return found;
  };
}

/** A day moved by whole days. */
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// New and lost
// ---------------------------------------------------------------------------

function newLostFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const names = namesOf(data);
  const words = wordsOf(data);
  const counts = isRow(data.counts) ? data.counts : null;
  if (!counts || !isNumber(counts.newKeywords) || !isNumber(counts.lostKeywords)) return found;
  const before = isRow(data.countsBefore) ? data.countsBefore : null;
  const [gained, lost] = [counts.newKeywords, counts.lostKeywords];
  // The headline: searches new and lost, against the span before's.
  const keywordsBefore = before && isNumber(before.newKeywords) && isNumber(before.lostKeywords) ? { gained: before.newKeywords, lost: before.lostKeywords } : null;
  found.push(newAgainstLost("searches", "searches", gained, lost, keywordsBefore, 1.6 + Math.min(0.5, Math.abs(lost - gained) / Math.max(1, gained + lost))));
  if (isNumber(counts.newPages) && isNumber(counts.lostPages) && counts.newPages + counts.lostPages > 0) {
    const pagesBefore = before && isNumber(before.newPages) && isNumber(before.lostPages) ? { gained: before.newPages, lost: before.lostPages } : null;
    found.push(newAgainstLost("pages", "pages", counts.newPages, counts.lostPages, pagesBefore, 0.9 + Math.min(0.4, Math.abs(counts.lostPages - counts.newPages) / Math.max(1, counts.newPages + counts.lostPages))));
  }
  // Where on Google the lost were, and the new are: the first page's share of each.
  const bands = isRow(data.bands) ? data.bands : {};
  const firstPage = (counted: unknown) => (isRow(counted) ? (isNumber(counted["1-3"]) ? counted["1-3"] : 0) + (isNumber(counted["4-10"]) ? counted["4-10"] : 0) : 0);
  const placed = (counted: unknown) => (isRow(counted) ? Object.values(counted).reduce<number>((sum, value) => sum + (isNumber(value) ? value : 0), 0) : 0);
  const lostFirst = firstPage(bands.lost);
  if (lostFirst >= 10 && placed(bands.lost) > 0) {
    const part = partOf("lostFirst", text(names, "lostFirstPage", "Lost from Google's first page"), "searchesLost", lostFirst, placed(bands.lost), 1.1 + Math.min(0.3, lostFirst / placed(bands.lost)));
    part.facts.push({ key: "lostAll", value: lost, unit: "count", label: "searches lost in all; the share is of those whose place Google gave, of the newest read" });
    found.push(part);
  }
  const newFirst = firstPage(bands.new);
  if (newFirst >= 5 && placed(bands.new) > 0) {
    const part = partOf("newFirst", text(names, "newFirstPage", "New on Google's first page"), "searchesGained", newFirst, placed(bands.new), 1.0 + Math.min(0.3, newFirst / placed(bands.new)));
    part.facts.push({ key: "newAll", value: gained, unit: "count", label: "new searches in all; the share is of those whose place Google gave, of the newest read" });
    found.push(part);
  }
  // The newest days, weeks or months against those before them inside the dates: searches lost, and new, each a day.
  const periods = rowsOf(data.periods).filter((period) => typeof period.start === "string" && isNumber(period.gained) && isNumber(period.lost));
  const dayOf = (period: Row) => Math.max(1, Math.round((Date.parse(`${period.lastDay ?? period.start}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / 86_400_000) + 1);
  const step = periods.length >= 2 ? dayOf(periods[1]) : 1;
  const span = step <= 1 ? 7 : step <= 7 ? 4 : 3;
  // Whole days, weeks or months only, with something in them: a month of one day is no month, and days before the
  // website was watched count nothing.
  // From when the register counts both (watched, then the lost days passed: before it, every search shown reads new and
  // none lost — More Handles' first week, 20 July 2026, "gained" 4,878).
  const counting = typeof data.watchedFrom === "string" ? addDays(data.watchedFrom, 14) : null;
  const whole = periods.filter((period) => dayOf(period) >= Math.min(step, 28) && (period.gained as number) + (period.lost as number) > 0 && (!counting || String(period.start) >= counting));
  if (whole.length >= span * 2) {
    const recent = whole.slice(-span);
    const earlier = whole.slice(0, -span);
    const aDay = (rows: Row[], field: string) => rows.reduce((sum, row) => sum + (row[field] as number), 0) / rows.reduce((sum, row) => sum + dayOf(row), 0);
    const options = (["lost", "gained"] as const).map((field) => ({ field, now: aDay(recent, field), before: aDay(earlier, field) }))
      .filter((one) => one.before > 0 && Math.abs(changeOf(one.now, one.before)) >= 0.15 && apartWhole(one.now, one.before))
      .sort((left, right) => Math.abs(changeOf(right.now, right.before)) - Math.abs(changeOf(left.now, left.before)));
    const most = options[0];
    if (most) {
      found.push(against("trend", text(words, `recent.${span}`, "The newest days"), most.field === "lost" ? "lostADay" : "newADay", Math.round(most.now), Math.round(most.before), 1.0 + Math.min(0.5, Math.abs(changeOf(most.now, most.before))), text(words, `earlier.${span}`, "The days before")));
    }
  }
  // The day, week or month that lost (or gained) far more searches than the rest: a day Google dropped many at once.
  // By the day only: a week or a month that lost more is the newest weeks' rise, said above.
  const counted = step === 1 ? whole : [];
  if (counted.length >= 5) {
    const peaks = (["lost", "gained"] as const).map((field) => {
      const mean = counted.reduce((sum, row) => sum + (row[field] as number), 0) / counted.length;
      const top = [...counted].sort((left, right) => (right[field] as number) - (left[field] as number))[0];
      return { field, top, mean, over: mean > 0 ? (top[field] as number) / mean - 1 : 0 };
    }).filter((one) => named(one.top) && one.over >= 0.3).sort((left, right) => right.over - left.over);
    const peak = peaks[0];
    if (peak) {
      found.push(against("peak", named(peak.top)!, peak.field === "lost" ? "searchesLost" : "searchesGained", peak.top[peak.field] as number, Math.round(peak.mean), 0.8 + Math.min(0.4, peak.over / 2), text(words, `average.${span}`, "On average")));
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Position bands
// ---------------------------------------------------------------------------

function bandsFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const names = namesOf(data);
  const words = wordsOf(data);
  const summary = isRow(data.summary) ? data.summary : {};
  const bands = isRow(summary.bands) ? summary.bands : null;
  const before = isRow(summary.bandsBefore) ? summary.bandsBefore : null;
  if (!bands) return found;
  const count = (counted: Row | null, band: string) => (counted && isNumber(counted[band]) ? (counted[band] as number) : 0);
  const all = (counted: Row | null) => (counted ? Object.values(counted).reduce<number>((sum, value) => sum + (isNumber(value) ? value : 0), 0) : 0);
  const nameOf = (band: string) => text(names, band, band);
  const fair = before !== null && fairBefore(all(bands), all(before));

  if (fair) {
    // The headline: the top 3 against the span before, beside the next band's move.
    const [top, topBefore, next, nextBefore] = [count(bands, "1-3"), count(before, "1-3"), count(bands, "4-10"), count(before, "4-10")];
    if (topBefore > 0) found.push(moved("bands", nameOf("1-3"), "searches", top, topBefore, 1.4 + Math.min(0.5, Math.abs(changeOf(top, topBefore))), nextBefore > 0 ? { name: nameOf("4-10"), change: changeOf(next, nextBefore) } : undefined));
    // The band that moved most of the rest, by the searches it gained or lost.
    const rest = ["4-10", "11-20", "21-50"]
      .map((band) => ({ band, by: count(bands, band) - count(before, band) }))
      .filter((one) => count(before, one.band) > 0 && Math.abs(one.by / count(before, one.band)) >= 0.05)
      .sort((left, right) => Math.abs(right.by) - Math.abs(left.by))[0];
    if (rest) found.push(moved("bandsMoved", nameOf(rest.band), "searches", count(bands, rest.band), count(before, rest.band), 0.9 + Math.min(0.4, Math.abs(rest.by / count(before, rest.band)))));
  }
  // Searches that came into and left the top 3 and the first page, of those clicked in either span.
  const whole = isRow(summary.wholeList) ? summary.wholeList : {};
  const crossed = fair && isRow(whole.crossed) ? whole.crossed : null;
  if (crossed && isNumber(crossed.top3In) && isNumber(crossed.top3Out) && crossed.top3In + crossed.top3Out >= 10) {
    found.push(newAgainstLost("top3", "top3", crossed.top3In, crossed.top3Out, null, 1.1 + Math.min(0.4, Math.abs(crossed.top3Out - crossed.top3In) / Math.max(1, crossed.top3In + crossed.top3Out))));
  }
  if (crossed && isNumber(crossed.pageOneIn) && isNumber(crossed.pageOneOut) && crossed.pageOneIn + crossed.pageOneOut >= 10) {
    found.push(newAgainstLost("pageOne", "pageOne", crossed.pageOneIn, crossed.pageOneOut, null, 1.0 + Math.min(0.4, Math.abs(crossed.pageOneOut - crossed.pageOneIn) / Math.max(1, crossed.pageOneIn + crossed.pageOneOut))));
  }
  // Each band's share of the clicks: the top 3's against the span before, or, without one, the band holding most.
  const clicks = isRow(whole.bandClicks) ? whole.bandClicks : null;
  const clicksBefore = fair && isRow(whole.bandClicksBefore) ? whole.bandClicksBefore : null;
  if (clicks && all(clicks) > 0) {
    const share = (100 * count(clicks, "1-3")) / all(clicks);
    if (clicksBefore && all(clicksBefore) > 0) {
      const shareBefore = (100 * count(clicksBefore, "1-3")) / all(clicksBefore);
      if (Math.abs(share - shareBefore) >= 1) found.push(shareMoved("bandsClicks", nameOf("1-3"), "clicks", share, shareBefore, 0.9 + Math.min(0.4, Math.abs(share - shareBefore) / 10)));
    } else {
      const most = Object.keys(clicks).sort((left, right) => count(clicks, right) - count(clicks, left))[0];
      if (most) found.push(partOf("bandsClicks", nameOf(most), "clicks", count(clicks, most), all(clicks), 0.9));
    }
  }
  // Searches just off the first page, a push from it: 11 to 20.
  const near = count(bands, "11-20");
  if (near > 0 && all(bands) > 0) found.push(partOf("bandsNear", nameOf("11-20"), "searches", near, all(bands), 0.7 + Math.min(0.3, near / all(bands))));
  // Without a fair span before: the top 3's newest weeks against the weeks before them, from the chart.
  if (!fair) {
    const periods = rowsOf(data.chart).filter((period) => isNumber(period.top3) && (period.top3 as number) > 0 && (!isNumber(period.days) || !isNumber(period.length) || period.days === period.length));
    const gap = periods.length >= 2 ? (Date.parse(`${periods[1].start}T00:00:00Z`) - Date.parse(`${periods[0].start}T00:00:00Z`)) / 86_400_000 : 7;
    const span = gap <= 1 ? 7 : gap <= 7 ? 4 : 3;
    if (periods.length >= span * 2) {
      const average = (rows: Row[]) => rows.reduce((sum, row) => sum + (row.top3 as number), 0) / rows.length;
      const [now, then] = [average(periods.slice(-span)), average(periods.slice(-span * 2, -span))];
      if (then > 0 && Math.abs(changeOf(now, then)) >= 0.03) found.push(against("bandsTrend", `${nameOf("1-3")} · ${text(words, `recent.${span}`, "The newest weeks")}`, "top3", Math.round(now), Math.round(then), 1.0 + Math.min(0.4, Math.abs(changeOf(now, then))), text(words, `earlier.${span}`, "The weeks before")));
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Volatility
// ---------------------------------------------------------------------------

function volatilityFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const words = wordsOf(data);
  const names = namesOf(data);
  const facts = isRow(data.volatility) ? data.volatility : null;
  if (!facts) return found;
  const latest = isRow(facts.latest) ? facts.latest : null;
  const update = isRow(facts.update) ? facts.update : null;
  const running: FindingFact = { key: "update", value: update ? 1 : 0, unit: "count", label: "Google updates rolling out or just finished" };
  // The headline: the newest complete day against the website's own usual.
  if (latest && isNumber(latest.volatility) && isNumber(facts.usual) && facts.usual > 0) {
    const times = latest.volatility / facts.usual;
    const one = against("latest", text(names, "latest", String(latest.day ?? "The newest day")), "volatility", latest.volatility, facts.usual, 1.4 + Math.min(0.5, Math.abs(Math.log(Math.max(0.01, times)))), text(names, "usual", "Your usual"));
    one.facts.push(running);
    found.push(one);
  }
  // The last 7 days against the 7 before.
  const week = isRow(facts.week) ? facts.week : null;
  if (week && isNumber(week.now) && isNumber(week.before) && week.before > 0 && Math.abs(week.now - week.before) >= 0.2) {
    found.push(against("week", text(names, "last7", "The last 7 days"), "volatility", week.now, week.before, 1.1 + Math.min(0.4, Math.abs(Math.log(week.now / week.before))), text(names, "week7Before", "The 7 days before")));
  }
  // Times shown against clicks over the same 7 days: is it demand, or is it the places?
  const clicks = isRow(facts.clicks) ? facts.clicks : null;
  const shown = isRow(facts.impressions) ? facts.impressions : null;
  if (clicks && shown && isNumber(shown.now) && isNumber(shown.before) && shown.before > 0 && isNumber(clicks.now) && isNumber(clicks.before) && clicks.before > 0) {
    const [shownChange, clickChange] = [changeOf(shown.now, shown.before), changeOf(clicks.now, clicks.before)];
    if (Math.abs(shownChange) >= LEAST_CHANGE || Math.abs(clickChange) >= LEAST_CHANGE) {
      found.push(moved("demand", text(names, "last7", "The last 7 days"), "impressions", shown.now, shown.before, 1.0 + Math.min(0.5, Math.max(Math.abs(shownChange), Math.abs(clickChange))), { name: text(words, "clicks", "Clicks"), change: clickChange }));
    }
  }
  // Searches that climbed five places or more on the newest day, against those that fell as far.
  if (latest && isNumber(latest.movedUp5) && isNumber(latest.movedDown5) && latest.movedUp5 + latest.movedDown5 >= 5) {
    const one = against("moved5", text(names, "climbed5", "Climbed 5 places or more"), "searches", latest.movedUp5, latest.movedDown5, 0.9 + Math.min(0.4, Math.abs(latest.movedUp5 - latest.movedDown5) / Math.max(1, latest.movedUp5 + latest.movedDown5)), text(names, "fell5", "Fell 5 places or more"));
    if (isNumber(latest.keywords)) one.facts.push({ key: "counted", value: latest.keywords, unit: "count", label: "searches counted that day" });
    found.push(one);
  }
  // Google's update in play: the website's places during it against the fortnight before.
  if (update && typeof update.title === "string" && isNumber(update.during) && isNumber(update.before) && update.before > 0) {
    found.push(against("update", update.title, "volatility", update.during, update.before, 1.2 + Math.min(0.4, Math.abs(Math.log(update.during / update.before))), text(names, "beforeIt", "Before it")));
  }
  // The search with clicks that moved most on the newest day.
  const rows = rowsOf(data.rows).filter((row) => named(row) && isNumber(row.clicks) && (row.clicks as number) >= 1 && isNumber(row.position) && isNumber(row.previousPosition));
  const most = [...rows].sort((left, right) => Math.abs((right.previousPosition as number) - (right.position as number)) * Math.sqrt(right.clicks as number) - Math.abs((left.previousPosition as number) - (left.position as number)) * Math.sqrt(left.clicks as number))[0];
  const place = most ? placeAgainst("search", named(most)!, most.position as number, most.previousPosition as number, 0.7, text(names, "dayBefore", "The day before")) : null;
  if (place && Math.abs((most!.previousPosition as number) - (most!.position as number)) >= 3) found.push(place);
  return found;
}

/** Search Console's pages with rules of their own (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6), by the eye's key for them. */
export const SEARCH_CONSOLE_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  "searchConsole.performance": { general: false, find: performanceFindings },
  "searchConsole.brand": { general: false, find: brandFindings },
  "searchConsole.ctrCurve": { general: false, find: curveFindings },
  "searchConsole.services": { general: false, find: servicesFindings },
  "searchConsole.updates": { general: false, find: updatesFindings },
  "searchConsole.keyword": { general: false, find: recordFindings("keyword") },
  "searchConsole.page": { general: false, find: recordFindings("page") },
  "searchConsole.newLost": { general: false, find: newLostFindings },
  "searchConsole.bands": { general: false, find: bandsFindings },
  "searchConsole.volatility": { general: false, find: volatilityFindings },
};
