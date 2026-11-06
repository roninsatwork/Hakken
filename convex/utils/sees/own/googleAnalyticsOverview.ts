import { bestFor } from "../../channelPicks";
import { isFirstStep } from "../../conversionSteps";
import { NOT_SET } from "../../landingFlow";
import { pathOfAddress } from "../analytics";
import { fallOneExplains, type Channel } from "./googleAnalyticsChannels";
import { GROUP_LEAST, RATE_APART, SHARE_POINTS, beside, changeOf, headline, nameIn, namesOf, perHundred, perHundredApart, rateMoved, rowNameOf, sumOf, visitMovers, visitsBeforeOf } from "./googleAnalyticsShared";
import { isNumber, isRow, moved, partOf, rowsOf, type OwnFound, type Row } from "./shared";

/**
 * Overview (overview-new-page-plan-2026-11-06.md, step 11). The page's own rules, on a shop and on a service business, for whatever
 * dates are chosen: each compares a figure with something and picks the biggest thing it can, and a bar only keeps out what's too
 * small to trust. A shop leads with what was bought, and any other website with its events. The whole website's figures are Google's
 * own total; a list's rows are set only against that same list (Google counts each list on its own). Read through `overviewFigures`,
 * so the eye and Ask Hakken agree with the page. Worked from More Handles', Hurtwood House's and Ronins' saved figures.
 */

/** A website with fewer visits than this has too little for the usual bars: a channel of 20 visits still says something. */
const SMALL_WEBSITE = 2_000;
const LEAST_SMALL = 20;
/** A change under this share of the dates before is no news. */
const LEAST_CHANGE = 0.02;
/** A row's share of what's done this many points from its share of the visits. */
const BAND_GAP = 3;
/** Fewer done than this across a list, and its shares move by chance. */
const BAND_LEAST_DONE = 15;
/** A page must have gained this many visits, with nothing done, to be said (More Handles' Black door handles, 5 to 225). */
const PAGE_JUMP = 100;
const PAGE_JUMP_SMALL = 15;
/** One day this many times a usual day, by at least this many, on enough days to know what's usual. */
const DAY_TIMES = 3;
const DAY_LEAST = 30;
const DAYS_FOR_USUAL = 7;
/** A figure stepped when the medians of its two sides are this far apart, with visits flat between them. */
const STEP_RATIO = 1.6;
const VISITS_FLAT = 1.4;
/** At least this many days each side: More Handles' tag changed two days into September. */
const STEP_SIDE = 2;
const STEP_DAYS = 14;
/** Visits with no page, worth saying from this share of all visits. */
const NO_PAGE_SHARE = 0.01;
/** One kind of event moving this share, from at least this many. */
const EVENT_MOVE = 0.25;
const EVENT_LEAST = 10;
/** One Classification holding this share of one kind of event, from at least this many. */
const EVENT_HOLDS = 0.5;
const HOLDS_LEAST = 10;
/** A real thing done this many times over by the visits that did it looks counted twice, from this many visits. */
const COUNTED_TWICE = 1.8;
const TWICE_LEAST = 5;

const numberOr = (value: unknown, fallback: number) => (isNumber(value) ? value : fallback);
const median = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** A row's share of what's done, furthest from its share of the visits, above and below: who brings the people who buy. */
function bandGaps(list: string, rows: readonly Row[], doneField: string, shareMeasure: string, theirVisits: string, least: number, both: boolean): OwnFound[] {
  const visitsAll = sumOf(rows, "visits");
  const doneAll = sumOf(rows, doneField);
  if (visitsAll <= 0 || doneAll < BAND_LEAST_DONE) return [];
  const gaps = rows.flatMap((row) => {
    const name = rowNameOf(row);
    if (!name || !isNumber(row.visits) || row.visits < least) return [];
    const share = (100 * row.visits) / visitsAll;
    const doneShare = (100 * numberOr(row[doneField], 0)) / doneAll;
    return Math.abs(doneShare - share) >= BAND_GAP ? [{ name, share, doneShare, gap: doneShare - share }] : [];
  });
  const found = (way: number) => gaps.filter((one) => one.gap * way > 0).sort((left, right) => Math.abs(right.gap) - Math.abs(left.gap))[0];
  const above = found(1);
  const below = found(-1);
  const picked = both ? [above, below] : [[above, below].filter(Boolean).sort((left, right) => Math.abs(right!.gap) - Math.abs(left!.gap))[0]];
  return picked.flatMap((one) => (one ? [beside(`bands:${list}`, one.name, shareMeasure, one.doneShare, one.share, 0.85 + Math.min(0.35, Math.abs(one.gap) / 50), theirVisits)] : []));
}

