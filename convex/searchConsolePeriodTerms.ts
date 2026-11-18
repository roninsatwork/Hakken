import type { SearchConsolePeriodList } from "./searchConsoleSchema";
import type { BookKind } from "./utils/searchConsoleTerms";
import { packNumbers } from "./utils/searchConsolePacks";
import { isBrand } from "./utils/searchConsoleViews";
import { isPageList } from "./searchConsolePeriodReads";
import type { PartToWrite } from "./searchConsolePeriods";

/**
 * A ready-made list's keywords and pages as places in its build's book (core-data-normalisation-plan.md §5.1): which
 * lists hold them, what each part names, and a part with them placed. Moved out of `searchConsolePeriods.ts`, which builds
 * the lists, as it passed a thousand lines with the main home country's own pages (2026-11-18).
 */

/** A list's part as written: its keywords and pages as places in the build's book where the list is one of the three that hold them. */
export type StoredPart = Omit<PartToWrite, "keys" | "tops" | "pages"> & { keys: string[] | string; tops?: string[] | string; pages?: string[] | string; brands?: string };

/** The lists whose keywords and pages go in the build's book: the keyword lists, the page lists and Pages competing. */
const BOOKED_LISTS: ReadonlySet<SearchConsolePeriodList> = new Set(["query", "page", "competing", "countryPage"]);

/** The keywords (`query`) or pages a list's part names: its own keys, a keyword's top page or a page's top keyword, Pages competing's pages. */
export function termsOf(list: SearchConsolePeriodList, part: PartToWrite, kind: BookKind): string[] {
  if (!BOOKED_LISTS.has(list)) return [];
  const keysKind: BookKind = isPageList(list) ? "page" : "query";
  return [
    ...(keysKind === kind ? part.keys : []),
    ...(part.tops && (isPageList(list) ? "query" : "page") === kind ? part.tops : []),
    ...(part.pages && kind === "page" ? part.pages : []),
  ];
}

/** A part with its keywords and pages as places in the build's book, packed, and each keyword's brand flag. Exported for the load test. */
export function inBook(list: SearchConsolePeriodList, part: PartToWrite, places: Record<BookKind, Map<string, number>>, brandWords: readonly string[]): StoredPart {
  if (!BOOKED_LISTS.has(list)) return part;
  const placed = (kind: BookKind, texts: readonly string[]) => packNumbers(texts.map((text) => places[kind].get(text) ?? 0));
  return {
    ...part,
    keys: placed(isPageList(list) ? "page" : "query", part.keys),
    ...(part.tops ? { tops: placed(isPageList(list) ? "query" : "page", part.tops) } : {}),
    ...(part.pages ? { pages: placed("page", part.pages) } : {}),
    ...(list === "query" && brandWords.length > 0 ? { brands: packNumbers(part.keys.map((key) => (isBrand(key, brandWords) ? 1 : 0))) } : {}),
  };
}
