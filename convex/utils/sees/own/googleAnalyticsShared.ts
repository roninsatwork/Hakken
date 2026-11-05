import { MEASURES, measureWords } from "../measures";
import { pathOfAddress } from "../analytics";
import { isNumber, isRow, moved, named, partOf, round1, type OwnFound, type Row } from "./shared";

/**
 * What Google Analytics' pages' own rules share (moved out of `googleAnalytics.ts`, as it passed a thousand lines with Campaigns, 2026-11-05):
 * the bars a figure must clear, and the kinds of finding every page's rules make.
 */

// ---------------------------------------------------------------------------
// The section's other pages (ask-hakken-every-chart-page-plan-2026-11-03.md, section 5; built 2026-11-04)
// ---------------------------------------------------------------------------

/**
 * Each page's own rules pick the biggest things on it for whatever dates are chosen: its headline against the span
 * before, the rows that moved most, and the rows furthest from their reference (the whole website, the channel, every
 * campaign, the square). The bars below only keep out what is too small to trust. Google Analytics' lists count
 * conversions as times, not visits, so a list's rate can pass 100%: said as conversions for every 100 visits, never a
 * percentage (section 5). Never money (decision 1, Anthony, 2026-11-03: "Take money off"). `googleAnalyticsPeriods.test.ts`
 * holds every page to every period the date menu offers, on More Handles' own figures.
 */
/** A group too small to trust: fewer visits than this, or under this share of its list. */
export const GROUP_LEAST = 100;
/** A group's move worth saying: this share of the span before and this many visits. */
export const GROUP_MOVE = 0.05;
/** A row's rate set apart from its reference by this much, either way, on enough visits to trust. */
export const RATE_APART = 1.3;
/** A row leaving at once this many points more or less than its reference. */
export const LEFT_APART_POINTS = 5;
/** A row's conversions moving this share of the span before, this far from its visits' own move, by this many. */
export const CONVERSIONS_MOVE = 0.25;
export const CONVERSIONS_GAP = 0.2;
export const CONVERSIONS_LEAST = 10;
/** The few rows said to explain a fall: at most this many, holding at least this share of it. */
export const EXPLAIN_ROWS = 3;
export const EXPLAIN_SHARE = 0.3;
/** A group's share moved this many points, to be said. */
export const SHARE_POINTS = 1.5;
/** A page's share of people or views this many points from the whole website's, to be said. */
export const SHARE_APART_POINTS = 3;
/** Pages Hakken has still to sort, the pages of no group and the rest: its housekeeping, never a name in a finding. */
export const HOUSEKEEPING = new Set(["NOT_SORTED", "NO_PAGE", "OTHER"]);

export type Names = Record<string, string>;
/** The reader's words the page hands for the names its findings use (`googleAnalytics.eyeNames`), else English. */
export const namesOf = (data: Row): Names => (isRow(data.names) ? Object.fromEntries(Object.entries(data.names).filter((one): one is [string, string] => typeof one[1] === "string" && one[1].trim() !== "")) : {});
export const nameIn = (names: Names, key: string, fallback: string) => names[key] ?? fallback;
export const sumOf = (rows: readonly Row[], field: string) => rows.reduce((total, row) => total + (isNumber(row[field]) ? (row[field] as number) : 0), 0);
export const changeOf = (now: number, before: number | null) => (before !== null && before > 0 ? (now - before) / before : null);
export const perHundred = (conversions: number, visits: number) => (visits > 0 ? (100 * conversions) / visits : null);

/** A list row's visits the span before: kept, or worked back from its change (`changePercent`, as `pageData.ts` hands it). */
export function visitsBeforeOf(row: Row): number | null {
  if (isNumber(row.visitsBefore)) return row.visitsBefore;
  if (isNumber(row.changePercent) && isNumber(row.visits) && row.changePercent > -100) return Math.round(row.visits / (1 + row.changePercent / 100));
  return null;
}

