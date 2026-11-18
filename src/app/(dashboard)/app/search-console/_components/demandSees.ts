import type { DemandRow } from "@/convex/utils/searchConsoleDemand";

/**
 * Demand by Classification's figures, worked out once for its bands, squares, table and eye
 * (search-console-demand-by-classification-way-2-plan-2026-11-18.md; the rules are
 * `convex/utils/sees/own/searchConsoleDemand.ts`). Every figure is the country chosen in the menu's: the boxes its own
 * totals, and its Classifications from its own pages. Google leaves the searches it keeps private out of a country's
 * pages, so the Classifications share out only the clicks it ties to a page, as Keywords' table shares out only the
 * searches it names (Anthony, 18 November 2026: "yes i think so"). No part stands for the difference. Pure, so the page
 * and the rules' test of every period (`convex/utils/sees/searchConsolePeriods.test.ts`) build the very same figures.
 */

/** A Classification, Unclassified, or one of Hakken's page types before the website has any, as the page draws it. */
export type DemandPart = {
  key: string;
  name: string;
  /** A Classification the reader made (or Hakken's page type, before any): never Unclassified. */
  sorted: boolean;
  clicks: number;
  impressions: number;
  /** Null where the dates before aren't held. */
  clicksBefore: number | null;
  impressionsBefore: number | null;
  /** The pages Google showed in the dates. */
  pages: number;
};

/** The country's own figures, as the boxes show them; null where the dates before aren't held. */
export type DemandTotals = { clicks: number; impressions: number };

/** The names the page says things by, in the reader's words. */
export type DemandNames = {
  /** A Classification's name, Unclassified, or a page type, by its kind. */
  kind: (kind: string) => string;
  /** Whether a kind is one the page names in its findings: a Classification or a page type, never Unclassified. */
  sorted: (kind: string) => boolean;
};

/** Each Classification's part of the country's pages, its dates before only where both the pages and the boxes hold them. */
export function demandParts(rows: readonly DemandRow[], previous: DemandTotals | null, comparable: boolean, names: DemandNames): DemandPart[] {
  const held = comparable && previous !== null;
  return rows.map((row) => ({
    key: row.kind,
    name: names.kind(row.kind),
    sorted: names.sorted(row.kind),
    clicks: row.clicks,
    impressions: row.impressions,
    clicksBefore: held ? (row.clicksBefore ?? 0) : null,
    impressionsBefore: held ? (row.impressionsBefore ?? 0) : null,
    pages: row.pages,
  }));
}

/** The names the eye is handed beside the figures, in the reader's language. */
export type DemandEyeNames = { others: string; allPages: string; hidden: string };

/**
 * What the page hands its eye: each Classification with its figures and the span before's where held, and the country's
 * own totals, the boxes', so the eye can say how many clicks Google tied to no page, as Keywords' eye says of the searches
 * Google hides. Unclassified is in the figures, never named.
 */
export function demandPageData(input: { parts: readonly DemandPart[]; totals: DemandTotals | null; previous: DemandTotals | null; names: DemandEyeNames }) {
  const { parts, totals, previous } = input;
  const held = parts.length > 0 && parts.every((part) => part.clicksBefore !== null);
  return {
    classifications: [...parts].sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions).map((part) => ({
      name: part.name, clicks: part.clicks, impressions: part.impressions, clicksBefore: part.clicksBefore, impressionsBefore: part.impressionsBefore,
      pages: part.pages, sorted: part.sorted,
    })),
    website: totals ? { clicks: totals.clicks, impressions: totals.impressions, clicksBefore: held && previous ? previous.clicks : null, impressionsBefore: held && previous ? previous.impressions : null } : null,
    names: input.names,
  };
}
