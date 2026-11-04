import { MEASURES, measureWords } from "../measures";
import type { FindingFact } from "../findings";
import { isNumber, isRow, named, round1, rowsOf, type OwnFound, type Row } from "./shared";


/**
 * What Insights' pages' own rules share (`insightsMonths.ts`, `insightsWeek.ts`) (ask-hakken-every-chart-page-plan-2026-11-03.md, section 9; Anthony,
 * 2026-11-03: "every page we touch needs its own finding … i have asked this more than once across all pages").
 *
 * Insights draws only on what the sections have downloaded (Anthony, 2026-10-29): every rule here reads the figures its
 * page hands the eye (`_components/insightsSees.ts` builds them, `pageData.ts` trims them), never anything else. Each
 * finding is set against something — the same months a year before where the page compares with them, else the months
 * just before; the whole website; another kind, source or rival — and the rules always pick the biggest things on the
 * page, whatever period is chosen: a bar only keeps out what is too small to trust. A page's names come in its reader's
 * words (`names`), never a code or an id; pages not sorted yet are Hakken's housekeeping and never a finding. No money:
 * Insights' figures are enquiries, visits and places. No database here.
 */

// ---------------------------------------------------------------------------
// Shared to the section
// ---------------------------------------------------------------------------

export type Trio = { now: number; before: number | null; yearAgo: number | null };
export type Side = "yearAgo" | "before";
export type Finder = { general: boolean; find: (data: Row) => OwnFound[] };

/** A figure as Insights keeps it, now and in the spans it is set against (`{ now, before, yearAgo }`), the trim's nulls gone. */
export const trioOf = (value: unknown): Trio | null => (isRow(value) && isNumber(value.now) ? { now: value.now, before: isNumber(value.before) ? value.before : null, yearAgo: isNumber(value.yearAgo) ? value.yearAgo : null } : null);

/** The span a period's figures are set against, as its screens set them: the same months a year before where held, else the months just before. */
export function sideOf(chosen: unknown): Side | null {
  if (!isRow(chosen)) return null;
  if (Array.isArray(chosen.yearAgo) && chosen.yearAgo.length > 0) return "yearAgo";
  if (Array.isArray(chosen.before) && chosen.before.length > 0) return "before";
  return null;
}
export const SPAN: Record<Side, string> = { yearAgo: "the same months a year before", before: "the months just before" };

/** The reader's words the page handed (`names`): a rule never names a thing in words of its own. */
export const namesOf = (data: Row): Row => (isRow(data.names) ? data.names : {});
export const word = (names: Row, key: string): string | null => (typeof names[key] === "string" && (names[key] as string).trim() ? (names[key] as string).trim() : null);
/** A page's words with a name in them ("{name}, one place above"), filled in. */
export const filled = (template: string | null, values: Record<string, string>): string | null => (template ? template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "") : null);

/**
 * A rate Insights keeps as a percentage (54.6): as handed, or — where it was 1 or under — turned back from the eye's trim,
 * which reads any `rate` or `share` of 1 or under as a fraction (`pageData.ts`: a page's 0.8% would read 80%).
 */
export function percentOf(row: Row, field: string): number | null {
  if (isNumber(row[field])) return row[field] as number;
  const turned = row[`${field}Percent`];
  return isNumber(turned) ? turned / 100 : null;
}

export const changeOf = (now: number, then: number) => (now - then) / then;
export const unitOf = (measure: string): FindingFact["unit"] => (MEASURES[measure]?.kind === "percent" ? "percent" : MEASURES[measure]?.kind === "score" || MEASURES[measure]?.kind === "place" ? "score" : "count");
/** A figure as the panel shows it: a count whole, a rate or a score to its tenth. */
export const shown = (measure: string, value: number) => (unitOf(measure) === "count" ? Math.round(value) : round1(value));
export const rateOf = (part: number, whole: number) => (whole > 0 ? (100 * part) / whole : 0);
/** Skips Hakken's own housekeeping: pages not sorted yet, and visits Analytics recorded no page for. */
export const HOUSEKEEPING = new Set(["NOT_SORTED", "NOT_RECORDED"]);
export const sortedKind = (row: Row) => named(row) !== null && !HOUSEKEEPING.has(String(row.type ?? row.key ?? ""));

