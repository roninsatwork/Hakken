import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import it from "@/messages/it.json";

/**
 * The menu's names (docs/plans/active/menu-names-plan.md; Anthony,
 * 2026-10-11): the DataForSEO section is Visibility, never Discovery — the
 * supplier cannot be named, and "Discovery" is kept for something else — and
 * the reading section is Reading room, never Insights, which is kept for the
 * AI analyst's findings (phase 7). A new sentence naming the old sections fails
 * here, so the names cannot drift back one sentence at a time.
 *
 * The Dashboard's "発見 · Discovery" (Italian "発見 · Scoperta") stays: it
 * translates the product's name, not the section's.
 */
const OLD_NAMES: Record<"en" | "it", RegExp> = {
  en: /\b(Discovery|Insights)\b/,
  it: /\b(Discovery|Scoperta|Insights)\b/,
};
const KEPT = new Set(["dashboard.hero.eyebrow"]);

function strings(messages: unknown, prefix = ""): [string, string][] {
  if (typeof messages === "string") return [[prefix, messages]];
  if (!messages || typeof messages !== "object") return [];
  return Object.entries(messages).flatMap(([key, value]) => strings(value, prefix ? `${prefix}.${key}` : key));
}

describe("the menu's names", () => {
  test.each([["en", en], ["it", it]] as const)("no sentence in %s names Discovery or Insights", (language, messages) => {
    const stale = strings(messages)
      .filter(([key, words]) => !KEPT.has(key) && OLD_NAMES[language].test(words))
      .map(([key, words]) => `${key}: ${words}`);
    expect(stale, "Say Visibility (Visibilità) for the DataForSEO section and Reading room (Sala di lettura) for the reading one (menu-names-plan.md).").toEqual([]);
  });

  test("the menu says Visibility and Reading room", () => {
    expect([en.sidebar.sites, en.sidebar.learn, en.learn.menu.label]).toEqual(["Visibility", "Reading room", "Reading room"]);
    expect([it.sidebar.sites, it.sidebar.learn, it.learn.menu.label]).toEqual(["Visibilità", "Sala di lettura", "Sala di lettura"]);
  });
});
