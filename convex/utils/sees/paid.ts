import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep } from "../hakkenSees";

/**
 * What Hakken sees on the Paid search screens (docs/plans/active/discovery-
 * detail-and-hakken-sees-plan.md §6, "Paid search"): fixed rules over each
 * screen's own rows. The summary reads the chart's figures other screens
 * share, so it runs the rule over what it holds; Paid keywords returns its box.
 *
 * Searches and visits only, never money (ask-hakken-every-chart-page-plan-2026-11-03.md, decision 4; Anthony,
 * 2026-11-03: "Take it off", then "Yes, all of it"): what the adverts cost and what a click costs are our data
 * supplier's guesses, not money anyone measured. They stay in what is stored; no box speaks of them.
 */

type Maybe<T> = T | null;

/** Paid search → Summary: whether it advertises, on how many searches, and the visits those bring. */
export function paidSees(points: ReadonlyArray<{ paidKeywords?: number; paidTraffic?: number }>): Seen {
  const latest = [...points].reverse().find((point) => point.paidKeywords !== undefined);
  if (!latest) return seen([{ code: "none" }]);
  if (latest.paidKeywords === 0) return seen([{ code: "notAdvertising" }]);
  return seen([{ code: "advertising", a: latest.paidKeywords!, b: latest.paidTraffic ?? 0 }], [{ code: "seeKeywords", link: "paidKeywords", to: toPage("paid/keywords") }]);
}

/** Paid search → Paid keywords: the searches advertised on and the visits they bring, the one bringing most, and the most searched. */
export function paidKeywordsSees(rows: ReadonlyArray<{ keyword: string; traffic: number | null; volume: number | null }>): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const visits = [...rows].sort((left, right) => (right.traffic ?? 0) - (left.traffic ?? 0))[0];
  const searched = [...rows].sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0))[0];
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "keywords", a: rows.length, b: Math.round(rows.reduce((sum, row) => sum + (row.traffic ?? 0), 0)) },
    (visits.traffic ?? 0) > 0 ? { code: "mostVisits", text: visits.keyword, a: Math.round(visits.traffic!) } : null,
    (searched.volume ?? 0) > 0 && searched !== visits ? { code: "mostSearched", text: searched.keyword, a: searched.volume! } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    (visits.traffic ?? 0) > 0 ? { code: "seeSearch", text: visits.keyword, link: "seeSearch", to: toRecord("keyword", visits.keyword) } : null,
  ];
  return seen(says, steps);
}
