import path from "path";
import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import it from "@/messages/it.json";
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

const screens = () => ROOTS.flatMap((root) => walkFiles(path.join(repoRoot, root), new Set([".tsx"])))
  .map(relativePath)
  .filter((file) => file.endsWith("/page.tsx") && !FORMS.has(file));

const carriesBox = (file: string) => /<(SiteSees|HakkenSees|ResearchSees)\b/.test(readRepoFile(file));

describe("What Hakken sees on every Discovery screen", () => {
  test("every screen opens with the box", () => {
    const missing = screens().filter((file) => !carriesBox(file));
    expect(missing, "A Discovery screen without What Hakken sees. Render <SiteSees> under its title (docs/plans/active/discovery-detail-and-hakken-sees-plan.md §6).").toEqual([]);
  });

  test("every box names a screen whose words exist in English and Italian", () => {
    const unworded = screens().flatMap((file) => [...readRepoFile(file).matchAll(/<(SiteSees|ResearchSees) screen="([^"]+)"/g)].flatMap(([, box, screen]) =>
      [en, it].flatMap((messages) => {
        const words = (box === "SiteSees" ? messages.sites.seen : messages.keywordResearch.seen) as Record<string, unknown>;
        return words[screen] ? [] : [`${file}: ${box} "${screen}"`];
      })));
    expect(unworded, "A box's screen has no words: add them under sites.seen (or keywordResearch.seen) in both languages.").toEqual([]);
  });
});
