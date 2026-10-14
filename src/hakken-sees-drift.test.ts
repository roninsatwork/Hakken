import path from "path";
import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import it from "@/messages/it.json";
import { readRepoFile, relativePath, repoRoot, walkFiles } from "./test/driftUtils";

/**
 * Every Visibility screen opens with What Hakken sees (docs/plans/active/
 * discovery-detail-and-hakken-sees-plan.md DS4; Anthony, 2026-10-10: "do we
 * need to add the what hakken sees across the entire discovery section — i
 * think its a good idea — so its not just these screens"): every page in a
 * website's menu, every record and detail screen, the Websites list and
 * Keyword research. Only forms carry none.
 *
 * And every Search Console and Google Analytics screen where it makes sense
 * (search-console-volatility-plan.md §8, HS8; Anthony, 2026-10-10: "if a
 * screen in Visibility, Search Console or Analytics is missing a What Hakken
 * sees we need to add it where it makes sense"), so a new screen without one
 * fails here. Where it does not: below, each with its reason.
 */
const ROOTS = [
  "src/app/(dashboard)/app/sites",
  "src/app/(dashboard)/app/keyword-research",
  "src/app/(dashboard)/app/search-console",
  "src/app/(dashboard)/app/analytics",
  // Bing Webmaster (bing-webmaster-plan.md §6): every screen but its connection.
  "src/app/(dashboard)/app/bing-webmaster",
];

/** Screens with no box, and why: a form has nothing to say about a field; the rest say it another way. */
const FORMS = new Set([
  "src/app/(dashboard)/app/keyword-research/lists/[listId]/rename/page.tsx",
  "src/app/(dashboard)/app/keyword-research/lists/new/page.tsx",
  // Search Console's connection: a setting, with nothing in its figures to advise on.
  "src/app/(dashboard)/app/search-console/[siteId]/connection/page.tsx",
  // Bing Webmaster's connection, the same.
  "src/app/(dashboard)/app/bing-webmaster/[siteId]/connection/page.tsx",
  // A keyword's and a page's countries: the record's own tab, under the record's box.
  "src/app/(dashboard)/app/search-console/[siteId]/keywords/keyword/countries/page.tsx",
  "src/app/(dashboard)/app/search-console/[siteId]/pages/page/countries/page.tsx",
  // A landing page's own screen retired (landing-pages-flow-plan.md LF8): it only forwards an old link to the page's own screen.
  "src/app/(dashboard)/app/analytics/[siteId]/landing-pages/page/page.tsx",
  // Landing pages is Funnel now: its old address only forwards there.
  "src/app/(dashboard)/app/analytics/[siteId]/landing-pages/page.tsx",
  // Events is part of Conversions now (ga-conversions-visitors-plan.md CV1): its old address only forwards there.
  "src/app/(dashboard)/app/analytics/[siteId]/events/page.tsx",
]);

const screens = () => ROOTS.flatMap((root) => walkFiles(path.join(repoRoot, root), new Set([".tsx"])))
  .map(relativePath)
  .filter((file) => file.endsWith("/page.tsx") && !FORMS.has(file));

// A record's screen draws its box itself (`SearchConsoleRecordScreen`, `BingRecordScreen`).
const carriesBox = (file: string) => /<(SiteSees|HakkenSees|ResearchSees|SearchConsoleSees|AnalyticsSees|SearchConsoleRecordScreen|BingSees|BingRecordScreen)\b/.test(readRepoFile(file));

describe("What Hakken sees on every Visibility screen", () => {
  test("every screen opens with the box", () => {
    const missing = screens().filter((file) => !carriesBox(file));
    expect(missing, "A Visibility screen without What Hakken sees. Render <SiteSees> under its title (docs/plans/active/discovery-detail-and-hakken-sees-plan.md §6).").toEqual([]);
  });

  test("every box names a screen whose words exist in English and Italian", () => {
    const unworded = screens().flatMap((file) => [...readRepoFile(file).matchAll(/<(SiteSees|ResearchSees|SearchConsoleSees|AnalyticsSees)\s+screen="([^"]+)"/g)].flatMap(([, box, screen]) =>
      [en, it].flatMap((messages) => {
        const words = (box === "SiteSees" ? messages.sites.seen
          : box === "SearchConsoleSees" ? messages.searchConsole.seen
            : box === "AnalyticsSees" ? messages.googleAnalytics.seen
              : messages.keywordResearch.seen) as Record<string, unknown>;
        return words[screen] ? [] : [`${file}: ${box} "${screen}"`];
      })));
    expect(unworded, "A box's screen has no words: add them under sites.seen (or keywordResearch.seen) in both languages.").toEqual([]);
  });
});
