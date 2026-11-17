import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import { MOST_TABLE_COLUMNS, type TableShape } from "@/src/ui/components/screens/tableRule";

/**
 * The tests' half of the table rule (`src/ui/components/screens/tableRule.ts`):
 * a table drawn with more than the name and five more columns fails the test
 * that drew it, unless it's on the frozen list of tables already over the rule
 * the day it came in. With `HAKKEN_TABLE_REPORT` set to a file, every table over
 * the rule is written there instead, with the test file that drew it, so the frozen list can be made from a run.
 */
export const TABLE_ALLOWLIST = path.join(process.cwd(), "scripts/table-columns-allowlist.json");

let frozen: ReadonlySet<string> | null = null;
function frozenTables(): ReadonlySet<string> {
  frozen ??= new Set((JSON.parse(readFileSync(TABLE_ALLOWLIST, "utf8")) as { tables: string[] }).tables);
  return frozen;
}

export function clutteredTable(shape: TableShape): string | null {
  if (shape.counted <= MOST_TABLE_COLUMNS) return null;
  return `A cluttered table: ${shape.counted} columns (${shape.keys.split("|").join(", ")}). A table holds the name and at most ${MOST_TABLE_COLUMNS - 1} more, `
    + `besides a tick box for the chart. Put the rest on the row's own screen, which the row opens (AGENTS.md, "Tables are lean").`;
}

export function judgeTable(shape: TableShape, { report = process.env.HAKKEN_TABLE_REPORT, allowed = frozenTables } = {}): void {
  const fault = clutteredTable(shape);
  if (!fault) return;
  if (report) {
    appendFileSync(report, `${shape.keys}\t${path.relative(process.cwd(), expect.getState().testPath ?? "")}\n`);
    return;
  }
  if (allowed().has(shape.keys)) return;
  throw new Error(fault);
}