/** A figure set against the span it is compared with ("Enquiries up 48.8%, to 27,273 from 18,326"), another's change beside it where it matters. */
export function movedFrom(list: string, name: string, measure: string, now: number, then: number, score: number, span: string, other?: { name: string; change: number } | null): OwnFound {
  const change = changeOf(now, then);
  const kind = change >= 0 ? "movedUp" : "movedDown";
  const words = measureWords(measure);
  const unit = unitOf(measure);
  return {
    id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
    params: {
      name, measure, now: shown(measure, now), before: shown(measure, then), change: round1(Math.abs(change) * 100),
      ...(other ? { other: other.name, otherChange: round1(Math.abs(other.change) * 100), otherWay: other.change >= 0 ? "up" : "down" } : {}),
    },
    facts: [
      { key: "now", value: shown(measure, now), unit, label: `${name}: ${words}, this span` },
      { key: "before", value: shown(measure, then), unit, label: `${name}: ${words}, ${span}` },
      { key: "change", value: round1(Math.abs(change) * 100), unit: "percent", label: `${name}: how much ${words} ${change >= 0 ? "rose" : "fell"} against ${span}` },
      ...(other ? [{ key: "otherChange", value: round1(Math.abs(other.change) * 100), unit: "percent" as const, label: `${other.name}: how much it ${other.change >= 0 ? "rose" : "fell"} against ${span}` }] : []),
    ],
  };
}

/** A figure beside its reference: the whole website's (`other` null), or another's, named. */
export function setBeside(list: string, name: string, measure: string, value: number, mean: number, score: number, other: string | null): OwnFound {
  const kind = value > mean ? "rowAbove" : "rowBelow";
  const words = measureWords(measure);
  const unit = unitOf(measure);
  return {
    id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
    params: {
      name, measure, value: shown(measure, value), mean: shown(measure, mean), against: other === null ? "website" : "other",
      ...(other !== null ? { other } : {}), ...(MEASURES[measure]?.lessIsBetter ? { lessIsBetter: 1 } : {}),
    },
    facts: [
      { key: "value", value: shown(measure, value), unit, label: `${name}: ${words}` },
      { key: "mean", value: shown(measure, mean), unit, label: `${other ?? "the whole website"}: ${words}` },
    ],
  };
}

/** A share of a whole against its share the span before: "Blog: 4.1% of all the enquiries, from 9.3% before". */
export function shareFrom(list: string, name: string, measure: string, share: number, before: number, score: number, span: string): OwnFound {
  const words = measureWords(measure);
  return {
    id: `shareMoved:${list}:${measure}:${name}`, kind: "shareMoved", list, score,
    params: { name, measure, share: round1(share), shareBefore: round1(before) },
    facts: [
      { key: "share", value: round1(share), unit: "percent", label: `${name}'s share of all the ${words}, this span` },
      { key: "shareBefore", value: round1(before), unit: "percent", label: `${name}'s share of all the ${words}, ${span}` },
    ],
  };
}

/** A whole figure that moved, said by its own words ("Up to 38,666 visits from Google, from 37,830 before"). */
export function wholeFrom(list: string, measure: string, now: number, then: number, score: number, span: string): OwnFound {
  const kind = now >= then ? "wholeUp" : "wholeDown";
  const words = measureWords(measure);
  const unit = unitOf(measure);
  return {
    id: `${kind}:${list}:${measure}`, kind, list, score,
    params: { measure, now: shown(measure, now), before: shown(measure, then), change: round1(changeOf(now, then) * 100) },
    facts: [
      { key: "now", value: shown(measure, now), unit, label: `${words}, this span` },
      { key: "before", value: shown(measure, then), unit, label: `${words}, ${span}` },
    ],
  };
}

/** A rival's figure moving beside yours: "ironmongerydirect.co.uk: up to 48,616 from 40,000. You: 11,820, from 12,100". */
export function rivalMoved(list: string, name: string, measure: string, now: number, before: number, you: number, youBefore: number, score: number): OwnFound {
  const kind = now >= before ? "rivalUp" : "rivalDown";
  const words = measureWords(measure);
  const unit = unitOf(measure);
  return {
    id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
    params: { name, measure, now: shown(measure, now), before: shown(measure, before), you: shown(measure, you), youBefore: shown(measure, youBefore) },
    facts: [
      { key: "now", value: shown(measure, now), unit, label: `${name}: ${words}, this span` },
      { key: "before", value: shown(measure, before), unit, label: `${name}: ${words}, the span before` },
      { key: "you", value: shown(measure, you), unit, label: `the website: ${words}, this span` },
      { key: "youBefore", value: shown(measure, youBefore), unit, label: `the website: ${words}, the span before` },
    ],
  };
}

