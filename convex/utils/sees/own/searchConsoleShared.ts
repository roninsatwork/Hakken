import type { FindingFact } from "../findings";
import { MEASURES, measureWords } from "../measures";
import { isNumber, isRow, round1, type OwnFound, type Row } from "./shared";

/**
 * What Search Console's pages' own rules share (moved out of `searchConsole.ts` as it passed a thousand lines with Pages'
 * rules, 2026-11-17, as `googleAnalyticsShared.ts` was): the bars a figure must clear, the page's words and names, and the
 * kinds of finding every page's rules make.
 */

/** A change too small to be news: under this share of the span before. */
export const LEAST_CHANGE = 0.02;
/** A span before under this share of the span itself is a part of one, never a span before. */
export const FAIR_BEFORE = 1 / 3;
/** A click rate under this many per cent is said per 1,000 times shown. */
export const PER_THOUSAND_UNDER = 2;
/** A place moved this many places or more is worth saying: a search's own, and the whole website's average over all its searches. */
export const PLACES_MOVED = 0.3;
export const WEBSITE_PLACES_MOVED = 0.1;
/** Times shown that make a click rate worth trusting. */
export const SHOWN_LEAST = 500;

export type Words = Row;
export const text = (holder: Row, key: string, fallback: string): string => (typeof holder[key] === "string" && (holder[key] as string).trim() ? (holder[key] as string).trim() : fallback);
export const wordsOf = (data: Row): Words => (isRow(data.words) ? data.words : {});
export const namesOf = (data: Row): Words => (isRow(data.names) ? data.names : {});
export const changeOf = (now: number, before: number) => (now - before) / before;
/** Two counts a day that still differ once said whole, as the panel says them: never "11 against 11" (Ronins, 2026-11-03). */
export const apartWhole = (now: number, before: number) => Math.round(now) !== Math.round(before);
/** A span before worth setting against: held, and not a sliver of the span itself. */
export const fairBefore = (now: number | null | undefined, before: number | null | undefined): before is number => isNumber(now) && isNumber(before) && before > 0 && before >= now * FAIR_BEFORE;
export const unitOf = (measure: string): FindingFact["unit"] => (MEASURES[measure]?.kind === "percent" ? "percent" : MEASURES[measure]?.kind === "place" || MEASURES[measure]?.kind === "score" ? "score" : "count");

/** A figure set against another's, named (`apartOther`): another group's, another place's, the span before's. */
export function against(list: string, name: string, measure: string, value: number, mean: number, score: number, other: string, extra: { facts?: FindingFact[] } = {}): OwnFound {
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
export const smallRates = (clicks: number, shown: number) => shown > 0 && (100 * clicks) / shown < PER_THOUSAND_UNDER;

/**
 * Two click rates set against each other, each as clicks over times shown: per cent, or per 1,000 times shown under 2%.
 * `perThousandChosen`: the page's own choice, so every rate on one page is said the same way (`smallRates`): on More
 * Handles' Click rate by position, place 1 read "14.4 for every 1,000" beside place 2, and "1.4%" beside the month before.
 */
export function ratesApart(list: string, name: string, clicks: number, shown: number, otherClicks: number, otherShown: number, score: number, other: string, perThousandChosen?: boolean): OwnFound {
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

/** A Classification, device or kind of rich result worth naming: a fair share of the impressions, and enough of them to trust its click rate. */
export const SPLIT_SHARE_LEAST = 0.05;
/** A click rate this far under the rest's is worth saying. */
export const RATE_UNDER = 0.8;
