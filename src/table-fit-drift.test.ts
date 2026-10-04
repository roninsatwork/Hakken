import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Tables fit the page (docs/plans/active/design-drift-plan.md, D4).
 *
 * Anthony, on Search Console: "Why can't we design data that fits". On
 * 2026-10-04 every one of the app's 146 kit tables still carried a minimum
 * width (480 to 1,180px; 1,000px by default), so each scrolled sideways in any
 * narrower window. They were all taken off; number columns are as wide as their
 * headings and text columns share the rest.
 *
 * The one table that scrolls sideways on purpose is Content gap's: the keyword
 * held in place while a column pair per competitor scrolls (approved
 * 2026-09-30, content-gap-ahrefs-layout-plan). Nothing joins it without the
 * same approval.
 */
const SIDEWAYS_ON_PURPOSE = new Set(["src/app/(dashboard)/app/sites/[siteId]/competitors/gap/page.tsx"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const root = process.cwd();
const files = sourceFiles(path.join(root, "src")).map((file) => path.relative(root, file));

describe("tables fit the page", () => {
  test("the kit's tables have no minimum width from a laptop up", () => {
    // A phone keeps a minimum and scrolls; from a laptop (lg) up, none.
    const table = readFileSync(path.join(root, "src/ui/components/screens/Table.tsx"), "utf8");
    expect(table).toMatch(/minWidthClassName = "min-w-\[\d+px\] lg:min-w-0",/);
    const compactList = readFileSync(path.join(root, "src/ui/components/screens/CompactList.tsx"), "utf8");
    expect(compactList).toMatch(/minWidthClassName = "",/);
  });

  test("no screen gives a table a minimum width, but the one approved to scroll", () => {
    const widened = files.filter((file) => !SIDEWAYS_ON_PURPOSE.has(file) && /minWidthClassName="[^"]+"/.test(readFileSync(path.join(root, file), "utf8")));
    expect(widened).toEqual([]);
  });

  test("no hand-built table is wider than the page can hold", () => {
    const wide = files.filter((file) => /<table[^>]*min-w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(readFileSync(path.join(root, file), "utf8")));
    expect(wide).toEqual([]);
  });
});
