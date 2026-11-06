import { bestFor, type ChannelFigures } from "../../channelPicks";
import { OTHER_KIND } from "../analyticsChannel";
import { isNumber, isRow, moved, partOf, rowsOf, type OwnFound, type Row } from "./shared";
import { GROUP_LEAST, HOUSEKEEPING, type Names, RATE_APART, beside, changeOf, headline, leftApart, nameIn, namesOf, perHundred, perHundredApart, rowNameOf, sumOf, visitMovers, visitsBeforeOf } from "./googleAnalyticsShared";

/**
 * Channels (channels-new-page-plan-2026-11-06.md, step 8). Every rule compares a figure with something and picks the biggest thing it
 * can for whatever dates are chosen: a bar only keeps out what's too small to trust. The rules read every channel, the squares by
 * Classification and by device, and the steps, whatever the page's menus show. A whole-website figure is Google's own total. A shop
 * counts what was bought; any other website counts its events. A website with few visits still says something true.
 */

/** A website with fewer visits than this has too little for the usual bars: a channel of 20 visits still says something. */
const CHANNELS_SMALL = 2_000;
const CHANNEL_LEAST_SMALL = 20;
/** One channel's loss explains a fall when it holds at least this share of what all the channels lost between them. */
const FALL_EXPLAINS = 0.6;
/** Fewer visits lost than this is no story, whatever share of the fall it is. */
const FALL_LEAST = 15;
/** A channel's share of what's done this many points from its share of visits. */
const SHARE_GAP = 4;
/** A square bringing at least this share of its channel's visits, selling this far under its channel, with enough visits to trust. */
const SQUARE_SHARE = 0.05;
const SQUARE_FAR_UNDER = 3;
/** A square this share of a channel's sales, and more than its share of the channel's visits, says why the channel sells well. */
const BEST_HOLDS = 0.5;
/** A step's visits before a step's rate is trusted. */
const STEP_LEAST = 30;
/** A device with at least this many of a channel's visits, in a channel with at least this many. */
const DEVICE_LEAST = 100;
/** Visits with no page, worth saying from this share of all visits. */
const NO_PAGE_SHARE = 0.01;
/** The rest of a channel fell by at least this share of its dates before, for a rise to be hiding a fall. */
const HIDDEN_FALL = 0.05;
/** A rise this share of the dates before, for a channel nobody bought from. */
const NONE_DONE_RISE = 0.1;

/** Columns that are no one part of the website: Not sorted yet, Other groups and No page recorded. */
const NOT_ONE_PLACE = new Set([...HOUSEKEEPING, OTHER_KIND]);

export type Channel = { row: Row; name: string; visits: number; before: number | null; done: number; doneBefore: number | null };
type Square = { channel: string; key: string; column: string; visits: number; before: number | null; done: number };
type Steps = { arrived: number; stayed: number; basket: number; checkout: number; bought: number };

const numberOr = (value: unknown, fallback: number) => (isNumber(value) ? value : fallback);

/** A part's channels, each with its squares: their figures, not housekeeping's, unless a rule asks for that. */
function squaresOf(part: unknown, doneField: string): Square[] {
  const held = isRow(part) ? part : null;
  return rowsOf(held?.rows).flatMap((row) => {
    const channel = rowNameOf(row);
    if (!channel) return [];
    return rowsOf(row.cells).flatMap((cell) => (typeof cell.column === "string" && typeof cell.key === "string" && isNumber(cell.visits)
      ? [{ channel, key: cell.key, column: cell.column, visits: cell.visits, before: isNumber(cell.visitsBefore) ? cell.visitsBefore : null, done: numberOr(cell[doneField], 0) }]
      : []));
  });
}

/**
 * A fall one channel explains: "Cross-network lost 1,917 visits, and all the channels together lost 759". The list's own figures
 * only, as Google counts each list on its own: what one channel lost is never set against the whole website's total
 * (overview-new-page-plan-2026-11-06.md, step 1). What it lost of the sales too, and what all the others gained between them, for
 * the reader to see the rest of the website held up. Overview and Channels both say it.
 */
