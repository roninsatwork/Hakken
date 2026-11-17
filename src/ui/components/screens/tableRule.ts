/**
 * The table rule (Anthony, 2026-11-17: "we need to make a table rule, no
 * cluttered tables ever, and if we need more detail make a click through").
 *
 * A table holds the row's name and at most five more columns. A tick box that
 * draws a row on the chart (`tickColumn`) doesn't count. Anything more about a
 * row goes on the row's own screen, which the row opens. Keywords had nine
 * columns: in a narrower window its figures kept their width and the keyword
 * got 68 pixels, a word to a line, its heading run into Clicks.
 *
 * `DataTable` tells the tests' setup each table's shape as it draws
 * (`vitest.setup.ts`, `src/test/tableRule.ts`), so a cluttered table fails its
 * screen's tests; `npm run check:drawing` fails one on a board. The tables
 * already over it are frozen in `scripts/table-columns-allowlist.json`, which
 * may shrink, never grow. AGENTS.md, "Tables are lean".
 */

/** The name and five more. */
export const MOST_TABLE_COLUMNS = 6;

/** The column key a tick box for the chart carries (`tickColumn`): it doesn't count. */
export const TICK_COLUMN_KEY = "tick";

export type TableShape = {
  /** The columns that count: every one but a tick box for the chart. */
  counted: number;
  /** Their keys in order, joined with "|": the table's name on the frozen list. */
  keys: string;
};

export function tableShape(columns: ReadonlyArray<{ key: string }>): TableShape {
  const counted = columns.filter((column) => column.key !== TICK_COLUMN_KEY);
  return { counted: counted.length, keys: counted.map((column) => column.key).join("|") };
}

declare global {
  // Set only by the tests' setup; nothing in the app sets it, so the app's tables never pay for it.
  var __hakkenTableDrawn: ((shape: TableShape) => void) | undefined;
}

/** Called by `DataTable` as it draws: tells the tests' setup the table's shape, and does nothing in the app. */
export function tellTableDrawn(columns: ReadonlyArray<{ key: string }>): void {
  globalThis.__hakkenTableDrawn?.(tableShape(columns));
}
