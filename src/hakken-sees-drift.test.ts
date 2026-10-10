import path from "path";
import { describe, expect, test } from "vitest";
import { readRepoFile, relativePath, repoRoot, walkFiles } from "./test/driftUtils";

/**
 * Every Discovery screen opens with What Hakken sees (docs/plans/active/
 * discovery-detail-and-hakken-sees-plan.md DS4; Anthony, 2026-10-10: "do we
 * need to add the what hakken sees across the entire discovery section — i
 * think its a good idea — so its not just these screens"): every page in a
 * website's menu, every record and detail screen, the Websites list and
 * Keyword research. Only forms carry none.
 */
const ROOTS = ["src/app/(dashboard)/app/sites", "src/app/(dashboard)/app/keyword-research"];

/** Forms: a box has nothing to say about a field. */
const FORMS = new Set([
  "src/app/(dashboard)/app/keyword-research/lists/[listId]/rename/page.tsx",
  "src/app/(dashboard)/app/keyword-research/lists/new/page.tsx",
]);

/**
 * Screens still without their box while the plan is built, section by section
 * (§9, step 6). This list may shrink, never grow: a screen given its box comes
 * off it in the same change, and a new screen is born with one.
 */
const PENDING = new Set([
  "src/app/(dashboard)/app/sites/[siteId]/assets/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/audit/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/audit/problem/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/all/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/anchors/anchor/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/anchors/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/broken/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/compared/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/domains/domain/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/domains/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/ips/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/new-lost/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/quality/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/backlinks/where/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/competitors/gap/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/competitors/map/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/competitors/organic/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/competitors/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/competitors/rival/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/competitors/suggested/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/google/above/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/google/fan-out/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/google/features/feature/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/google/features/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/google/moves/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/google/questions/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/google/searches/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/keywords/bands/moved/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/keywords/bands/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/keywords/keyword/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/keywords/new-lost/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/keywords/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/keywords/pages/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/keywords/pages/page/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/keywords/structure/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/local/activity/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/local/listings/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/local/maps/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/local/maps/search/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/local/market/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/local/offices/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/local/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/mentions/listed/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/mentions/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/mentions/rivals/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/paid/keywords/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/paid/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/reviews/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/reviews/rivals/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/reviews/say/page.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/your-pages/page.tsx",
  "src/app/(dashboard)/app/sites/page.tsx",
  "src/app/(dashboard)/app/keyword-research/[lookupId]/ai/page.tsx",
  "src/app/(dashboard)/app/keyword-research/[lookupId]/ideas/page.tsx",
  "src/app/(dashboard)/app/keyword-research/[lookupId]/page.tsx",
  "src/app/(dashboard)/app/keyword-research/[lookupId]/results/page.tsx",
  "src/app/(dashboard)/app/keyword-research/competitor/[rivalSiteId]/page.tsx",
  "src/app/(dashboard)/app/keyword-research/lists/[listId]/page.tsx",
  "src/app/(dashboard)/app/keyword-research/page.tsx",
]);

const screens = () => ROOTS.flatMap((root) => walkFiles(path.join(repoRoot, root), new Set([".tsx"])))
  .map(relativePath)
  .filter((file) => file.endsWith("/page.tsx") && !FORMS.has(file));

const carriesBox = (file: string) => /<(SiteSees|HakkenSees|ResearchSees)\b/.test(readRepoFile(file));

describe("What Hakken sees on every Discovery screen", () => {
  test("every screen opens with the box, but those still being given it", () => {
    const missing = screens().filter((file) => !PENDING.has(file) && !carriesBox(file));
    expect(missing, "A Discovery screen without What Hakken sees. Render <SiteSees> under its title (docs/plans/active/discovery-detail-and-hakken-sees-plan.md §6).").toEqual([]);
  });

  test("the list of screens still being given it only shrinks", () => {
    const stale = [...PENDING].filter((file) => !screens().includes(file) || carriesBox(file));
    expect(stale, "These carry the box now (or are gone): take them off PENDING.").toEqual([]);
  });
});
