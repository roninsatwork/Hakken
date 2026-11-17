import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";
import messages from "@/messages/en.json";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { MOST_TABLE_COLUMNS, tableShape } from "@/src/ui/components/screens/tableRule";
import { clutteredTable, judgeTable, TABLE_ALLOWLIST } from "@/src/test/tableRule";
import { MOST_TABLE_COLUMNS as DRAWING_MOST } from "../scripts/check-drawing.mjs";

/**
 * The table rule (Anthony, 2026-11-17: "no cluttered tables ever, and if we
 * need more detail make a click through"): a table holds the name and at most
 * five more columns, besides a tick box for the chart. `DataTable` tells the
 * tests' setup each table it draws, and a cluttered one fails the test that
 * drew it. AGENTS.md, "Tables are lean".
 */

/**
 * Tables over the rule the day it came in (2026-11-17), frozen in
 * scripts/table-columns-allowlist.json. It may shrink, never grow: lower this
 * with the list when a table is fixed, and never raise it.
 */
const FROZEN_MOST = 52;

type Row = { key: string };
const column = (key: string): DataTableColumn<Row> => ({ key, header: key, cell: (row) => row.key });
const draw = (columns: DataTableColumn<Row>[]) => render(
  <NextIntlClientProvider locale="en" messages={messages}>
    <DataTable rows={[{ key: "door handles" }]} rowKey={(row) => row.key} columns={columns} empty={{ icon: null, label: "None" }} />
  </NextIntlClientProvider>,
);

describe("the table rule", () => {
  test("the name and five more, and a tick box for the chart doesn't count", () => {
    expect(MOST_TABLE_COLUMNS).toBe(6);
    const lean = ["key", "clicks", "change", "impressions", "position"].map(column);
    expect(tableShape([column("tick"), ...lean])).toEqual({ counted: 5, keys: "key|clicks|change|impressions|position" });
    expect(clutteredTable(tableShape([column("tick"), ...lean, column("pages")]))).toBeNull();
    expect(clutteredTable(tableShape([...lean, column("ctr"), column("top")]))).toMatch(/^A cluttered table: 7 columns \(key, clicks, change, impressions, position, ctr, top\)/);
  });

  test("a cluttered table fails the test that draws it, unless it's on the frozen list", () => {
    const keywords = ["key", "clicks", "impressions", "ctr", "position", "count", "top", "track"].map(column);
    expect(() => judgeTable(tableShape(keywords), { report: "", allowed: () => new Set() })).toThrow(/A cluttered table: 8 columns/);
    expect(() => judgeTable(tableShape(keywords), { report: "", allowed: () => new Set(["key|clicks|impressions|ctr|position|count|top|track"]) })).not.toThrow();
  });

  // A run that records the tables over the rule (`HAKKEN_TABLE_REPORT`) fails none, this one included.
  test.skipIf(Boolean(process.env.HAKKEN_TABLE_REPORT))("the shared table tells the tests' setup what it draws", () => {
    expect(() => draw(["key", "clicks", "change", "impressions", "position", "pages"].map(column))).not.toThrow();
    // Seven columns: drawn in a test, the setup fails it.
    expect(() => draw(["key", "clicks", "change", "impressions", "ctr", "position", "pages"].map(column))).toThrow(/A cluttered table: 7 columns/);
  });

  test("a board's tables are held to the same most (npm run check:drawing)", () => {
    expect(DRAWING_MOST).toBe(MOST_TABLE_COLUMNS);
  });

  test("the frozen list only shrinks", () => {
    const { tables } = JSON.parse(readFileSync(TABLE_ALLOWLIST, "utf8")) as { tables: string[] };
    expect(new Set(tables).size, "the frozen list names a table twice").toBe(tables.length);
    expect(tables.length, "scripts/table-columns-allowlist.json grew: move the columns to the row's own screen instead").toBeLessThanOrEqual(FROZEN_MOST);
  });
});