/** A move's weight: the figures gained or lost, as far as the change is big enough to trust (a fifth or more counts in full). */
export const moveWeight = (now: number, then: number) => Math.abs(now - then) * Math.min(1, Math.abs(changeOf(now, then)) * 5);

export type Mover = { name: string; now: number; then: number };
/** The biggest rise and the biggest fall in a list, each past the bars (a share of the span before, and a count). */
export function biggestMoves(rows: readonly Mover[], least: number, leastShare: number): Mover[] {
  const moving = rows.filter((one) => one.then > 0 && Math.abs(one.now - one.then) >= least && Math.abs(changeOf(one.now, one.then)) >= leastShare);
  const up = moving.filter((one) => one.now > one.then).sort((a, b) => moveWeight(b.now, b.then) - moveWeight(a.now, a.then))[0];
  const down = moving.filter((one) => one.now < one.then).sort((a, b) => moveWeight(b.now, b.then) - moveWeight(a.now, a.then))[0];
  return [up, down].filter((one): one is Mover => Boolean(one)).sort((a, b) => moveWeight(b.now, b.then) - moveWeight(a.now, a.then));
}

/** How big a move scores: from `base`, up to half as much again for a move of half or more. */
export const moveScore = (base: number, now: number, then: number) => base + Math.min(0.5, Math.abs(changeOf(now, then)));

/** A share of visits against a share of enquiries, far apart: a kind or source that skews the whole (bars below). */
export const SHARE_POINTS = 3;
export const SHARE_FAR_POINTS = 10;
export const SHARE_ABOVE = 1.5;
export type Split = { name: string; visits: number; enquiries: number };
/** The rows whose share of enquiries is furthest from their share of visits: the furthest below, then the furthest above. */
export function sharesApart(rows: readonly Split[], least: number): Array<{ row: Split; enquiriesShare: number; visitsShare: number; weight: number }> {
  const visits = rows.reduce((sum, row) => sum + row.visits, 0);
  const enquiries = rows.reduce((sum, row) => sum + row.enquiries, 0);
  if (visits <= 0 || enquiries <= 0) return [];
  const apart = rows
    .filter((row) => row.visits >= Math.max(least, visits * 0.02))
    .map((row) => ({ row, enquiriesShare: rateOf(row.enquiries, enquiries), visitsShare: rateOf(row.visits, visits) }))
    .filter((one) => {
      const gap = Math.abs(one.enquiriesShare - one.visitsShare);
      const ratio = one.visitsShare > 0 ? one.enquiriesShare / one.visitsShare : 0;
      return gap >= SHARE_FAR_POINTS || (gap >= SHARE_POINTS && (ratio >= SHARE_ABOVE || ratio <= 1 / SHARE_ABOVE));
    })
    .map((one) => ({ ...one, weight: Math.abs(one.enquiriesShare - one.visitsShare) * Math.sqrt(Math.max(one.visitsShare, one.enquiriesShare)) }));
  const below = apart.filter((one) => one.enquiriesShare < one.visitsShare).sort((a, b) => b.weight - a.weight)[0];
  const above = apart.filter((one) => one.enquiriesShare > one.visitsShare).sort((a, b) => b.weight - a.weight)[0];
  return [below, above].filter((one): one is NonNullable<typeof one> => Boolean(one));
}