/** New against returning: who does more for their visits, each set against the other. */
function visitorsApart(rows: readonly Row[], doneField: string, rateMeasure: string, least: number): OwnFound | null {
  const rated = rows.flatMap((row) => {
    const name = rowNameOf(row);
    return name && isNumber(row.visits) && row.visits >= least && (row.key === "new" || row.key === "returning") ? [{ name, rate: perHundred(numberOr(row[doneField], 0), row.visits) ?? 0 }] : [];
  }).sort((left, right) => right.rate - left.rate);
  if (rated.length !== 2 || rated[1].rate <= 0 || rated[0].rate < rated[1].rate * RATE_APART) return null;
  return beside("visitors:rate", rated[0].name, rateMeasure, rated[0].rate, rated[1].rate, 0.95 + Math.min(0.3, (rated[0].rate / rated[1].rate - 1) / 3), rated[1].name);
}

/** On a shop, where phones and computers part: adding to a basket, and how many of those go on to buy. */
function deviceSteps(rows: readonly Row[], added: string, bought: string, least: number): OwnFound[] {
  const desktop = rows.find((row) => row.key === "desktop");
  const mobile = rows.find((row) => row.key === "mobile");
  if (!desktop || !mobile || numberOr(desktop.visits, 0) < least || numberOr(mobile.visits, 0) < least) return [];
  const did = (row: Row, name: string) => (isRow(row.visitsThatDid) ? numberOr(row.visitsThatDid[name], 0) : 0);
  const name = (row: Row) => rowNameOf(row) ?? String(row.key);
  const addRates = [perHundred(did(mobile, added), mobile.visits as number) ?? 0, perHundred(did(desktop, added), desktop.visits as number) ?? 0];
  const found: OwnFound[] = [];
  if (addRates[0] > 0 && addRates[1] > 0 && Math.max(...addRates) / Math.min(...addRates) >= 1.15) {
    found.push(beside("devices:added", name(mobile), "addedPerHundred", addRates[0], addRates[1], 0.95, name(desktop)));
    const onward = [did(mobile, added), did(desktop, added)];
    if (onward[0] >= 30 && onward[1] >= 30) {
      const went = [(100 * did(mobile, bought)) / onward[0], (100 * did(desktop, bought)) / onward[1]];
      // Worth saying when it goes the other way: fewer add, but more of those buy.
      if ((addRates[0] - addRates[1]) * (went[0] - went[1]) < 0) found.push(beside("devices:wentOn", name(mobile), "wentOnPercent", went[0], went[1], 0.9, name(desktop)));
    }
  }
  return found;
}

/** The page that came from nowhere with nothing to show for it: "Black door handles went from 5 visits to 225, with nothing bought". */
function pageJumped(rows: readonly Row[], doneField: string, least: number, datesBefore: string): OwnFound | null {
  const best = rows.flatMap((row) => {
    if (row.key === NOT_SET || !isNumber(row.visits) || !isNumber(row.visitsBefore) || typeof row.address !== "string") return [];
    const gained = row.visits - row.visitsBefore;
    return gained >= least && numberOr(row[doneField], 0) === 0 && row.visits >= row.visitsBefore * 2 ? [{ name: pathOfAddress(row.address), now: row.visits, before: row.visitsBefore, gained }] : [];
  }).sort((left, right) => right.gained - left.gained)[0];
  return best ? beside("pages:jumped", best.name, "visits", best.now, best.before, 1.05 + Math.min(0.3, best.gained / 2000), datesBefore) : null;
}

