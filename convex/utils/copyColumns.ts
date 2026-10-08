import { packNumbers, unpackNumbers } from "./searchConsolePacks";

/**
 * A compact copy's part as columns (core-data-normalisation-plan.md §6.4,
 * 2026-10-08): its rows turned on their side, each column held the cheapest
 * way its values allow and read back exactly as the rows were. Held as rows of
 * JSON, dev's copies were 9.1 MB, the keyword copies 196 bytes a keyword — a
 * screen reading a list of 50,000 would read 10 MB. As columns, 5.9 MB.
 *
 * - **Whole numbers** (a position, a volume, a change, a day's count): packed
 *   (`packNumbers`), a blank as 0, a number of 0 or more one up, below 0 as it is.
 * - **Text that repeats** (a band, an intent, a page): each once in a book, the
 *   column their places in it, packed, a blank as 0.
 * - **Anything else** (a fraction, text that does not repeat): its list, as JSON.
 *
 * A part kept before is a list of rows, and is read as it was.
 */

type Column =
  | { i: string }
  | { b: string[]; p: string }
  | { v: unknown[] };

type Part = { n: number; c: Column[] };

/** What JSON would make of a value: a blank for nothing, as a row of JSON held it. */
const asJson = (value: unknown) => (value === undefined || (typeof value === "number" && !Number.isFinite(value)) ? null : value);

const isWhole = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isSafeInteger(value));

function encodeColumn(values: unknown[]): Column {
  if (values.every(isWhole)) {
    return { i: packNumbers(values.map((value) => (value === null ? 0 : value >= 0 ? value + 1 : value))) };
  }
  if (values.every((value) => value === null || typeof value === "string")) {
    const book = new Map<string, number>();
    const places = values.map((value) => {
      if (value === null) return 0;
      const held = book.get(value as string);
      if (held !== undefined) return held;
      book.set(value as string, book.size + 1);
      return book.size;
    });
    // A book only where text repeats: a column of names each once is cheaper as its list.
    if (book.size <= values.length * 0.6) return { b: [...book.keys()], p: packNumbers(places) };
  }
  return { v: values };
}

function decodeColumn(column: Column): unknown[] {
  if ("i" in column) return unpackNumbers(column.i).map((value) => (value === 0 ? null : value > 0 ? value - 1 : value));
  if ("b" in column) return unpackNumbers(column.p).map((place) => (place === 0 ? null : column.b[place - 1]));
  return column.v;
}

/** Rows as a part's JSON, column by column. Every row as long as the copy's fields. */
export function encodeCopyRows(rows: readonly unknown[][], width: number): string {
  const columns: Column[] = [];
  for (let at = 0; at < width; at += 1) columns.push(encodeColumn(rows.map((row) => asJson(row[at]))));
  const part: Part = { n: rows.length, c: columns };
  return JSON.stringify(part);
}

/** A part's rows, whether kept as columns or, before 2026-10-08, as rows. */
export function decodeCopyRows(data: string): unknown[][] {
  const parsed = JSON.parse(data) as unknown[][] | Part;
  if (Array.isArray(parsed)) return parsed;
  const columns = parsed.c.map(decodeColumn);
  return Array.from({ length: parsed.n }, (_, row) => columns.map((column) => column[row]));
}
