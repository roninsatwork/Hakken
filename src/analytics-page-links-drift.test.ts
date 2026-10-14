import path from "path";
import { describe, expect, test } from "vitest";
import { readRepoFile, relativePath, repoRoot, walkFiles } from "./test/driftUtils";

/**
 * Every page in the Google Analytics section opens the page's own screen
 * (docs/plans/active/landing-pages-flow-plan.md LF8; Anthony, 2026-10-14:
 * "this should be the default to all page level click throughs in this
 * section … that details page on all pages is really strong"), and that
 * screen goes back to the screen it was opened from (LF9: "the back button
 * on the screen should take you back to the screen you came from").
 *
 * So no screen or box links a landing page's own screen, which only
 * forwards old links now, and every page link goes through `usePageHref`,
 * which carries the screen it was clicked on.
 */
const SCREENS = path.join(repoRoot, "src/app/(dashboard)/app/analytics");
const BOXES = path.join(repoRoot, "convex/utils/sees");
const FORWARD = "src/app/(dashboard)/app/analytics/[siteId]/landing-pages/page/page.tsx";
const HELPER = "src/app/(dashboard)/app/analytics/_components/useAnalytics.ts";

const sources = (root: string) => walkFiles(root, new Set([".ts", ".tsx"])).map(relativePath).filter((file) => !/\.test\.tsx?$/.test(file));

describe("a page's link in Google Analytics (LF8, LF9)", () => {
  test("no screen or box links a landing page's own screen", () => {
    const old = [...sources(SCREENS), ...sources(BOXES)].filter((file) => file !== FORWARD && readRepoFile(file).includes("landing-pages/page"));
    expect(old, "Link a page with usePageHref (a screen) or toPage(\"all-pages/page\") (a box): the landing page's own screen is retired.").toEqual([]);
  });

  test("every screen's page link goes through usePageHref, so the page's screen knows where to go back to", () => {
    const direct = sources(SCREENS).filter((file) => file !== HELPER && /\(\s*["']all-pages\/page["']\s*,/.test(readRepoFile(file)));
    expect(direct, "A page link built by hand loses the screen it was clicked on: use usePageHref().").toEqual([]);
  });
});