/** One day far from the rest, for what the website counts: "On 9 October, Started checkout happened 830 times. A usual day is about 170." */
function dayFarFromRest(days: readonly Row[], fields: readonly string[], usualDay: string, dayWord: (day: string) => string): OwnFound | null {
  const daily = days.filter((row) => typeof row.day === "string" && row.lastDay === undefined);
  if (daily.length < DAYS_FOR_USUAL) return null;
  const best = fields.flatMap((field) => {
    const values = daily.map((row) => numberOr(row[field], 0));
    const usual = median(values);
    const top = Math.max(...values);
    const at = values.indexOf(top);
    return usual > 0 && top >= usual * DAY_TIMES && top - usual >= DAY_LEAST ? [{ field, usual, top, day: String(daily[at].day), ratio: top / usual }] : [];
  }).sort((left, right) => right.ratio - left.ratio)[0];
  return best ? beside("days:far", `${dayWord(best.day)}, ${best.field}`, "times", best.top, best.usual, 0.95 + Math.min(0.3, best.ratio / 30), usualDay) : null;
}

/**
 * A figure that stepped and stayed: page views a visit and those leaving at once change on one day and stay there, with visits flat.
 * That's the website's tracking, never people behaving differently, so the two sides aren't alike. More Handles, 3 September 2026.
 */
function steppedFigures(before: readonly Row[], now: readonly Row[], names: { pagesFrom: (day: string) => string; leftFrom: (day: string) => string; daysBefore: string }): OwnFound[] {
  const days = [...before, ...now].filter((row) => typeof row.day === "string" && numberOr(row.visits, 0) > 0);
  if (days.length < STEP_DAYS) return [];
  const pages = days.map((row) => numberOr(row.views, 0) / (row.visits as number));
  const left = days.map((row) => 100 * (1 - numberOr(row.stayed, 0) / (row.visits as number)));
  const visits = days.map((row) => row.visits as number);
  // The day that splits them most cleanly: the fewest days on the wrong side of the line, and the earliest of those.
  let best: { at: number; ratio: number; stray: number } | null = null;
  for (let at = STEP_SIDE; at <= days.length - STEP_SIDE; at += 1) {
    const [early, late] = [median(pages.slice(0, at)), median(pages.slice(at))];
    if (early <= 0 || late <= 0) continue;
    const ratio = Math.max(early, late) / Math.min(early, late);
    if (ratio < STEP_RATIO) continue;
    // Stayed there: nearly every day on each side is nearer its own side's figure than the other's.
    const line = (early + late) / 2;
    const stray = pages.filter((value, index) => (index < at ? (value - line) * (early - line) < 0 : (value - line) * (late - line) < 0)).length;
    if (stray > days.length * 0.1) continue;
    const flat = Math.max(median(visits.slice(0, at)), median(visits.slice(at))) / Math.max(1, Math.min(median(visits.slice(0, at)), median(visits.slice(at))));
    if (flat > VISITS_FLAT) continue;
    if (!best || stray < best.stray) best = { at, ratio, stray };
  }
  if (!best) return [];
  // Back to the first day that already looks like the second side: the same day whichever dates are chosen.
  const [earlySide, lateSide] = [median(pages.slice(0, best.at)), median(pages.slice(best.at))];
  while (best.at > STEP_SIDE && Math.abs(pages[best.at - 1] - lateSide) < Math.abs(pages[best.at - 1] - earlySide) * 1.3) best.at -= 1;
  const day = String(days[best.at].day);
  const found = [beside("days:stepped", names.pagesFrom(day), "pagesAVisit", median(pages.slice(best.at)), median(pages.slice(0, best.at)), 1.45, names.daysBefore)];
  const [leftEarly, leftLate] = [median(left.slice(0, best.at)), median(left.slice(best.at))];
  if (Math.abs(leftLate - leftEarly) >= 10) found.push(beside("days:steppedLeft", names.leftFrom(day), "leftAtOncePercent", leftLate, leftEarly, 0.85, names.daysBefore));
  return found;
}

