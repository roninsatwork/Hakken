import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import it from "@/messages/it.json";

/**
 * The menu's names (docs/plans/active/menu-names-plan.md; Anthony,
 * 2026-10-11): the DataForSEO section is Visibility, never Discovery — the
 * supplier cannot be named, and "Discovery" is kept for something else — and
 * the reading section is Reading room, never Insights, which is kept for the
 * AI analyst's findings (phase 7). A new sentence naming the old sections fails
 * here, so the names cannot drift back one sentence at a time. Since phase 7
 * (insights-analyst-plan.md I1), "Insights" is the analyst's section: its menu
 * item, its own pages' words, its Admin pages and its team's roles may say it,
 * and nothing else.
 *
 * The Dashboard's "発見 · Discovery" (Italian "発見 · Scoperta") stays: it
 * translates the product's name, not the section's.
 */
const OLD_NAMES: Record<"en" | "it", RegExp> = {
  en: /\b(Discovery|Insights)\b/,
  it: /\b(Discovery|Scoperta|Insights)\b/,
};
// A source's link to the analyst's own findings names the section it opens (insights-analyst-plan.md §4.4).
const KEPT = new Set(["dashboard.hero.eyebrow", "searchConsole.services.seeInsights"]);
/** The analyst's section, the one place "Insights" belongs (menu-names-plan.md phase 7). */
const INSIGHTS_KEYS = /^(insights\.|sidebar\.insights|admin\.insights\.|admin\.companyDataCollection\.insights\.|admin\.agents\.details\.settings\.sections\.role\.(groups\.insights|roles\.INSIGHTS_))/;
const DISCOVERY: Record<"en" | "it", RegExp> = { en: /\bDiscovery\b/, it: /\b(Discovery|Scoperta)\b/ };

function strings(messages: unknown, prefix = ""): [string, string][] {
  if (typeof messages === "string") return [[prefix, messages]];
  if (!messages || typeof messages !== "object") return [];
  return Object.entries(messages).flatMap(([key, value]) => strings(value, prefix ? `${prefix}.${key}` : key));
}

describe("the menu's names", () => {
  test.each([["en", en], ["it", it]] as const)("no sentence in %s names Discovery or Insights", (language, messages) => {
    const stale = strings(messages)
      .filter(([key, words]) => !KEPT.has(key) && (INSIGHTS_KEYS.test(key) ? DISCOVERY[language].test(words) : OLD_NAMES[language].test(words)))
      .map(([key, words]) => `${key}: ${words}`);
    expect(stale, "Say Visibility (Visibilità) for the DataForSEO section and Reading room (Sala di lettura) for the reading one (menu-names-plan.md).").toEqual([]);
  });

  test("the menu says Visibility and Reading room", () => {
    expect([en.sidebar.sites, en.sidebar.learn, en.learn.menu.label]).toEqual(["Visibility", "Reading room", "Reading room"]);
    expect([it.sidebar.sites, it.sidebar.learn, it.learn.menu.label]).toEqual(["Visibilità", "Sala di lettura", "Sala di lettura"]);
  });
});
