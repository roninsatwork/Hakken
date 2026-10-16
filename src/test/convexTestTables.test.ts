import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CONVEX_TEST_CHANGES, CONVEX_TEST_FILE, convexTestTables, withTableIds } from "./convexTestTables";

const installed = (): { file: string; code: string } => {
  const require = createRequire(import.meta.url);
  const file = path.join(path.dirname(require.resolve("convex-test/package.json")), "dist", "index.js");
  return { file, code: fs.readFileSync(file, "utf8") };
};

describe("the test database reads a table's own records (convexTestTables.ts)", () => {
  test("the installed convex-test has each place changed, once, and keeps each table's ids after the change", () => {
    const { file, code } = installed();
    expect(CONVEX_TEST_FILE.test(file)).toBe(true);
    const changed = withTableIds(code);
    for (const change of CONVEX_TEST_CHANGES) {
      expect(code.split(change.from).length - 1).toBe(1);
      expect(changed).toContain(change.to);
    }
    expect(changed).not.toContain("Object.keys(this._documents).filter(isInTable)");
  });

  test("a convex-test that no longer reads as expected fails loudly, naming the place", () => {
    const { code } = installed();
    expect(() => withTableIds(code.replace(CONVEX_TEST_CHANGES[0].from, "        const ids = new Set();"))).toThrow(/a query reads its own table's ids/);
  });

  test("only convex-test's own file is changed", () => {
    const plugin = convexTestTables();
    expect(plugin.transform("const x = 1;", "/app/node_modules/other/dist/index.js")).toBeNull();
    expect(plugin.transform(installed().code, "/app/node_modules/convex-test/dist/index.js?v=1")?.code).toContain("__tableIds");
  });
});