/** Which kind of event fell or rose most, on a website that doesn't sell: "Booked a visit went from 52 to 18". */
function eventsMoved(events: readonly Row[], visitsName: string, visitsChange: number | null): OwnFound[] {
  const moves = events.flatMap((event) => {
    const name = typeof event.name === "string" ? event.name : null;
    if (!name || !isNumber(event.times) || !isNumber(event.timesBefore) || Math.max(event.times, event.timesBefore) < EVENT_LEAST || event.timesBefore <= 0) return [];
    const change = (event.times - event.timesBefore) / event.timesBefore;
    return Math.abs(change) >= EVENT_MOVE ? [{ name, now: event.times, before: event.timesBefore, change, weight: Math.abs(event.times - event.timesBefore) }] : [];
  }).sort((left, right) => right.weight - left.weight);
  return moves.slice(0, 2).map((one, at) => moved("events:kind", one.name, "timesDone", one.now, one.before, 1.3 - at * 0.15, visitsChange === null ? undefined : { name: visitsName, change: visitsChange }));
}

/** Where one kind of event starts: "12 of the 18 booked visits started on Admissions". */
function eventHeldByOne(rows: readonly Row[], events: readonly Row[]): OwnFound | null {
  const best = events.flatMap((event) => {
    const name = typeof event.name === "string" ? event.name : null;
    if (!name) return [];
    const of = (row: Row) => (isRow(row.timesDone) ? numberOr(row.timesDone[name], 0) : 0);
    const total = rows.reduce((sum, row) => sum + of(row), 0);
    if (total < HOLDS_LEAST) return [];
    return rows.flatMap((row) => {
      const where = rowNameOf(row);
      return where && of(row) / total >= EVENT_HOLDS ? [{ name: `${where}, ${name}`, held: of(row), total, share: of(row) / total }] : [];
    });
  }).sort((left, right) => right.share * right.total - left.share * left.total)[0];
  return best ? partOf("events:where", best.name, "timesDone", best.held, best.total, 0.85 + Math.min(0.2, best.share / 4)) : null;
}

/** The same form counting twice: done far more times than the visits that did it. A question for the tracking, never more interest. */
function countedTwice(events: readonly Row[], realName: (name: string) => boolean, visitsThatDidIt: string): OwnFound | null {
  const best = events.flatMap((event) => {
    const name = typeof event.name === "string" ? event.name : null;
    if (!name || !realName(name) || !isNumber(event.times) || !isNumber(event.visitsThatDid) || event.visitsThatDid < TWICE_LEAST) return [];
    return event.times >= event.visitsThatDid * COUNTED_TWICE ? [{ name, times: event.times, visits: event.visitsThatDid }] : [];
  }).sort((left, right) => right.times / right.visits - left.times / left.visits)[0];
  return best ? beside("events:twice", best.name, "timesDone", best.times, best.visits, 0.85, visitsThatDidIt) : null;
}

