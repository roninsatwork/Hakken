import {
  classifierFor,
  normalisePage,
  type ClassificationLine,
  type ClassificationPick,
} from "./pageClassification";

/**
 * A page's kind as the charts and screens show it (docs/plans/active/
 * page-groups-plan.md, decisions 2 and 3): Hakken's own page type until the
 * website has a classification of the company's own; from then on its
 * classification — the classification's id — or Not sorted when none catches
 * it, never an automatic kind.
 *
 * Worked out when a list is read, never stored: the hold's classifications,
 * lines and pages set by hand are read once per read (`convex/pageKinds.ts`),
 * then each page asks the one rule every screen shares (`classifierFor`).
 * Plain code, no Convex, so the live Search Console asks build the same
 * answer from what their internal query hands them, and the screens can name
 * the values.
 */

/** A page no classification catches, once the website has any (decision 3): never an automatic kind. */
export const NOT_SORTED_KIND = "NOT_SORTED";

export const CLASSIFICATION_TYPES = ["INFORMATIONAL", "SERVICE", "PRODUCT", "CASE_STUDY", "COMPANY", "LEGAL", "OTHER"] as const;
export type ClassificationType = (typeof CLASSIFICATION_TYPES)[number];

/** One of the website's classifications, as a screen names it and a figure adds it up. */
export type KindChoice = { id: string; name: string; type: ClassificationType };

/**
 * What a read needs to classify the website's pages, read once by the hold's
 * own indexes. `sitemap` holds the pages listed in the sitemap files the
 * website's "listed in sitemap file" lines name — the only pages such a line
 * can catch — so a page is never looked up on its own.
 */
export type PageKindSetup = {
  classifications: KindChoice[];
  lines: ClassificationLine[];
  picks: ClassificationPick[];
  sitemap: Array<{ page: string; file: string }>;
  /** True when the sitemap pages were cut at their read limit: past it, a sitemap-file line catches nothing. */
  sitemapCut: boolean;
};

export type PageKinds = {
  /** The classifications, A to Z by name: a filter's choices. */
  choices: KindChoice[];
  /** A page's kind: its classification's id, or `NOT_SORTED_KIND`. `sitemapFile`, when known, beats the lookup. */
  kindOf: (address: string, sitemapFile?: string | null) => string;
  /** A kind's name: null for Not sorted, or a value that is not one of these classifications. */
  nameOf: (kind: string) => string | null;
  /** A kind's classification type: null for Not sorted. */
  typeOf: (kind: string) => ClassificationType | null;
};

/** The classifier for a website's setup. */
export function pageKindsFrom(setup: PageKindSetup): PageKinds {
  const choices = [...setup.classifications].sort((left, right) => left.name.localeCompare(right.name));
  const byId = new Map(choices.map((choice) => [choice.id, choice]));
  const classify = classifierFor(setup.lines, setup.picks);
  const files = new Map(setup.sitemap.map((entry) => [normalisePage(entry.page), entry.file]));
  return {
    choices,
    kindOf: (address, sitemapFile) => {
      const file = sitemapFile !== undefined ? sitemapFile : (files.get(normalisePage(address)) ?? null);
      const found = classify(address, file).classificationId;
      return found !== null && byId.has(found) ? found : NOT_SORTED_KIND;
    },
    nameOf: (kind) => byId.get(kind)?.name ?? null,
    typeOf: (kind) => byId.get(kind)?.type ?? null,
  };
}

/** A count of pages, or rows, by kind. */
export type KindCount = { kind: string; rows: number; clicks: number };

/**
 * The kinds added up by classification type — what reports add up across a
 * company's own names (Types' "Clicks from informational content" and "Clicks
 * from service pages"), the most rows first. Not sorted has no type and is
 * left out.
 */
export function countsByType(kinds: readonly KindCount[], typeOf: (kind: string) => ClassificationType | null): Array<{ type: ClassificationType; rows: number; clicks: number }> {
  const types = new Map<ClassificationType, { type: ClassificationType; rows: number; clicks: number }>();
  for (const entry of kinds) {
    const type = typeOf(entry.kind);
    if (type === null) continue;
    const held = types.get(type) ?? { type, rows: 0, clicks: 0 };
    held.rows += entry.rows;
    held.clicks += entry.clicks;
    types.set(type, held);
  }
  return [...types.values()].sort((left, right) => right.rows - left.rows || right.clicks - left.clicks);
}