/** A row's name as the screen shows it: its own name, its title, else its path; never a code or Hakken's housekeeping. */
export function rowNameOf(row: Row): string | null {
  if (typeof row.key === "string" && HOUSEKEEPING.has(row.key)) return null;
  const own = named(row);
  if (own) return /^\d{6,}$/.test(own) ? null : own;
  for (const field of ["title", "label", "address", "path"]) {
    const value = row[field];
    // Never Google's stand-in for no name, a code, a page's number, or a campaign kept by its number ("52536031490414").
    if (typeof value !== "string" || !value.trim() || /^\(.*\)$/.test(value.trim()) || /^[A-Z][A-Z0-9_]+$/.test(value.trim()) || /^~[0-9a-z]+$/.test(value.trim()) || /^\d{6,}$/.test(value.trim())) continue;
    return field === "label" || field === "address" ? pathOfAddress(value.trim()) : value.trim().slice(0, 80);
  }
  return null;
}

/** The rows a list's rules weigh: named, with this many visits and this share of the list's. */
export function trustedRows(rows: readonly Row[], least = GROUP_LEAST): Array<{ row: Row; name: string; visits: number }> {
  const named = rows.flatMap((row) => {
    const name = rowNameOf(row);
    return name && isNumber(row.visits) && (row.visits as number) > 0 ? [{ row, name, visits: row.visits as number }] : [];
  });
  const total = named.reduce((sum, one) => sum + one.visits, 0);
  return named.filter((one) => one.visits >= Math.max(least, total * 0.02));
}

/** A figure beside its reference: the whole website's, or another's by its name. */
export function beside(list: string, name: string, measure: string, value: number, mean: number, score: number, other: string | null, against: "website" | "group" = "website"): OwnFound {
  const kind = value > mean ? "rowAbove" : "rowBelow";
  const words = measureWords(measure);
  const unit = MEASURES[measure]?.kind === "percent" ? "percent" as const : MEASURES[measure]?.kind === "count" ? "count" as const : "score" as const;
  return {
    id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
    params: { name, measure, value: round1(value), mean: round1(mean), against: other === null ? against : "other", ...(other !== null ? { other } : {}), ...(MEASURES[measure]?.lessIsBetter ? { lessIsBetter: 1 } : {}) },
    facts: [
      { key: "value", value: round1(value), unit, label: `${name}: ${words}` },
      { key: "mean", value: round1(mean), unit, label: `${other ?? (against === "group" ? "similar pages" : "the whole website")}: ${words}` },
    ],
  };
}

/** A rate or a share now against the span before: its facts in its own unit, its size as a share of the span before. */
export function rateMoved(list: string, name: string, measure: string, now: number, before: number, score: number, other?: { name: string; change: number }): OwnFound {
  const found = moved(list, name, measure, round1(now), round1(before), score, other);
  const unit = MEASURES[measure]?.kind === "percent" ? "percent" as const : "score" as const;
  return { ...found, facts: found.facts.map((fact) => (fact.key === "change" ? fact : { ...fact, unit })) };
}

