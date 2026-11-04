import path from "path";
import { describe, expect, test } from "vitest";
import { OWN_FINDINGS } from "@/convex/utils/sees/pageOwnFindings";
import { SEES_SCREENS } from "@/convex/utils/sees/screens";
import { readRepoFile, relativePath, repoRoot, walkFiles } from "./test/driftUtils";

/**
 * No page's eye is called done when it isn't (ask-hakken-every-chart-page-plan-2026-11-03.md, shared work 10; Anthony,
 * 2026-11-03: "this is the 3rd or 4th time of asking and each time we fail", "please add this to your tests and your
 * rules"). Once "done" meant the eye opened; the general rules spoke on 154 pages and found trivia. Now:
 *
 * - every page with rules of its own has a true screen entry — what it is, its parts top to bottom, and what it never
 *   talks about — so the writer is told the page as it is;
 * - every page with rules of its own is tested on saved figures (a fixture under `src/test/fixtures/`), by its key, in
 *   a test of every period its date menu offers;
 * - every page in the eye's screen list has rules of its own, or is named below as still to do. That list may only
 *   shrink: a page gets its own rules and leaves it, never the other way, and a new page comes with its own.
 */

/**
 * Pages in the eye's screen list without rules of their own yet, 3 November 2026: list and setting screens the plan's
 * audit did not count as chart pages (each gets its own rules with its redo), and the families whose pages share one
 * rule set (`googleAnalytics.event:` keeps the Conversions rules, `findings.ts`). Only shrinks.
 */
const STILL_TO_DO = new Set([
  // Kept by the Conversions screens' own rules in `findings.ts`, not `OWN_FINDINGS`.
  "googleAnalytics.conversions", "googleAnalytics.event:", "googleAnalytics.event",
  // Google Analytics' older keys and screens outside the plan's nine.
  "googleAnalytics.channels", "googleAnalytics.channel", "googleAnalytics.landingPage",
  // Search Console's list screens outside the plan's ten.
  "searchConsole.keywords", "searchConsole.pages", "searchConsole.record", "searchConsole.almost", "searchConsole.places",
  "searchConsole.indexing", "searchConsole.demand", "searchConsole.competing", "searchConsole.estimates", "searchConsole.appearance",
  "searchConsole.lowCtr", "searchConsole.trackedKeywords", "searchConsole.trackedPages", "searchConsole.types", "searchConsole.moves",
  // Visibility's screens outside the plan's thirty-one.
  "visibility.keywordsBandsMoved", "visibility.pageRecord", "visibility.yourPages", "visibility.paidKeywords",
  // Insights' screens outside the plan's twenty.
  "insights.trackRecord", "insights.experiments", "insights.findingsSection", "insights.strategyService",
]);
/** The list's size: lower it as pages leave, never raise it. */
const STILL_TO_DO_MOST = 29;

/**
 * Pages that show no one website's own figures, and so carry no eye (Anthony, 2026-11-03: "We dont need the eye on non
 * website data related pages", then "Agree"): the websites lists, settings and health, drafts, the reports list, Clarity's
 * recordings. None may come back into the eye's screen list.
 */
const NO_EYE = [
  "googleAnalytics.websites", "searchConsole.websites", "bing.websites", "clarity.websites", "visibility.websites",
  "googleAnalytics.trackingHealth", "insights.sources", "visibility.draft", "insights.reports", "clarity.recordings",
];

/** The tests of every period: each test under `convex/utils/sees/` that reads saved figures. */
function periodTests(): Array<{ file: string; text: string }> {
  return walkFiles(path.join(repoRoot, "convex/utils/sees"), new Set([".ts"]))
    .filter((file) => file.endsWith(".test.ts"))
    .map((file) => ({ file: relativePath(file), text: readRepoFile(relativePath(file)) }))
    .filter((one) => one.text.includes("readFixture("));
}

describe("every chart page's eye, done only when it is", () => {
  const own = Object.keys(OWN_FINDINGS);

  test("a page with rules of its own has a true screen entry: what it is, its parts, what it never talks about", () => {
    const thin = own.filter((key) => {
      const entry = SEES_SCREENS[key];
      return !entry || !entry.about || (entry.parts ?? []).length === 0 || (entry.never ?? []).length === 0;
    });
    expect(thin, "Give each its own entry in convex/utils/sees/screens.ts, with `parts` top to bottom and `never`.").toEqual([]);
  });

  test("saved figures are read when a test runs, never imported as JSON: the type check would build a type for every value", () => {
    const imported = walkFiles(path.join(repoRoot, "convex"), new Set([".ts"])).concat(walkFiles(path.join(repoRoot, "src"), new Set([".ts", ".tsx"])))
      .map((file) => relativePath(file))
      .filter((file) => file !== "src/ask-hakken-chart-pages-drift.test.ts" && /from "[^"]*test\/fixtures\/[^"]*\.json"/.test(readRepoFile(file)));
    expect(imported, "Use readFixture (src/test/readFixture.ts).").toEqual([]);
  });

  test("a page with rules of its own is tested on saved figures, by its key, in a test of every period", () => {
    const tests = periodTests();
    const untested = own.filter((key) => !tests.some((one) => one.text.includes(`"${key}"`)));
    expect(untested, "Test each on a fixture of saved figures for every period its date menu offers (see pageFindingsPeriods.test.ts).").toEqual([]);
  });

  test("a page that shows no one website's own figures has no eye", () => {
    // The Google Analytics and Visibility ones leave the screen list with their builds (STILL_TO_DO until then).
    const back = NO_EYE.filter((key) => SEES_SCREENS[key] && !STILL_TO_DO.has(key));
    expect(back, "Take its eye off: it shows no one website's figures.").toEqual([]);
  });

  test("every page in the eye's screen list has rules of its own, or is still to do, and that list only shrinks", () => {
    const keys = Object.keys(SEES_SCREENS);
    const missing = keys.filter((key) => !OWN_FINDINGS[key] && !STILL_TO_DO.has(key));
    expect(missing, "Write the page's own rules in convex/utils/sees/own/<section>.ts.").toEqual([]);
    // A page that has its own rules now leaves the list; one no longer in the screen list goes too.
    const stale = [...STILL_TO_DO].filter((key) => OWN_FINDINGS[key] || !SEES_SCREENS[key]);
    expect(stale, "Take these off STILL_TO_DO and lower STILL_TO_DO_MOST.").toEqual([]);
    expect(STILL_TO_DO.size).toBeLessThanOrEqual(STILL_TO_DO_MOST);
  });
});
