import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { relativePath, repoRoot, walkFiles } from "@/src/test/driftUtils";
import { SITE_SHARED_KEYS } from "@/src/app/(dashboard)/app/sites/_components/useSiteParam";
import { CALENDAR_PERIOD_KEY } from "@/src/app/(dashboard)/app/sites/_components/useCalendarPeriod";
import { DATED_SEGMENTS } from "@/src/app/(dashboard)/app/sites/_components/sitePages";

/**
 * Every date menu in the user frontend offers the same seven calendar periods
 * (docs/plans/active/calendar-periods-plan.md; Anthony, 2026-10-20): This week
 * to This year, from one list (`convex/utils/calendarPeriods.ts`), never a list
 * of days of its own — no "7, 30, 90" and no custom range.
 *
 * The sections move one phase at a time, and none is ever half moved: a
 * section keeps its old menu until its data is ready. The files below still
 * hold an old menu; each leaves the list in the phase that moves it, and the
 * list may only shrink.
 */
const SCREENS = ["src/app/(dashboard)/app", "src/ui/components/governance"];

/** An old menu: a list of days opening 7, 30, 90, or the custom-range dropdown. */
const OLD_MENU = /\[\s*"?7"?\s*,\s*"?30"?\s*,\s*"?90"?|TimeframeDropdown/;

const NOT_YET_MOVED = new Set([
  "src/app/(dashboard)/app/analytics/_components/useAnalytics.ts",
  "src/app/(dashboard)/app/bing-webmaster/_components/useBing.ts",
  "src/app/(dashboard)/app/settings/page.tsx",
  "src/ui/components/governance/EvidencePackPanel.tsx",
  "src/ui/components/governance/GovernanceActivity.tsx",
]);

const SOURCE = new Set([".ts", ".tsx"]);

function screenFiles(): string[] {
  return SCREENS.flatMap((dir) => walkFiles(path.join(repoRoot, dir), SOURCE))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .map(relativePath);
}

describe("the date menus", () => {
  test("no screen offers a list of days of its own, outside the sections not yet moved", () => {
    const old = screenFiles().filter((file) => OLD_MENU.test(fs.readFileSync(path.join(repoRoot, file), "utf8")));
    expect(old.filter((file) => !NOT_YET_MOVED.has(file)), "Offer the seven calendar periods (useCalendarPeriod), not days of your own").toEqual([]);
  });

  test("every section still listed as not moved still holds its old menu (drop it from the list once moved)", () => {
    const stale = [...NOT_YET_MOVED].filter((file) => !OLD_MENU.test(fs.readFileSync(path.join(repoRoot, file), "utf8")));
    expect(stale).toEqual([]);
  });

  test("the side menu and the site switcher carry the chosen period from page to page", () => {
    expect(SITE_SHARED_KEYS).toContain(CALENDAR_PERIOD_KEY);
  });

  test("a website's screens draw the date menu exactly where they read it (item 11.1)", () => {
    const base = "src/app/(dashboard)/app/sites/[siteId]";
    const reading = walkFiles(path.join(repoRoot, base), SOURCE)
      .filter((file) => file.endsWith("page.tsx") && /\buseSiteRange\(\)/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(path.join(repoRoot, base), path.dirname(file)).split(path.sep).join("/"))
      .sort();
    expect(reading, "Add the screen to DATED_SEGMENTS (sitePages.ts), or stop it reading the dates").toEqual([...DATED_SEGMENTS].sort());
  });
});