/** An enquiry rate this many points from its reference, and half as much again or two-thirds, is worth saying. */
export const RATE_POINTS = 5;
export const RATE_FAR_POINTS = 20;
export type Rated = { name: string; visits: number; enquiries: number };
/** The row whose enquiry rate is furthest from its reference's, weighed by its visits: the furthest below, then above. */
export function ratesApart(rows: readonly Rated[], reference: number, least: number): Array<{ row: Rated; rate: number; weight: number }> {
  if (reference <= 0) return [];
  const visits = rows.reduce((sum, row) => sum + row.visits, 0);
  const apart = rows
    .filter((row) => row.visits >= Math.max(least, visits * 0.02))
    .map((row) => ({ row, rate: rateOf(row.enquiries, row.visits) }))
    .filter((one) => {
      const gap = Math.abs(one.rate - reference);
      return gap >= RATE_FAR_POINTS || (gap >= RATE_POINTS && (one.rate / reference >= SHARE_ABOVE || one.rate / reference <= 1 / SHARE_ABOVE));
    })
    .map((one) => ({ ...one, weight: Math.abs(one.rate - reference) * Math.sqrt(one.row.visits) }));
  const below = apart.filter((one) => one.rate < reference).sort((a, b) => b.weight - a.weight)[0];
  const above = apart.filter((one) => one.rate > reference).sort((a, b) => b.weight - a.weight)[0];
  return [below, above].filter((one): one is NonNullable<typeof one> => Boolean(one));
}

/** A row's visits and enquiries now and then, read from its trios. */
export function nowAndThen(row: Row, side: Side | null): { visits: Trio | null; enquiries: Trio | null; then: (trio: Trio | null) => number | null } {
  const visits = trioOf(row.visits), enquiries = trioOf(row.enquiries);
  return { visits, enquiries, then: (trio) => (trio && side ? trio[side] : null) };
}

/** The website's enquiries against the span compared, its visits' change beside: every period page's headline. */
export function headlineOf(figures: Row, side: Side | null, names: Row, list = "website", score = 2): OwnFound | null {
  const enquiries = trioOf(figures.enquiries), visits = trioOf(figures.visits);
  const then = enquiries && side ? enquiries[side] : null;
  if (!enquiries || then === null || then <= 0) return null;
  const visitsThen = visits && side ? visits[side] : null;
  const visitsName = word(names, "visits");
  const other = visits && visitsThen && visitsThen > 0 && visitsName ? { name: visitsName, change: changeOf(visits.now, visitsThen) } : null;
  return movedFrom(list, word(names, "website") ?? "The whole website", "enquiries", enquiries.now, then, moveScore(score, enquiries.now, then), SPAN[side!], other);
}

/** Each kind of page's moves and its share of enquiries against its share of visits, as the period view keeps them. */
export function kindsOf(view: Row, side: Side | null, names: Row, websiteChange: number | null): OwnFound[] {
  const found: OwnFound[] = [];
  const rows = rowsOf(view.kinds);
  // Shares over every kind, the not-sorted ones too, so a kind's share is of the whole website; named only when sorted.
  const all = rows.map((row) => ({ row, ...nowAndThen(row, side) })).filter((one) => one.visits && one.enquiries);
  const visitsAll = all.reduce((sum, one) => sum + one.visits!.now, 0);
  const enquiriesAll = all.reduce((sum, one) => sum + one.enquiries!.now, 0);
  const sorted = all.filter((one) => sortedKind(one.row));
  const splits = sorted.map((one) => ({ name: named(one.row)!, visits: one.visits!.now, enquiries: one.enquiries!.now }));
  // The shares against the whole website's: the sorted kinds' own visits and enquiries, of everything.
  const visitsShare = word(names, "visitsShare");
  if (visitsShare && visitsAll > 0 && enquiriesAll > 0) {
    for (const one of sharesApart([...splits, { name: "", visits: visitsAll - splits.reduce((sum, row) => sum + row.visits, 0), enquiries: enquiriesAll - splits.reduce((sum, row) => sum + row.enquiries, 0) }], 100).filter((one) => one.row.name)) {
      found.push(setBeside("kindShares", one.row.name, "enquiriesSharePercent", one.enquiriesShare, one.visitsShare, 1.1 + Math.min(0.5, one.weight / 100), visitsShare));
    }
  }
  // The kinds whose enquiries moved most against the span compared, the website's own change beside.
  const website = word(names, "website");
  const movers = sorted.map((one) => ({ name: named(one.row)!, now: one.enquiries!.now, then: one.then(one.enquiries) ?? 0 }));
  for (const one of biggestMoves(movers, Math.max(20, enquiriesAll * 0.01), 0.05)) {
    found.push(movedFrom("kinds", one.name, "enquiries", one.now, one.then, moveScore(0.9, one.now, one.then), side ? SPAN[side] : "the span before", website && websiteChange !== null ? { name: website, change: websiteChange } : null));
  }
  return found;
}