export function fallOneExplains(channels: readonly Channel[], names: Names, sells: boolean): OwnFound[] {
  const held = channels.flatMap((one) => (one.before === null ? [] : [{ ...one, was: one.before, lost: one.before - one.visits }]));
  const loser = held.filter((one) => one.lost > 0).sort((left, right) => right.lost - left.lost)[0];
  const fell = held.reduce((sum, one) => sum + one.lost, 0);
  if (!loser || fell <= 0 || loser.lost < FALL_LEAST || loser.lost < fell * FALL_EXPLAINS) return [];
  const every = nameIn(names, "allChannels", "All the channels together");
  const found = [beside("channels:fall", loser.name, "visitsLost", loser.lost, fell, 1.4 + Math.min(0.4, loser.lost / fell / 10), every)];
  const gained = held.filter((one) => one.name !== loser.name).reduce((sum, one) => sum + one.visits - one.was, 0);
  if (gained > 0) found.push(beside("channels:fallOthers", nameIn(names, "otherChannels", "All the other channels"), "visitsGained", gained, loser.lost, 1.05, loser.name));
  const doneFell = held.reduce((sum, one) => sum + ((one.doneBefore ?? one.done) - one.done), 0);
  if (loser.doneBefore !== null && doneFell > 0 && loser.doneBefore > loser.done) {
    found.push(beside("channels:fallDone", loser.name, sells ? "boughtLost" : "eventsLost", loser.doneBefore - loser.done, doneFell, 1.15, every));
  }
  return found;
}

/** A rise hiding a fall: a channel up a little, because one Classification rose by more than the whole channel did, so the rest of it fell. */
function riseHidingFall(channels: readonly Channel[], squares: readonly Square[], least: number): OwnFound | null {
  const best = channels.flatMap((one) => {
    if (one.before === null || one.visits <= one.before) return [];
    const rose = one.visits - one.before;
    return squares.filter((cell) => cell.channel === one.name && !NOT_ONE_PLACE.has(cell.key) && cell.before !== null && cell.before >= least && cell.visits - cell.before > rose)
      .map((cell) => ({ channel: one, cell, was: cell.before as number, hidden: cell.visits - (cell.before as number) - rose }))
      .filter((entry) => entry.hidden >= (one.before as number) * HIDDEN_FALL);
  }).sort((left, right) => right.hidden - left.hidden)[0];
  if (!best) return null;
  const change = changeOf(best.channel.visits, best.channel.before);
  return moved("squares:hiding", `${best.channel.name}, ${best.cell.column}`, "visits", best.cell.visits, best.was, 1.2 + Math.min(0.3, best.hidden / Math.max(1, best.channel.visits)), change === null ? undefined : { name: best.channel.name, change });
}

/** The channel that does best for its visits, by the rule the boxes use, and the square that explains it, if one does. */
function bestAndWhy(channels: readonly Channel[], squares: readonly Square[], sitePer100: number | null, website: string, rateMeasure: string, shareMeasure: string, channelVisits: string): OwnFound[] {
  const picks: ChannelFigures[] = channels.map((one) => ({ key: one.name, visits: one.visits, visitsBefore: one.before, wins: one.done }));
  const best = bestFor(picks);
  if (!best || sitePer100 === null || sitePer100 <= 0 || best.per100 < sitePer100 * 1.1) return [];
  const found = [beside("channels:best", best.key, rateMeasure, best.per100, sitePer100, 1.0 + Math.min(0.5, best.per100 / sitePer100 / 10), website)];
  const channel = channels.find((one) => one.name === best.key);
  const holds = squares.filter((cell) => cell.channel === best.key && !NOT_ONE_PLACE.has(cell.key)).sort((left, right) => right.done - left.done)[0];
  if (channel && holds && channel.done > 0 && holds.done / channel.done >= BEST_HOLDS && channel.visits > 0 && holds.done / channel.done > holds.visits / channel.visits) {
    found.push(beside("squares:bestWhere", `${best.key}, ${holds.column}`, shareMeasure, (100 * holds.done) / channel.done, (100 * holds.visits) / channel.visits, 0.95, channelVisits));
  }
  return found;
}

