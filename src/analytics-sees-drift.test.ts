import path from "path";
import { existsSync } from "fs";
import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import it from "@/messages/it.json";
import { readRepoFile, relativePath, repoRoot, walkFiles } from "./test/driftUtils";

/**
 * Every Google Analytics screen with figures opens with What Hakken sees
 * (docs/plans/active/google-analytics-plan.md §14; Anthony, 2026-10-10: "Its
 * the system acting as an SEO agent and SEO expert giving advice on the
 * screen … could add them across each of the analytics screens"), the
 * sibling of Discovery's guard (`hakken-sees-drift.test.ts`).
 *
 * The list is explicit, screen by screen as §15 numbers them. The states a
 * screen passes through carry their box in the same file: Not connected yet
 * (12, in `AnalyticsConnectCard`), Choose what counts (14) on Connection,
 * Nothing counted yet (16) on Conversions, a device asked of Google (17) on
 * Landing pages, Needs reconnecting (18) on Overview. Three have nothing to
 * read and carry none: Choose the property (13), The first 90 days coming in
 * (15) and the bell (19).
 *
 * Heroes and attention (3, `[siteId]/heroes/page.tsx`) and A landing page's
 * own screen (7, `[siteId]/landing-pages/page/page.tsx`) are built by another
 * session in parallel: each joins this list, carrying its box, when it lands.
 * Neither is excused.
 */
const ANALYTICS = "src/app/(dashboard)/app/analytics";

const ANALYTICS_SCREENS = [
  `${ANALYTICS}/page.tsx`, // 1 · Your websites
  `${ANALYTICS}/[siteId]/page.tsx`, // 2 · Overview, and 18 · Needs reconnecting
  `${ANALYTICS}/[siteId]/channels/page.tsx`, // 4 · Channels
  `${ANALYTICS}/[siteId]/channels/channel/page.tsx`, // 5 · A channel's own screen
  `${ANALYTICS}/[siteId]/landing-pages/page.tsx`, // 6 · Landing pages, and 17 · a device asked of Google
  `${ANALYTICS}/[siteId]/all-pages/page.tsx`, // 8 · All pages
  `${ANALYTICS}/[siteId]/conversions/page.tsx`, // 9 · Conversions, and 16 · Nothing counted yet
  `${ANALYTICS}/[siteId]/tracking-health/page.tsx`, // 10 · Tracking health
  `${ANALYTICS}/[siteId]/connection/page.tsx`, // 11 · Connection, and 14 · Choose what counts
  `${ANALYTICS}/_components/AnalyticsNotices.tsx`, // 12 · Not connected yet, on every page until connected
];

const seenWords = (messages: typeof en) => (messages.googleAnalytics as unknown as { seen?: Record<string, unknown> }).seen ?? {};

describe("What Hakken sees on every Google Analytics screen", () => {
  test("every screen listed is there, and opens with the box", () => {
    const missing = ANALYTICS_SCREENS.filter((file) => !existsSync(path.join(repoRoot, file)));
    expect(missing, "A listed Analytics screen has moved: list it where it is now.").toEqual([]);
    const boxless = ANALYTICS_SCREENS.filter((file) => !/<AnalyticsSees\b/.test(readRepoFile(file)));
    expect(boxless, "An Analytics screen without What Hakken sees. Render <AnalyticsSees> under its title (google-analytics-plan.md §14).").toEqual([]);
  });

  test("every box names a screen whose words exist in English and Italian, with its links", () => {
    const files = walkFiles(path.join(repoRoot, ANALYTICS), new Set([".tsx"])).map(relativePath).filter((file) => !file.includes(".test."));
    const named = files.flatMap((file) => [...readRepoFile(file).matchAll(/<AnalyticsSees screen="([^"]+)"/g)].map(([, screen]) => ({ file, screen })));
    expect(named.length).toBeGreaterThanOrEqual(ANALYTICS_SCREENS.length);
    const unworded = named.flatMap(({ file, screen }) => [en, it].flatMap((messages) => (seenWords(messages)[screen] ? [] : [`${file}: AnalyticsSees "${screen}"`])));
    expect(unworded, "A box's screen has no words: add them under googleAnalytics.seen in both languages.").toEqual([]);
    for (const messages of [en, it]) expect(seenWords(messages).links, "googleAnalytics.seen.links").toBeTypeOf("object");
  });
});