export function overviewFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const website = nameIn(names, "website", "The whole website");
  const site = isRow(data.website) ? data.website : null;
  if (!site || !isNumber(site.visits)) return [];
  const shop = data.kind === "shop";
  const visits = site.visits;
  const visitsBefore = isNumber(site.visitsBefore) ? site.visitsBefore : null;
  const doneField = shop ? "bought" : "conversions";
  const done = numberOr(site[doneField], 0);
  const doneBefore = isNumber(site[`${doneField}Before`]) ? (site[`${doneField}Before`] as number) : null;
  const doneName = shop ? nameIn(names, "bought", "Bought") : nameIn(names, "events", "Events");
  const doneMeasure = shop ? "purchases" : "events";
  const rateMeasure = shop ? "boughtPerHundred" : "eventsPerHundred";
  const shareMeasure = shop ? "shareOfBought" : "shareOfEvents";
  const theirVisits = nameIn(names, "theirVisits", "their share of all visits");
  const least = visits >= SMALL_WEBSITE ? GROUP_LEAST : LEAST_SMALL;
  const visitsChange = changeOf(visits, visitsBefore);
  const rate = perHundred(done, visits);
  const rateBefore = doneBefore !== null && visitsBefore ? perHundred(doneBefore, visitsBefore) : null;
  const locale = typeof data.locale === "string" ? data.locale : "en-GB";
  const dayWord = (day: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const channels = rowsOf(isRow(data.channels) ? data.channels.rows : null);
  const kinds = rowsOf(isRow(data.classifications) ? data.classifications.rows : null);
  const devices = rowsOf(isRow(data.devices) ? data.devices.rows : null);
  const visitors = rowsOf(isRow(data.visitors) ? data.visitors.rows : null);
  const days = rowsOf(data.days);
  const daysBefore = rowsOf(data.daysBefore);
  const pages = rowsOf(data.topPages);
  const events = rowsOf(data.events);
  const found: OwnFound[] = [];

  // The headline: the whole website's visits, with what came of them beside it.
  const head = headline("whole", website, "visits", visits, visitsBefore, { name: doneName, now: done, before: doneBefore });
  if (head) found.push(head);

  // What came of them against the dates before, which the headline already has as a change, so it's said for its count; and for every 100 visits: fewer visits, but just as many buy.
  if (doneBefore !== null && doneBefore > 0 && Math.abs((done - doneBefore) / doneBefore) >= LEAST_CHANGE) {
    found.push(moved("done", website, doneMeasure, done, doneBefore, head ? 0.8 : 1.3, visitsChange === null ? undefined : { name: nameIn(names, "visits", "Visits"), change: visitsChange }));
  }
  if (rate !== null && rateBefore !== null && rateBefore > 0 && ((visitsChange !== null && Math.abs(visitsChange) >= LEAST_CHANGE) || Math.abs(rate - rateBefore) / rateBefore >= 0.1)) {
    found.push(rateMoved("rate", website, rateMeasure, rate, rateBefore, 1.2 + Math.min(0.2, Math.abs(rate - rateBefore) / rateBefore)));
  }

  // A figure that stepped says the two sides aren't alike, so what it moved isn't said as a move.
  const stepped = steppedFigures(daysBefore, days, {
    pagesFrom: (day) => `${nameIn(names, "pagesAVisit", "Pages a visit")}, ${dayWord(day)}`,
    leftFrom: (day) => `${nameIn(names, "leftStraightAway", "Left straight away")}, ${dayWord(day)}`,
    daysBefore: nameIn(names, "daysBefore", "the days before"),
  });
  found.push(...stepped);
  if (stepped.length === 0 && isNumber(site.stayed) && isNumber(site.stayedBefore) && visits > 0 && visitsBefore) {
    const left = 100 * (1 - site.stayed / visits);
    const was = 100 * (1 - site.stayedBefore / visitsBefore);
    if (Math.abs(left - was) >= SHARE_POINTS) found.push(rateMoved("left", website, "leftAtOncePercent", left, was, 0.9 + Math.min(0.4, Math.abs(left - was) / 20)));
  }

  // A fall one channel explains, the channels that moved apart, and who does best for their visits.
  const channelRows: Channel[] = channels.flatMap((row) => {
    const name = rowNameOf(row);
    return name && isNumber(row.visits) ? [{ row, name, visits: row.visits, before: visitsBeforeOf(row), done: numberOr(row[doneField], 0), doneBefore: isNumber(row[`${doneField}Before`]) ? (row[`${doneField}Before`] as number) : null }] : [];
  });
  found.push(...fallOneExplains(channelRows, names, shop));
  found.push(...visitMovers("channels", channels, { name: website, change: visitsChange }, "visits", least).slice(0, 2));
  const best = bestFor(channelRows.map((one) => ({ key: one.name, visits: one.visits, visitsBefore: one.before, wins: one.done })));
  if (best && rate !== null && rate > 0 && best.per100 >= rate * 1.1) found.push(beside("channels:best", best.key, rateMeasure, best.per100, rate, 1.0 + Math.min(0.3, best.per100 / rate / 10), website));

  // Who visits against who buys or gets in touch, in each way of splitting them. Pages, both ways: News brings visits, Admissions brings enquiries.
  found.push(...bandGaps("channel", channels, doneField, shareMeasure, theirVisits, least, false));
  found.push(...bandGaps("kind", kinds, doneField, shareMeasure, theirVisits, least, true));
  found.push(...bandGaps("device", devices, doneField, shareMeasure, theirVisits, least, false));
  found.push(...bandGaps("visitor", visitors, doneField, shareMeasure, theirVisits, least, false));
  const apart = visitorsApart(visitors, doneField, rateMeasure, least);
  if (apart) found.push(apart);
  if (shop) found.push(...deviceSteps(devices, nameIn(names, "addedToBasket", "Added to basket"), doneName, least));

  // Busy, and nobody buys: the Classification furthest under the website for its visits.
  found.push(...perHundredApart("kinds", kinds, rate, website, doneField, rateMeasure, least).filter((one) => one.kind === "rowBelow"));

  // Each page's own news: come from nowhere with nothing to show for it, and the visits with no page at all.
  const jumped = pageJumped(pages, doneField, visits >= SMALL_WEBSITE ? PAGE_JUMP : PAGE_JUMP_SMALL, nameIn(names, "datesBefore", "the dates before"));
  if (jumped) found.push(jumped);
  const noPage = pages.find((row) => row.key === NOT_SET);
  if (noPage && isNumber(noPage.visits) && noPage.visits >= visits * NO_PAGE_SHARE && noPage.visits >= least) {
    found.push(partOf("pages:noPage", nameIn(names, "noPageRecorded", "No page recorded"), "visits", noPage.visits, visits, 0.75));
  }

  // One day far from the rest, for what the website counts.
  const eventFields = events.flatMap((event) => (typeof event.name === "string" ? [event.name] : []));
  const far = dayFarFromRest(days, eventFields, nameIn(names, "usualDay", "a usual day"), dayWord);
  if (far) found.push(far);

  if (!shop) {
    // On a service business: which kind fell, where one kind starts, and the same form counting twice.
    found.push(...eventsMoved(events, nameIn(names, "visits", "Visits"), visitsChange));
    const held = eventHeldByOne(kinds, events);
    if (held) found.push(held);
    const rawNames = isRow(data.eventCodes) ? data.eventCodes : {};
    const twice = countedTwice(events, (name) => !isFirstStep(typeof rawNames[name] === "string" ? (rawNames[name] as string) : name), nameIn(names, "visitsThatDidIt", "the visits that did it"));
    if (twice) found.push(twice);
  }

  // Whichever channel holds the most visits and whichever page: true on any dates, so a small website's eye is never empty.
  const top = channelRows.filter((one) => one.visits > 0).sort((left, right) => right.visits - left.visits)[0];
  if (top) found.push(partOf("channels:most", top.name, "visits", top.visits, Math.max(sumOf(channels, "visits"), top.visits), visitsBefore === null ? 1.0 : 0.6));
  const topPage = pages.filter((row) => row.key !== NOT_SET && isNumber(row.visits) && typeof row.address === "string").sort((left, right) => (right.visits as number) - (left.visits as number))[0];
  if (topPage && visits > 0) found.push(partOf("pages:most", pathOfAddress(topPage.address as string), "visits", topPage.visits as number, visits, 0.55));
  return found;
}