/** The channel whose share of what's done is furthest from its share of visits: big, but sells less. */
function bigSellsLess(channels: readonly Channel[], visits: number, done: number, measure: string, theirVisits: string, least: number): OwnFound | null {
  if (visits <= 0 || done <= 0) return null;
  const best = channels.filter((one) => one.visits >= least).map((one) => ({ one, share: (100 * one.visits) / visits, doneShare: (100 * one.done) / done }))
    .map((entry) => ({ ...entry, gap: entry.doneShare - entry.share })).filter((entry) => Math.abs(entry.gap) >= SHARE_GAP)
    .sort((left, right) => Math.abs(right.gap) - Math.abs(left.gap))[0];
  return best ? beside("channels:share", best.one.name, measure, best.doneShare, best.share, 0.85 + Math.min(0.4, Math.abs(best.gap) / 40), theirVisits) : null;
}

/** A square people read and don't buy from: many of a channel's visits start there, and far fewer buy than from the channel as a whole. */
function readNotDone(channels: readonly Channel[], squares: readonly Square[], rateMeasure: string, least: number): OwnFound | null {
  const best = squares.flatMap((cell) => {
    const channel = channels.find((one) => one.name === cell.channel);
    if (!channel || NOT_ONE_PLACE.has(cell.key) || channel.done <= 0 || channel.visits <= 0 || cell.visits < Math.max(least * 2, channel.visits * SQUARE_SHARE)) return [];
    const rate = (100 * cell.done) / cell.visits;
    const own = (100 * channel.done) / channel.visits;
    return rate * SQUARE_FAR_UNDER <= own ? [{ channel, cell, rate, own }] : [];
  }).sort((left, right) => right.cell.visits - left.cell.visits)[0];
  return best ? beside("squares:lowDone", `${best.channel.name}, ${best.cell.column}`, rateMeasure, best.rate, best.own, 0.9 + Math.min(0.3, best.cell.visits / Math.max(1, best.channel.visits)), best.channel.name) : null;
}

/** The busiest channel nobody bought from, against the website, and how many of its visits left straight away, or that it's growing. */
function busyNoneDone(channels: readonly Channel[], sitePer100: number | null, siteLeft: number | null, website: string, rateMeasure: string, least: number): OwnFound[] {
  const channel = channels.filter((one) => one.done === 0 && one.visits >= least).sort((left, right) => right.visits - left.visits)[0];
  if (!channel || sitePer100 === null || sitePer100 <= 0) return [];
  const found = [beside("channels:noneDone", channel.name, rateMeasure, 0, sitePer100, 0.95, website)];
  const left = channel.row.bounceRatePercent;
  if (isNumber(left) && siteLeft !== null && left > siteLeft) found.push(beside("channels:noneLeft", channel.name, "bounceRatePercent", left, siteLeft, 0.8, website));
  else if (channel.before !== null && channel.before > 0 && (channel.visits - channel.before) / channel.before >= NONE_DONE_RISE) found.push(moved("channels:noneUp", channel.name, "visits", channel.visits, channel.before, 0.8));
  return found;
}

/**
 * A step far from the rest: of a channel's visits at one step, far fewer or more going on to the next than across the whole website.
 * "Referral has the most added to basket, but only 12% of those started checkout, against the website's 43%."
 */