/** A share of a whole now against the span before, in points: "New: 68% of all the visits, from 65.4%". */
export function shareMovedOf(list: string, name: string, measure: string, share: number, shareBefore: number, score: number): OwnFound {
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

/** The whole's visits now against the span before: the page's headline, said whatever its size, with another figure's move. */
export function headline(list: string, name: string, measure: string, now: unknown, before: unknown, other?: { name: string; now: unknown; before: unknown }): OwnFound | null {
  if (!isNumber(now) || !isNumber(before) || before <= 0) return null;
  const otherChange = other && isNumber(other.now) && isNumber(other.before) ? changeOf(other.now, other.before) : null;
  const change = Math.abs((now - before) / before);
  return moved(list, name, measure, now, before, 1.3 + Math.min(0.5, change), other && otherChange !== null ? { name: other.name, change: otherChange } : undefined);
}

/**
 * The rows whose visits moved most, the biggest gain and the biggest loss, each set beside its reference's own move (the
 * whole website's, the channel's): a row moving with the whole is no news.
 */
export function visitMovers(list: string, rows: readonly Row[], reference: { name: string; change: number | null } | null, measure = "visits", least = GROUP_LEAST): OwnFound[] {
  const listed = trustedRows(rows, least);
  const total = listed.reduce((sum, one) => sum + one.visits, 0);
  const moves = listed.flatMap((one) => {
    const now = measure === "visits" ? one.visits : (one.row[measure] as number);
    const before = measure === "visits" ? visitsBeforeOf(one.row) : isNumber(one.row[`${measure}Before`]) ? (one.row[`${measure}Before`] as number) : null;
    // A row with next to nothing the span before is new, not a mover: "up 22,200%, from 1" says nothing a reader can use.
    if (!isNumber(now) || before === null || before < Math.max(least / 5, now * 0.05)) return [];
    const change = (now - before) / before;
    if (Math.abs(change) < GROUP_MOVE || (reference?.change !== null && reference?.change !== undefined && Math.abs(change - reference.change) < GROUP_MOVE)) return [];
    return [{ ...one, now, before, change, weight: Math.abs(now - before) * Math.min(1, Math.abs(change) * 5) }];
  });
  const out: OwnFound[] = [];
  for (const way of [1, -1]) {
    const best = moves.filter((one) => one.change * way > 0).sort((left, right) => right.weight - left.weight)[0];
    if (!best) continue;
    const other = reference && reference.change !== null ? { name: reference.name, change: reference.change } : undefined;
    out.push(moved(list, best.name, measure, best.now, best.before, 0.8 + Math.min(0.5, Math.abs(best.change)) + Math.min(0.3, total > 0 ? Math.abs(best.now - best.before) / total : 0), other));
  }
  return out;
}

/** The rows furthest above and below their reference in conversions for every 100 visits, weighed by their visits. */
export function perHundredApart(list: string, rows: readonly Row[], mean: number | null, other: string | null, figure = "conversions", measure = "conversionsPerHundred", least = GROUP_LEAST): OwnFound[] {
  if (mean === null || mean <= 0) return [];
  const listed = trustedRows(rows, least).filter((one) => isNumber(one.row[figure]));
  const total = listed.reduce((sum, one) => sum + one.visits, 0);
  const scored = listed.map((one) => {
    const rate = perHundred(one.row[figure] as number, one.visits) ?? 0;
    const ratio = Math.max(0.01, rate / mean);
    return { ...one, rate, ratio, weight: Math.sqrt(total > 0 ? one.visits / total : 0) * Math.min(2, Math.abs(Math.log(ratio))) };
  }).filter((one) => one.ratio >= RATE_APART || one.ratio <= 1 / RATE_APART);
  const out: OwnFound[] = [];
  for (const above of [true, false]) {
    const best = scored.filter((one) => (above ? one.ratio > 1 : one.ratio < 1)).sort((left, right) => right.weight - left.weight)[0];
    if (best) out.push(beside(`${list}:perHundred`, best.name, measure, best.rate, mean, 0.7 + Math.min(0.7, best.weight), other));
  }
  return out;
}

/** The row whose conversions for every 100 visits moved most against the span before, beside its reference's own move. */
export function perHundredMoved(list: string, rows: readonly Row[], reference: { name: string; change: number | null } | null): OwnFound | null {
  const listed = trustedRows(rows).flatMap((one) => {
    const before = visitsBeforeOf(one.row);
    const conversions = one.row.conversions;
    const conversionsBefore = one.row.conversionsBefore;
    if (before === null || before < GROUP_LEAST || !isNumber(conversions) || !isNumber(conversionsBefore) || conversionsBefore < CONVERSIONS_LEAST) return [];
    const now = perHundred(conversions, one.visits) ?? 0;
    const was = perHundred(conversionsBefore, before) ?? 0;
    const change = was > 0 ? (now - was) / was : 0;
    if (Math.abs(change) < CONVERSIONS_MOVE || (reference?.change !== null && reference?.change !== undefined && Math.abs(change - reference.change) < CONVERSIONS_GAP)) return [];
    return [{ ...one, now, was, change, weight: Math.sqrt(one.visits) * Math.min(1, Math.abs(change)) }];
  }).sort((left, right) => right.weight - left.weight);
  const best = listed[0];
  if (!best) return null;
  const other = reference && reference.change !== null ? { name: reference.name, change: reference.change } : undefined;
  return rateMoved(`${list}:perHundredMoved`, best.name, "conversionsPerHundred", best.now, best.was, 0.8 + Math.min(0.5, Math.abs(best.change)), other);
}

/** The row leaving at once furthest from its reference, more or fewer, weighed by its visits. */
export function leftApart(list: string, rows: readonly Row[], mean: number | null, other: string | null, least = GROUP_LEAST): OwnFound | null {
  if (mean === null) return null;
  const listed = trustedRows(rows, least).filter((one) => isNumber(one.row.bounceRatePercent));
  const total = listed.reduce((sum, one) => sum + one.visits, 0);
  const best = listed
    .map((one) => ({ ...one, left: one.row.bounceRatePercent as number, gap: (one.row.bounceRatePercent as number) - mean }))
    .filter((one) => Math.abs(one.gap) >= LEFT_APART_POINTS)
    .map((one) => ({ ...one, weight: Math.sqrt(total > 0 ? one.visits / total : 0) * Math.abs(one.gap) }))
    .sort((left, right) => right.weight - left.weight)[0];
  return best ? beside(`${list}:left`, best.name, "bounceRatePercent", best.left, mean, 0.6 + Math.min(0.6, best.weight / 30), other) : null;
}

/** The row whose conversions moved apart from its visits ("visits held, conversions nearly halved"), the most lost or gained. */
export function conversionsApartFromVisits(list: string, rows: readonly Row[], visitsName: string, visitsOf: (row: Row) => { now: number; before: number | null } = (row) => ({ now: row.visits as number, before: visitsBeforeOf(row) })): OwnFound | null {
  const listed = rows.flatMap((row) => {
    const name = rowNameOf(row);
    const conversions = row.conversions;
    const before = row.conversionsBefore;
    if (!name || !isNumber(conversions) || !isNumber(before) || before < CONVERSIONS_LEAST) return [];
    const visits = visitsOf(row);
    const visitsChange = changeOf(visits.now, visits.before);
    const change = (conversions - before) / before;
    // Apart: the conversions a visit moved too, not only the count (a campaign's visits and conversions both up 3,600% is no news).
    const perVisit = visitsChange !== null && visitsChange > -1 ? (1 + change) / (1 + visitsChange) - 1 : null;
    if (visitsChange === null || perVisit === null || visits.now < GROUP_LEAST || Math.abs(conversions - before) < CONVERSIONS_LEAST || Math.abs(change) < CONVERSIONS_MOVE || Math.abs(perVisit) < CONVERSIONS_MOVE) return [];
    return [{ name, conversions, before, change, visitsChange }];
  });
  const total = listed.reduce((sum, one) => sum + Math.max(one.conversions, one.before), 0);
  const best = listed.sort((left, right) => Math.abs(right.conversions - right.before) - Math.abs(left.conversions - left.before))[0];
  if (!best) return null;
  return moved(`${list}:conversions`, best.name, "conversions", best.conversions, best.before, 0.8 + Math.min(0.5, Math.abs(best.change - best.visitsChange)) + Math.min(0.2, total > 0 ? Math.abs(best.conversions - best.before) / total : 0), { name: visitsName, change: best.visitsChange });
}

/** The few rows that lost most, where together they hold much of the whole's fall: "/a, /b and /c: 62% of all the views lost". */
export function explainsFall(list: string, rows: ReadonlyArray<{ name: string; now: number; before: number }>, now: number, before: number, measure: string): OwnFound | null {
  const fell = before - now;
  if (fell <= 0 || fell < before * 0.02) return null;
  const losers = rows.filter((row) => row.before > row.now).sort((left, right) => (right.before - right.now) - (left.before - left.now)).slice(0, EXPLAIN_ROWS);
  if (losers.length < 2) return null;
  const lost = losers.reduce((sum, row) => sum + row.before - row.now, 0);
  const share = lost / fell;
  if (share < EXPLAIN_SHARE || share > 1) return null;
  return partOf(list, losers.map((row) => row.name).join(", "), measure, lost, fell, 0.9 + Math.min(0.5, share - EXPLAIN_SHARE));
}

/** The website's figures a page hands for its references (`website`): visits, conversions and engaged visits, now and before. */
export function websiteOf(data: Row, names: Names): { name: string; visits: number; visitsBefore: number | null; conversions: number; conversionsBefore: number | null; left: number | null } | null {
  const site = isRow(data.website) ? data.website : null;
  if (!site || !isNumber(site.visits) || !isNumber(site.conversions)) return null;
  return {
    name: nameIn(names, "website", "The whole website"),
    visits: site.visits, visitsBefore: isNumber(site.visitsBefore) ? site.visitsBefore : null,
    conversions: site.conversions, conversionsBefore: isNumber(site.conversionsBefore) ? site.conversionsBefore : null,
    left: isNumber(site.engaged) && site.visits > 0 ? 100 * (1 - site.engaged / site.visits) : null,
  };
}
