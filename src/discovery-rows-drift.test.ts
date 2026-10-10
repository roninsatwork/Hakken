import path from "path";
import { describe, expect, test } from "vitest";
import { readRepoFile, relativePath, repoRoot, walkFiles } from "./test/driftUtils";

/**
 * Every row in Discovery opens something (docs/plans/active/discovery-detail-
 * and-hakken-sees-plan.md DS1; Anthony, 2026-10-10: "why do none of the
 * tables click through" and "this is just one example"): a detail screen, a
 * screen that exists, or the page itself. Each `DataTable` under Discovery's
 * websites gives its rows an `onRowClick`, but the few whose rows are the
 * whole record already.
 */
const ROOT = "src/app/(dashboard)/app/sites";

/** Tables whose rows stay as they are, and why (§4). */
const STAYS: Record<string, { tables: number; why: string }> = {
  "src/app/(dashboard)/app/sites/[siteId]/reviews/page.tsx": { tables: 1, why: "each row is the whole review" },
  "src/app/(dashboard)/app/sites/[siteId]/local/listings/page.tsx": { tables: 1, why: "Is one of these yours?: its row actions are the job" },
  "src/app/(dashboard)/app/sites/[siteId]/local/page.tsx": { tables: 1, why: "What your profile shows: each row is the whole check" },
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/ips/page.tsx": { tables: 1, why: "which links come from which server is not stored (DS7)" },
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/quality/page.tsx": { tables: 1, why: "each row is one check's whole reading" },
  "src/app/(dashboard)/app/sites/[siteId]/keywords/new-lost/page.tsx": { tables: 1, why: "the checks table: each row is one check's whole reading" },
};

/**
 * Tables not yet opening anything while the plan is built (§9). This list
 * may shrink, never grow: a table given its row link comes off it in the
 * same change.
 */
const PENDING: Record<string, number> = {
  "src/app/(dashboard)/app/sites/[siteId]/ai/demand/page.tsx": 1,
  "src/app/(dashboard)/app/sites/[siteId]/assets/page.tsx": 1,
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/new-lost/page.tsx": 1,
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/where/page.tsx": 1,
  "src/app/(dashboard)/app/sites/[siteId]/mentions/page.tsx": 1,
};

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
const unopened = () => Object.fromEntries(
  walkFiles(path.join(repoRoot, ROOT), new Set([".tsx"]))
    .map(relativePath)
    .filter((file) => !file.endsWith(".test.tsx"))
    .map((file) => {
      const text = readRepoFile(file);
      return [file, count(text, /<DataTable\b/g) - count(text, /\bonRowClick=/g)] as const;
    })
    .filter(([, left]) => left > 0),
);

describe("Every Discovery row opens something", () => {
  test("no table's rows open nothing, but those that stay and those being given their link", () => {
    const over = Object.entries(unopened())
      .filter(([file, left]) => left > (STAYS[file]?.tables ?? 0) + (PENDING[file] ?? 0))
      .map(([file, left]) => `${file}: ${left} table(s) whose rows open nothing`);
    expect(over, "Give the table's rows an onRowClick to a detail screen, a screen that exists, or the page itself (docs/plans/active/discovery-detail-and-hakken-sees-plan.md §4).").toEqual([]);
  });

  test("the list of tables being given their link only shrinks", () => {
    const left = unopened();
    const stale = Object.entries(PENDING)
      .filter(([file, tables]) => (left[file] ?? 0) - (STAYS[file]?.tables ?? 0) < tables)
      .map(([file]) => file);
    expect(stale, "These tables open something now: lower or remove their PENDING count.").toEqual([]);
  });
});
