import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep } from "../hakkenSees";

/**
 * What Hakken sees on the Paid search screens (docs/plans/active/discovery-
 * detail-and-hakken-sees-plan.md §6, "Paid search"): fixed rules over each
 * screen's own rows. The summary reads the chart's figures other screens
 * share, so it runs the rule over what it holds; Paid keywords returns its box.
 */

type Maybe<T> = T | null;

/** Paid search → Summary: whether it advertises, on how many searches, and what those visits would cost. */
export function paidSees(points: ReadonlyArray<{ paidKeywords?: number; paidTraffic?: number; paidTrafficCost?: number }>): Seen {
  const latest = [...points].reverse().find((point) => point.paidKeywords !== undefined);
  if (!latest) return seen([{ code: "none" }]);
  if (latest.paidKeywords === 0) return seen([{ code: "notAdvertising" }]);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "advertising", a: latest.paidKeywords!, b: latest.paidTraffic ?? 0 },
    latest.paidTrafficCost !== undefined ? { code: "cost", a: latest.paidTrafficCost } : null,
  ];
  return seen(says, [{ code: "seeKeywords", link: "paidKeywords", to: toPage("paid/keywords") }]);
}

/** Paid search → Paid keywords: the searches advertised on, the dearest, and the one bringing most visits. */
export function paidKeywordsSees(rows: ReadonlyArray<{ keyword: string; traffic: number | null; trafficCost: number | null }>): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const dearest = [...rows].sort((left, right) => (right.trafficCost ?? 0) - (left.trafficCost ?? 0))[0];
  const visits = [...rows].sort((left, right) => (right.traffic ?? 0) - (left.traffic ?? 0))[0];
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "keywords", a: rows.length, b: Math.round(rows.reduce((sum, row) => sum + (row.trafficCost ?? 0), 0)) },
    (dearest.trafficCost ?? 0) > 0 ? { code: "dearest", text: dearest.keyword, a: Math.round(dearest.trafficCost!) } : null,
    (visits.traffic ?? 0) > 0 && visits !== dearest ? { code: "mostVisits", text: visits.keyword, a: visits.traffic! } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    (dearest.trafficCost ?? 0) > 0 ? { code: "seeSearch", text: dearest.keyword, link: "seeSearch", to: toRecord("keyword", dearest.keyword) } : null,
  ];
  return seen(says, steps);
}
