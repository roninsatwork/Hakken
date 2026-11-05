import { isNumber, isRow, moved, partOf, rowsOf, type OwnFound, type Row } from "./shared";
import { GROUP_LEAST, RATE_APART, namesOf, nameIn, sumOf, changeOf, perHundred, visitsBeforeOf, trustedRows, beside, headline, visitMovers, perHundredApart, leftApart, conversionsApartFromVisits, websiteOf } from "./googleAnalyticsShared";

// Campaigns -----------------------------------------------------------------

/** A website bringing fewer campaign visits than this has too little for the usual bar: a campaign of 20 visits still says something. */
const CAMPAIGNS_SMALL = 2_000;
const CAMPAIGN_LEAST_SMALL = 20;
/** One place holding this share of the campaigns' visits is worth saying. */
const PLACE_HOLDS = 0.6;
/** Losers said to explain a fall, at most, until they hold this share of it. */
const FALL_ROWS = 3;
const FALL_SHARE = 0.6;

/**
 * The few campaigns that lost most, where they account for most of the fall, however the others moved: "Top Performing Products
 * and Listing Only lost 1,193 visits, against 1,103 for all campaigns together" (More Handles' October).
 */
function campaignsFall(rows: readonly Row[], visits: number, before: number | null, tagged: string, least: number): OwnFound | null {
  if (before === null) return null;
  const fell = before - visits;
  if (fell <= 0 || fell < before * 0.02) return null;
  const losers = trustedRows(rows, least).flatMap((one) => {
    const was = visitsBeforeOf(one.row);
    return was !== null && was > one.visits ? [{ name: one.name, lost: was - one.visits }] : [];
  }).sort((left, right) => right.lost - left.lost);
  const chosen: typeof losers = [];
  let lost = 0;
  for (const loser of losers) {
    if (chosen.length >= FALL_ROWS || lost >= fell * FALL_SHARE) break;
    chosen.push(loser);
    lost += loser.lost;
  }
  if (chosen.length === 0 || lost < fell * FALL_SHARE) return null;
  return beside("campaigns:fall", chosen.map((one) => one.name).join(", "), "visitsLost", lost, fell, 1.1 + Math.min(0.5, lost / fell / 4), tagged);
}

/** One place, such as Google Ads, holding most of the campaigns' visits, where there's more than one. */
function campaignsPlace(rows: readonly Row[], visits: number): OwnFound | null {
  const places = new Map<string, number>();
  for (const row of rows) if (typeof row.source === "string" && isNumber(row.visits)) places.set(row.source, (places.get(row.source) ?? 0) + (row.visits as number));
  if (places.size < 2 || visits <= 0) return null;
  const [place, held] = [...places.entries()].sort((left, right) => right[1] - left[1])[0];
  return held / visits >= PLACE_HOLDS ? partOf("campaigns:place", place, "visits", held, visits, 0.75) : null;
}

/**
 * What people did after they arrived (`whatPeopleDid`): the campaign and thing furthest from all the campaigns, weighed by its visits.
 * What was bought has its own rule, so it's left out here.
 */
function campaignsDid(data: Row, tagged: string, bought: string, least: number): OwnFound | null {
  const part = isRow(data.whatPeopleDid) ? data.whatPeopleDid : null;
  if (!part || !Array.isArray(part.things)) return null;
  const things = part.things.filter((thing): thing is string => typeof thing === "string" && thing !== bought);
  const rows = rowsOf(part.campaigns);
  const trusted = trustedRows(rows, least);
  const total = trusted.reduce((sum, one) => sum + one.visits, 0);
  if (total <= 0) return null;
  const best = things.flatMap((thing) => {
    const mean = perHundred(trusted.reduce((sum, one) => sum + (isNumber(one.row[thing]) ? (one.row[thing] as number) : 0), 0), total);
    if (!mean) return [];
    return trusted.flatMap((one) => {
      const rate = perHundred(isNumber(one.row[thing]) ? (one.row[thing] as number) : 0, one.visits) ?? 0;
      const ratio = Math.max(0.01, rate / mean);
      if (ratio < RATE_APART && ratio > 1 / RATE_APART) return [];
      return [{ name: `${one.name}, ${thing}`, rate, mean, weight: Math.sqrt(one.visits / total) * Math.min(2, Math.abs(Math.log(ratio))) }];
    });
  }).sort((left, right) => right.weight - left.weight)[0];
  return best ? beside("campaigns:did", best.name, part.unit === "visits" ? "visitsDidPercent" : "timesPerHundred", best.rate, best.mean, 0.6 + Math.min(0.6, best.weight), tagged) : null;
}

