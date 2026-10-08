import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { PERSONAL_DATA_INDEXES } from "./personalDataService";

/**
 * Every index is read by something (core-data-normalisation-plan.md §7.4,
 * 2026-10-08). Convex keeps each index beside each row and writes it on every
 * insert, change and removal, so an index nothing reads is paid for on every
 * write and never used: 102 of 682 were, and went. This fails one added that
 * nothing reads, as `keepRules.test.ts` fails a table without a keep rule.
 *
 * An index counts as read where code names it in `withIndex` or
 * `withSearchIndex` beside a query of its own table — the nearest
 * `query("…")` before it, or none near, which counts too (a helper handed its
 * query) — and where the personal data search names it
 * (`PERSONAL_DATA_INDEXES`). Tests do not count: an index only a test reads is
 * kept for nothing.
 */

const ROOT = path.resolve(__dirname, "..");
/** How far before an index's name its table's query is looked for. */
const NEAR = 600;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ["_generated", "node_modules"].includes(entry.name) ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

type Declared = { table: string; index: string; search: boolean };

function declaredIndexes(schemaFiles: readonly string[]): Declared[] {
  return schemaFiles.flatMap((file) => {
    const src = fs.readFileSync(file, "utf8");
    const starts = [...src.matchAll(/^ {2}(\w+): defineTable\(/gm)].map((match) => ({ table: match[1], at: match.index ?? 0 }));
    return starts.flatMap((start, at) => {
      const body = src.slice(start.at, starts[at + 1]?.at ?? src.length);
      return [
        ...[...body.matchAll(/\.index\("(\w+)"/g)].map((match) => ({ table: start.table, index: match[1], search: false })),
        ...[...body.matchAll(/\.searchIndex\("(\w+)"/g)].map((match) => ({ table: start.table, index: match[1], search: true })),
      ];
    });
  });
}

function isRead(code: readonly string[], declared: Declared): boolean {
  const named = new RegExp(`${declared.search ? "withSearchIndex" : "withIndex"}\\(\\s*["'\`]${declared.index}["'\`]`, "g");
  return code.some((src) => [...src.matchAll(named)].some((match) => {
    const before = src.slice(Math.max(0, (match.index ?? 0) - NEAR), match.index);
    const table = [...before.matchAll(/query\(\s*"(\w+)"\s*\)/g)].pop()?.[1];
    return table === undefined || table === declared.table;
  }));
}

describe("every index is read", () => {
  test("no index is kept that nothing reads", () => {
    const files = [...sourceFiles(path.join(ROOT, "convex")), ...sourceFiles(path.join(ROOT, "src"))];
    const schemaFiles = files.filter((file) => file.startsWith(path.join(ROOT, "convex")) && /[sS]chema\.ts$/.test(file));
    const code = files.filter((file) => !schemaFiles.includes(file)).map((file) => fs.readFileSync(file, "utf8"));
    const personal = new Set(Object.entries(PERSONAL_DATA_INDEXES).map(([field, index]) => `${field.split(".")[0]}.${index}`));

    const declared = declaredIndexes(schemaFiles);
    expect(declared.length).toBeGreaterThan(500);
    const unread = declared
      .filter((one) => !personal.has(`${one.table}.${one.index}`) && !isRead(code, one))
      .map((one) => `${one.table}.${one.index}${one.search ? " (search)" : ""}`);
    expect(unread, `Indexes nothing reads — remove them, or read them:\n${unread.join("\n")}`).toEqual([]);
  });
});
