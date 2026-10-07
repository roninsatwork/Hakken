import path from "node:path";
import { describe, expect, it } from "vitest";
import { isIgnoredRepoFile } from "./driftUtils";

/**
 * What a test run writes is never scanned by a drift test (AGENTS.md, "Tests
 * that never flake"): a drift test reading coverage's half-written
 * `coverage/.tmp` files failed a coverage run on timing alone (2026-10-07).
 */
describe("the repo scan", () => {
  it("never reads what a test run writes", () => {
    for (const written of ["coverage/.tmp/coverage-0.json", "coverage/coverage-final.json", "test-results/test-timings.json", "playwright-report/index.html"]) {
      expect(isIgnoredRepoFile(path.join(process.cwd(), written))).toBe(true);
    }
  });

  it("still reads the source", () => {
    expect(isIgnoredRepoFile(path.join(process.cwd(), "convex/schema.ts"))).toBe(false);
  });
});
