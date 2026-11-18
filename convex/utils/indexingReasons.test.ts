import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { INDEXING_REASONS, isIndexed, kindOf, reasonOf, reasonSlug, wordsOfSlug } from "./indexingReasons";

/**
 * The reason list (search-console-indexing-v1-plan-2026-11-18.md, "The reasons"): every reason Google's Page indexing
 * report gives, each with Google's words, its Source, its kind and its plain line, in English and Italian.
 */

const messagesOf = (language: string) => JSON.parse(readFileSync(path.join(process.cwd(), `messages/${language}.json`), "utf8")) as {
  searchConsole: { indexing: { reasons: Record<string, { words?: string; short?: string; means?: string }>; sources: Record<string, string> } };
};

describe("Indexing's reasons", () => {
  test("seventeen reasons, each once, with a Source, a kind, an address and a key of its own", () => {
    expect(INDEXING_REASONS).toHaveLength(17);
    for (const field of ["key", "slug", "words"] as const) expect(new Set(INDEXING_REASONS.map((reason) => reason[field])).size).toBe(17);
    for (const reason of INDEXING_REASONS) {
      expect(["website", "google"]).toContain(reason.source);
      expect(["error", "keptOut", "duplicate", "notChosen", "unknown"]).toContain(reason.kind);
      expect(reason.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  test("the website's thirteen and Google's four, as Google's report sorts them", () => {
    expect(INDEXING_REASONS.filter((reason) => reason.source === "website").map((reason) => reason.words)).toEqual([
      "Server error (5xx)", "Redirect error", "Blocked by robots.txt", "Excluded by ‘noindex’ tag", "Soft 404",
      "Blocked due to unauthorized request (401)", "Not found (404)", "Blocked due to access forbidden (403)", "Blocked due to other 4xx issue",
      "Blocked by page removal tool", "Alternate page with proper canonical tag", "Page with redirect", "Duplicate without user-selected canonical",
    ]);
    expect(INDEXING_REASONS.filter((reason) => reason.source === "google").map((reason) => reason.words)).toEqual([
      "Duplicate, Google chose different canonical than user", "Crawled - currently not indexed", "Discovered - currently not indexed", "URL is unknown to Google",
    ]);
  });

  test.each(["en", "it"])("every reason has Google's term, a short name for the chart and one plain line in %s", (language) => {
    const words = messagesOf(language).searchConsole.indexing;
    for (const reason of INDEXING_REASONS) {
      const own = words.reasons[reason.key];
      expect(own?.words, reason.key).toBeTruthy();
      expect(own?.short, reason.key).toBeTruthy();
      expect(own?.means, reason.key).toMatch(/\.$/);
    }
    expect(Object.keys(words.reasons).sort()).toEqual(INDEXING_REASONS.map((reason) => reason.key).sort());
    expect(Object.keys(words.sources).sort()).toEqual(["google", "website"]);
  });

  test("English names each reason in Google's own words, and the short names stay short", () => {
    const words = messagesOf("en").searchConsole.indexing.reasons;
    for (const reason of INDEXING_REASONS) {
      expect(words[reason.key].words).toBe(reason.words);
      // Ask Hakken's plain line is the screen's.
      expect(words[reason.key].means).toBe(reason.means);
      expect(words[reason.key].short!.length).toBeLessThanOrEqual(14);
    }
  });

  test("Google's answer finds its reason however its quotes, dashes and spaces come", () => {
    expect(reasonOf("Excluded by ‘noindex’ tag")?.key).toBe("noindex");
    expect(reasonOf("Excluded by 'noindex' tag")?.key).toBe("noindex");
    expect(reasonOf("crawled – currently  not indexed")?.key).toBe("crawled");
    expect(reasonOf("URL is unknown to Google")?.kind).toBe("unknown");
    expect(reasonOf("Something Google adds next year")).toBeNull();
    expect(reasonOf(null)).toBeNull();
  });

  test("a reason not on the list keeps its own words, opens a page of its own and reads as Google's choice", () => {
    const words = "Blocked by a new rule";
    expect(reasonSlug(words)).toBe("Blocked%20by%20a%20new%20rule");
    expect(wordsOfSlug(reasonSlug(words))).toBe(words);
    expect(kindOf(words)).toBe("notChosen");
    expect(wordsOfSlug("not-found-404")).toBe("Not found (404)");
    expect(wordsOfSlug("%E0%A4%A")).toBe("%E0%A4%A");
  });

  test("a page is in Google on Google's own verdict, or its words for one", () => {
    expect(isIndexed("PASS", "Submitted and indexed")).toBe(true);
    expect(isIndexed("PARTIAL", null)).toBe(true);
    expect(isIndexed("NEUTRAL", "Indexed, though blocked by robots.txt")).toBe(true);
    expect(isIndexed("VERDICT_UNSPECIFIED", "Indexed, not submitted in sitemap")).toBe(true);
    expect(isIndexed("NEUTRAL", "URL is unknown to Google")).toBe(false);
    expect(isIndexed("FAIL", "Not found (404)")).toBe(false);
  });
});
