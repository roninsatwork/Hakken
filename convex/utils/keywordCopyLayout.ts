import type { Id } from "../_generated/dataModel";

/**
 * Where a website's compact keyword copy is kept, and the layout of its rows
 * (`siteKeywordCopy.ts`, `siteListCopies.ts`): here, with nothing else, so a
 * test fixture can write one without importing a module of Convex functions
 * (`src/test/keywordCopies.ts`).
 */

/** A website's keyword copy from one place. */
export const keywordsCopyKey = (websiteId: Id<"websites">, locationCode: number) => `${websiteId}:${locationCode}`;

/**
 * The row's id leads, so the rows on screen are read in full by id — the
 * cheapest read there is — rather than looked up by keyword one by one.
 */
export const KEYWORD_COPY_FIELDS = [
  "id", "keyword", "position", "band", "page", "volume", "intent", "status", "change", "day", "kdBand", "cpc", "traffic", "difficulty",
] as const;
