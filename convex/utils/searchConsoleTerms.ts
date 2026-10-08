/**
 * A keyword's or page's place in its build's book, as the list screens carry
 * it (core-data-normalisation-plan.md, §5.1): a short token standing for the
 * text, so the lists are read, joined, grouped and sorted without the text,
 * and only the rows on screen are named. Pure: the book itself is
 * `searchConsolePeriodBooks.ts`.
 *
 * A token is a mark, the book it is in — `q` keywords, `p` pages — and its
 * place, seven digits: so tokens of one book sort as their places, and the
 * book is sorted A to Z, so sorting by token is sorting A to Z. Text never
 * starts with the mark, so a row holding text — a list asked of Google, a
 * keyword Google never showed — is told apart and kept as it is.
 */

const MARK = "\u0001";
const WIDTH = 7;

export type BookKind = "query" | "page";

const LETTER: Record<BookKind, string> = { query: "q", page: "p" };

export function termToken(kind: BookKind, place: number): string {
  return `${MARK}${LETTER[kind]}${String(place).padStart(WIDTH, "0")}`;
}

export function isTermToken(value: string): boolean {
  return value.startsWith(MARK);
}

/** A token's book and place; null for text. */
export function tokenPlace(value: string): { kind: BookKind; place: number } | null {
  if (!isTermToken(value)) return null;
  return { kind: value[1] === "p" ? "page" : "query", place: Number(value.slice(2)) };
}

/** The one A-to-Z order a book is sorted in, and looked up by: the screens' own (`utils/sortOrder.ts`). */
export const compareTerms = (left: string, right: string): number => left.localeCompare(right);

/** Where a text falls in a sorted list of each record's first entry: the record that would hold it. */
export function recordFor(firsts: readonly string[], text: string): number {
  let low = 0;
  let high = firsts.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (compareTerms(firsts[middle], text) <= 0) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}