function stepFarFromRest(part: unknown, website: string): OwnFound | null {
  const held = isRow(part) ? part : null;
  if (!held || !isRow(held.everywhere) || !isRow(held.steps)) return null;
  const names = held.steps;
  const tracks = isRow(held.tracks) ? held.tracks : {};
  const order: Array<keyof Steps> = ["stayed", ...(tracks.basket === true ? ["basket" as const] : []), ...(tracks.checkout === true ? ["checkout" as const] : []), "bought"];
  const steps = (row: Row, key: keyof Steps) => numberOr(row[key], 0);
  const best = rowsOf(held.channels).flatMap((row) => {
    const name = rowNameOf(row);
    if (!name) return [];
    return order.slice(0, -1).flatMap((from, at) => {
      const to = order[at + 1];
      const started = steps(row, from);
      const whole = steps(held.everywhere as Row, from);
      if (started < STEP_LEAST || whole <= 0) return [];
      const rate = (100 * steps(row, to)) / started;
      const mean = (100 * steps(held.everywhere as Row, to)) / whole;
      if (mean <= 0) return [];
      const ratio = Math.max(0.01, rate / mean);
      if (ratio < RATE_APART && ratio > 1 / RATE_APART) return [];
      // How far from the rest counts more than how big: a big channel a little under the website is less to tell.
      return [{ name, from, to, rate, mean, weight: Math.pow(started, 0.25) * Math.min(2, Math.abs(Math.log(ratio))) }];
    });
  }).sort((left, right) => right.weight - left.weight)[0];
  if (!best) return null;
  const word = (key: keyof Steps) => (typeof names[key] === "string" ? names[key] : key);
  return beside("steps:far", `${best.name}, ${word(best.from)} to ${word(best.to)}`, "wentOnPercent", best.rate, best.mean, 0.9 + Math.min(0.4, best.weight / 15), website);
}

/** A gap between devices: one channel selling far better on one device than another, with enough visits on each to trust. */
function deviceGap(part: unknown, rateMeasure: string, doneField: string): OwnFound | null {
  const held = isRow(part) ? part : null;
  const best = rowsOf(held?.rows).flatMap((row) => {
    const channel = rowNameOf(row);
    if (!channel) return [];
    const cells = rowsOf(row.cells).filter((cell) => typeof cell.column === "string" && isNumber(cell.visits) && cell.visits >= DEVICE_LEAST).map((cell) => ({ column: cell.column as string, visits: cell.visits as number, rate: (100 * numberOr(cell[doneField], 0)) / (cell.visits as number) }));
    if (cells.length < 2) return [];
    // The two busiest devices: a channel's few tablets say little beside its phones and computers.
    const [high, low] = [...cells].sort((left, right) => right.visits - left.visits).slice(0, 2).sort((left, right) => right.rate - left.rate);
    if (high.rate <= 0 || high.rate < low.rate * RATE_APART) return [];
    return [{ channel, high, low, weight: Math.sqrt(Math.min(high.visits, low.visits)) * Math.min(2, Math.log(high.rate / Math.max(0.01, low.rate))) }];
  }).sort((left, right) => right.weight - left.weight)[0];
  return best ? beside("devices:gap", `${best.channel}, ${best.high.column}`, rateMeasure, best.high.rate, best.low.rate, 0.85 + Math.min(0.3, best.weight / 40), `${best.channel}, ${best.low.column}`) : null;
}

/** One channel's sales or events moving far from its visits: visits held, and sales nearly halved. */
function doneApartFromVisits(channels: readonly Channel[], measure: string, visitsName: string, least: number): OwnFound | null {
  const best = channels.flatMap((one) => {
    if (one.before === null || one.before <= 0 || one.doneBefore === null || one.doneBefore < 10 || one.visits < least) return [];
    const visitsChange = (one.visits - one.before) / one.before;
    const change = (one.done - one.doneBefore) / one.doneBefore;
    const perVisit = (1 + change) / (1 + visitsChange) - 1;
    return Math.abs(change) >= 0.2 && Math.abs(perVisit) >= 0.2 ? [{ one, was: one.doneBefore, visitsChange, moved: Math.abs(one.done - one.doneBefore) }] : [];
  }).sort((left, right) => right.moved - left.moved)[0];
  return best ? moved("channels:doneApart", best.one.name, measure, best.one.done, best.was, 0.85, { name: visitsName, change: best.visitsChange }) : null;
}

