/**
 * Which of a company's classifications a page belongs to
 * (docs/plans/active/page-groups-plan.md). One rule, used wherever pages are
 * shown by classification — the admin Page classification page, Your pages,
 * and every chart that replaces Hakken's page kinds with the company's own —
 * so they can never disagree.
 *
 * - A page set by hand keeps what it was given; a page taken out by hand is
 *   Not sorted, whatever its lines say.
 * - Otherwise the **more exact line wins**, never an order to manage: an exact
 *   address beats a "starts with", a longer "starts with" beats a shorter one,
 *   any "starts with" beats a "contains" (longer first again), and a sitemap
 *   file comes last.
 * - A page no line catches takes Auto Classify's answer, when it gave one
 *   it was sure or fairly sure of (docs/plans/active/auto-classify-plan.md,
 *   AC1): it never beats a person or a line.
 * - Otherwise the page is Not sorted.
 *
 * Addresses are compared as paths, in lower case, with Google's jump links
 * (`#…`) and any query left off.
 */

export type ClassificationLineKind = "STARTS_WITH" | "CONTAINS" | "EXACT" | "SITEMAP_FILE";

export type ClassificationLine<Id extends string = string> = { classificationId: Id; kind: ClassificationLineKind; value: string };

/** A page set by hand: to a classification, or taken out of its line (`null`). */
export type ClassificationPick<Id extends string = string> = { page: string; classificationId: Id | null };

/** How sure Auto Classify was of a group it gave; a page it wasn't sure of keeps none. */
export type AutoCertainty = "SURE" | "FAIRLY_SURE";

/** Auto Classify's group for a page (auto-classify-plan.md, AC1), applied only where no hand or line sets one. */
export type ClassificationAuto<Id extends string = string> = { page: string; classificationId: Id; certainty: AutoCertainty };

export type PageClassification<Id extends string = string> =
  | { classificationId: Id; how: "BY_HAND" }
  | { classificationId: Id; how: "BY_LINE"; line: ClassificationLine<Id> }
  | { classificationId: Id; how: "BY_AUTO"; certainty: AutoCertainty }
  | { classificationId: null; how: "TAKEN_OUT" | "NONE" };

/** A page's address as classifications compare it: a lower-case path, no host, no `#…`, no query. */
export function normalisePage(address: string): string {
  let path = address.trim();
  const host = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(path);
  if (host) path = path.slice(host[0].length);
  path = path.split("#")[0].split("?")[0];
  if (!path.startsWith("/")) path = `/${path}`;
  return path.toLowerCase();
}

/** How exact a line is: higher wins. Exact, then "starts with" by length, then "contains" by length, then a sitemap file. */
function exactness(line: ClassificationLine): number {
  const length = line.value.length;
  switch (line.kind) {
    case "EXACT": return 3_000_000;
    case "STARTS_WITH": return 2_000_000 + length;
    case "CONTAINS": return 1_000_000 + length;
    case "SITEMAP_FILE": return 0;
  }
}

function catches(line: ClassificationLine, page: string, sitemapFile: string | null): boolean {
  switch (line.kind) {
    case "EXACT": return page === normalisePage(line.value);
    case "STARTS_WITH": return page.startsWith(normalisePage(line.value));
    case "CONTAINS": return line.value.trim() !== "" && page.includes(line.value.trim().toLowerCase());
    case "SITEMAP_FILE": return sitemapFile !== null && sitemapFile.toLowerCase() === line.value.trim().toLowerCase();
  }
}

/**
 * A classifier for one website: give it the company's lines, its pages set
 * by hand and Auto Classify's answers once, then ask it about each page.
 * Lines are ordered by exactness once, so a page costs one pass over them at
 * most.
 */
export function classifierFor<Id extends string>(
  lines: readonly ClassificationLine<Id>[],
  picks: readonly ClassificationPick<Id>[],
  autos: readonly ClassificationAuto<Id>[] = [],
): (page: string, sitemapFile?: string | null) => PageClassification<Id> {
  const byHand = new Map(picks.map((pick) => [normalisePage(pick.page), pick.classificationId]));
  const byAuto = new Map(autos.map((auto) => [normalisePage(auto.page), auto]));
  // Most exact first; between equals, the order given (which callers keep stable).
  const ordered = lines
    .map((line, index) => ({ line, index, rank: exactness(line) }))
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map((entry) => entry.line);
  return (address, sitemapFile = null) => {
    const page = normalisePage(address);
    if (byHand.has(page)) {
      const chosen = byHand.get(page) ?? null;
      return chosen === null ? { classificationId: null, how: "TAKEN_OUT" } : { classificationId: chosen, how: "BY_HAND" };
    }
    const line = ordered.find((candidate) => catches(candidate, page, sitemapFile));
    if (line) return { classificationId: line.classificationId, how: "BY_LINE", line };
    const auto = byAuto.get(page);
    return auto ? { classificationId: auto.classificationId, how: "BY_AUTO", certainty: auto.certainty } : { classificationId: null, how: "NONE" };
  };
}
