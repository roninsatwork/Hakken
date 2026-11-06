import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { walkRepoFiles } from "./test/driftUtils";

/**
 * A whole website's visits are Google's own total (Anthony, 2026-11-06: "Google's total"; overview-new-page-plan-2026-11-06.md, step 1).
 * Google counts each list on its own, so the channels, the days or the pages add up to a little more or less than the total. A box that
 * names the website's visits reads the total. Adding up a list's rows for it would put two different numbers on two screens.
 */

const ROOT = process.cwd();
const SCREENS = path.join(ROOT, "src/app/(dashboard)/app/analytics");

describe("whole-website visits", () => {
  test("no Visits box adds up a list's rows", () => {
    const files = walkRepoFiles(SCREENS, new Set([".tsx"])).filter((file) => !file.endsWith(".test.tsx"));
    expect(files.length).toBeGreaterThan(10);
    const faults = files.flatMap((file) => readFileSync(file, "utf8").split("\n").flatMap((line, at) => {
      const box = /<Figure\b[^>]*label=\{t\("visits"\)\}/.test(line);
      return box && /\.reduce\(|sumOf\(/.test(line) ? [`${path.relative(ROOT, file)}:${at + 1}`] : [];
    }));
    expect(faults).toEqual([]);
  });

  test("Overview's box and squares read the total, and only a share adds up a list", () => {
    const parts = readFileSync(path.join(SCREENS, "_components/OverviewParts.tsx"), "utf8");
    expect(parts).toMatch(/<Figure label=\{t\("visits"\)\}[^\n]*value=\{formatNumber\(now\.visits\)\}/);
    expect(parts).toMatch(/now: \{ visits: figures\?\.visits \?\? 0, stayed: figures\?\.engaged \?\? 0/);
  });
});