export function channelsFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const website = nameIn(names, "website", "The whole website");
  const siteRow = isRow(data.website) ? data.website : null;
  const rows = rowsOf(data.rows);
  const gone = rowsOf(data.gone);
  const sells = data.sells !== false && (sumOf(rows, "purchases") > 0 || numberOr(siteRow?.bought, 0) > 0 || numberOr(siteRow?.boughtBefore, 0) > 0);
  const doneField = sells ? "purchases" : "conversions";
  const doneOf = (row: Row) => numberOr(row[doneField], 0);
  const doneBeforeOf = (row: Row) => (isNumber(row[`${doneField}Before`]) ? (row[`${doneField}Before`] as number) : null);
  const channels: Channel[] = [...rows, ...gone].flatMap((row) => {
    const name = rowNameOf(row);
    return name && isNumber(row.visits) ? [{ row, name, visits: row.visits, before: visitsBeforeOf(row), done: doneOf(row), doneBefore: doneBeforeOf(row) }] : [];
  });
  if (channels.length === 0 && !siteRow) return [];
  // The whole website is Google's own total, never the list's sum.
  const visits = numberOr(siteRow?.visits, sumOf(rows, "visits"));
  const before = siteRow ? (isNumber(siteRow.visitsBefore) ? siteRow.visitsBefore : null) : null;
  const done = siteRow ? numberOr(sells ? siteRow.bought : siteRow.conversions, 0) : sumOf(rows, doneField);
  const doneBefore = siteRow ? ((sells ? siteRow.boughtBefore : siteRow.conversionsBefore) as number | null | undefined) ?? null : null;
  const doneName = sells ? nameIn(names, "bought", "Bought") : nameIn(names, "events", "Events");
  const rateMeasure = sells ? "boughtPerHundred" : "eventsPerHundred";
  const sitePer100 = perHundred(done, visits);
  const siteLeft = siteRow && isNumber(siteRow.engaged) && visits > 0 ? 100 * (1 - siteRow.engaged / visits) : null;
  const least = visits >= CHANNELS_SMALL ? GROUP_LEAST : CHANNEL_LEAST_SMALL;
  const found: OwnFound[] = [];
  const head = headline("whole", website, "visits", visits, before, { name: doneName, now: done, before: doneBefore });
  if (head) found.push(head);
  if (visits === 0 || rows.length === 0) return found;

  const squares = squaresOf(data.channelSquares, doneField);
  // Whichever channel holds the most visits: true on any dates, so the eye is never empty.
  const top = channels.filter((one) => one.visits > 0).sort((left, right) => right.visits - left.visits)[0];
  if (top) found.push(partOf("channels:most", top.name, "visits", Math.min(top.visits, visits), visits, before === null ? 1.0 : 0.6));

  found.push(...fallOneExplains(channels, names, sells));
  found.push(...visitMovers("channels", rows, { name: website, change: changeOf(visits, before) }, "visits", least));
  const hiding = riseHidingFall(channels, squares, least);
  if (hiding) found.push(hiding);
  found.push(...bestAndWhy(channels, squares, sitePer100, website, rateMeasure, sells ? "shareOfChannelBought" : "shareOfChannelEvents", nameIn(names, "shareOfChannelVisits", "its share of this channel's visits")));
  const share = bigSellsLess(channels, visits, done, sells ? "shareOfBought" : "shareOfEvents", nameIn(names, "theirVisits", "their share of all visits"), least);
  if (share) found.push(share);
  const low = readNotDone(channels, squares, rateMeasure, least);
  if (low) found.push(low);
  found.push(...busyNoneDone(channels, sitePer100, siteLeft, website, rateMeasure, least));
  const step = stepFarFromRest(data.channelSteps, website);
  if (step) found.push(step);
  const gap = deviceGap(data.channelDevices, rateMeasure, doneField);
  if (gap) found.push(gap);
  // The channel furthest under the website for its visits, and the one people leave most: each against the whole website.
  found.push(...perHundredApart("channels", rows, sitePer100, null, doneField, rateMeasure, least).filter((one) => one.kind === "rowBelow"));
  const left = leftApart("channels", rows, siteLeft, null, least);
  if (left) found.push(left);
  const apart = doneApartFromVisits(channels, sells ? "purchases" : "events", nameIn(names, "visits", "Visits"), least);
  if (apart) found.push(apart);
  const noPage = squares.filter((cell) => cell.key === "NO_PAGE").reduce((sum, cell) => sum + cell.visits, 0);
  if (noPage >= visits * NO_PAGE_SHARE) found.push(partOf("channels:noPage", nameIn(names, "noPageRecorded", "No page recorded"), "visits", noPage, visits, 0.7 + Math.min(0.3, noPage / visits)));
  return found;
}