/**
 * Campaigns (campaigns-new-page-plan-2026-11-05.md, step 8): every campaign's visits against the span before and against the whole
 * website, their share of what's bought against their share of visits, the few campaigns that explain a fall, those moving apart,
 * those selling furthest from the rest (a busy campaign nobody bought from), the one people leave most, one place holding most of
 * it, and what people did next. A website with nothing bought speaks in conversions. With no campaign at all, it says so.
 */
export function campaignsFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const tagged = nameIn(names, "tagged", "All campaign visits");
  const boughtName = nameIn(names, "bought", "Bought");
  const whole = isRow(data.campaignsAll) ? data.campaignsAll : data;
  const rows = rowsOf(whole);
  const found: OwnFound[] = [];
  const totals = isRow(data.totals) ? data.totals : null;
  const figure = (name: string, fallback: number) => (totals && isNumber(totals[name]) ? (totals[name] as number) : fallback);
  const visits = figure("visits", sumOf(rows, "visits"));
  const heldBefore = rows.reduce((sum, row) => sum + (visitsBeforeOf(row) ?? 0), 0);
  const before = totals ? (isNumber(totals.visitsBefore) ? totals.visitsBefore : null) : heldBefore;
  const conversions = figure("conversions", sumOf(rows, "conversions"));
  const conversionsBefore = figure("conversionsBefore", sumOf(rows, "conversionsBefore"));
  const bought = figure("bought", sumOf(rows, "purchases"));
  const boughtBefore = figure("boughtBefore", sumOf(rows, "purchasesBefore"));
  const sells = data.sells !== false && (bought > 0 || boughtBefore > 0);
  const site = websiteOf(data, names);
  const siteRow = isRow(data.website) ? data.website : null;
  // No campaign in these dates: true, and worth saying, against all the visits there were.
  if (visits === 0) {
    if (site) found.push(beside("campaigns:none", tagged, "visits", 0, site.visits, 1.5, site.name));
    if (isNumber(before) && before > 0) found.push(moved("whole", tagged, "visits", 0, before, 1.4));
    return found;
  }
  const least = visits >= CAMPAIGNS_SMALL ? GROUP_LEAST : CAMPAIGN_LEAST_SMALL;
  const head = headline("whole", tagged, "visits", visits, before, sells ? { name: boughtName, now: bought, before: boughtBefore } : { name: nameIn(names, "conversions", "Conversions"), now: conversions, before: conversionsBefore });
  if (head) found.push(head);
  // Campaigns against the whole website: their share of what's bought beside their share of its visits.
  if (site && site.visits > 0 && siteRow) {
    const siteDone = sells ? siteRow.bought : site.conversions;
    if (isNumber(siteDone) && siteDone > 0) {
      const share = (100 * (sells ? bought : conversions)) / siteDone;
      const visitsShare = (100 * visits) / site.visits;
      found.push(beside("campaigns:share", tagged, sells ? "shareOfBought" : "shareOfConversions", share, visitsShare, 1.2 + Math.min(0.4, Math.abs(share - visitsShare) / 50), nameIn(names, "theirVisits", "Their share of all visits")));
    }
  }
  const fall = campaignsFall(rows, visits, before, tagged, least);
  if (fall) found.push(fall);
  found.push(...visitMovers("campaigns", rows, { name: tagged, change: changeOf(visits, before) }, "visits", least));
  found.push(...(sells
    ? perHundredApart("campaigns", rows, perHundred(bought, visits), tagged, "purchases", "boughtPerHundred", least).map((one) => ({ ...one, score: one.score + 0.4 }))
    : perHundredApart("campaigns", rows, perHundred(conversions, visits), tagged, "conversions", "conversionsPerHundred", least)));
  const engaged = figure("engaged", rows.reduce((sum, row) => sum + (isNumber(row.visits) && isNumber(row.engagementRatePercent) ? ((row.visits as number) * (row.engagementRatePercent as number)) / 100 : 0), 0));
  const left = leftApart("campaigns", rows, visits > 0 ? 100 * (1 - engaged / visits) : null, tagged, least);
  if (left) found.push(left);
  const apart = conversionsApartFromVisits("campaigns", rows, nameIn(names, "visits", "Visits"));
  if (apart) found.push(apart);
  const place = campaignsPlace(rows, visits);
  if (place) found.push(place);
  const did = campaignsDid(data, tagged, boughtName, least);
  if (did) found.push(did);
  return found;
}
