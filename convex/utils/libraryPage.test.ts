import { describe, expect, test } from "vitest";
import {
  countWords,
  dayFrom,
  LIBRARY_MAX_BODY_LENGTH,
  LIBRARY_SECTION_LENGTH,
  libraryPageFrom,
  librarySearchTerms,
  librarySections,
  libraryUrlKey,
  publicationFrom,
  titleWithoutSite,
} from "./libraryPage";

/**
 * What the Library makes of a page Firecrawl read
 * (docs/plans/active/content-library-plan.md, L4, L11): the details its meta
 * tags give, blank where they say nothing, and the sections Ask Hakken reads.
 */
describe("a page's details", () => {
  test("words are counted as words, never Markdown's marks or a link's address", () => {
    expect(countWords("## Best practices\n\n- Let [Google](https://google.com/a-b-c) crawl **the page**.")).toBe(7);
    expect(countWords("")).toBe(0);
  });

  test("the same page however it was pasted is one address", () => {
    expect(libraryUrlKey(" https://Example.com/blog/post/#comments ")).toBe("https://example.com/blog/post");
    expect(libraryUrlKey("https://example.com/")).toBe("https://example.com/");
    expect(libraryUrlKey("https://example.com/search?q=1")).toBe("https://example.com/search?q=1");
  });

  test("a date is a calendar day, or nothing when it is not one", () => {
    expect(dayFrom("2026-09-18T23:30:00+01:00")).toBe("2026-09-18");
    expect(dayFrom("18 September 2026")).toBe("2026-09-18");
    expect(dayFrom("yesterday")).toBeUndefined();
    expect(dayFrom("0001-01-01")).toBeUndefined();
    expect(dayFrom(undefined)).toBeUndefined();
  });

  test("the publication is the website's own name, else its address", () => {
    expect(publicationFrom({ ogSiteName: ["Search Engine Land", "SEL"] }, "https://searchengineland.com/x")).toBe("Search Engine Land");
    expect(publicationFrom({}, "https://www.ahrefs.com/blog/link-building")).toBe("ahrefs.com");
  });

  test("a title loses its website's name, and only that", () => {
    expect(titleWithoutSite("AI features and your website | Google Search Central", "Google Search Central")).toBe("AI features and your website");
    expect(titleWithoutSite("Ranking - a guide - Ahrefs", "ahrefs")).toBe("Ranking - a guide");
    expect(titleWithoutSite("Before | after", "Somewhere else")).toBe("Before | after");
  });

  test("a page's meta tags fill the form, and what they do not say stays blank", () => {
    const page = libraryPageFrom("# Heading\n\nSome words here.", {
      ogTitle: "Organic CTR study - Advanced Web Ranking",
      ogSiteName: "Advanced Web Ranking",
      "article:author": "https://facebook.com/someone",
      "article:published_time": "2026-08-05T09:00:00Z",
      "og:locale": "en_GB",
      description: "How often people click.",
    }, "https://www.advancedwebranking.com/seo/organic-ctr");
    expect(page).toEqual({
      title: "Organic CTR study",
      publication: "Advanced Web Ranking",
      author: undefined,
      publishedOn: "2026-08-05",
      updatedOn: undefined,
      description: "How often people click.",
      language: "en-GB",
      body: "# Heading\n\nSome words here.",
      words: 4,
      cut: false,
    });
  });

  test("a page longer than the Library keeps is cut there, and says so", () => {
    const page = libraryPageFrom("word ".repeat(30_000), {}, "https://example.com/long");
    expect(page.body.length).toBe(LIBRARY_MAX_BODY_LENGTH);
    expect(page.cut).toBe(true);
  });
});

describe("Ask Hakken's sections", () => {
  test("an article is cut at its headings, each section starting with its own", () => {
    expect(librarySections("The title", "Opening words.\n\n## First part\n\nIts words.\n\n### Deeper\n\nMore words.")).toEqual([
      { heading: "The title", text: "The title\nOpening words." },
      { heading: "First part", text: "First part\nIts words." },
      { heading: "Deeper", text: "Deeper\nMore words." },
    ]);
  });

  test("a long part is cut at its paragraphs, no section longer than the limit", () => {
    const paragraph = "sentence ".repeat(200).trim();
    const sections = librarySections("Long", Array.from({ length: 6 }, () => paragraph).join("\n\n"));
    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections) {
      expect(section.text.length).toBeLessThanOrEqual(LIBRARY_SECTION_LENGTH);
      expect(section.text.startsWith("Long\n")).toBe(true);
    }
  });

  test("a question is searched by its distinctive words, at most sixteen", () => {
    expect(librarySearchTerms("What are the best practices for structured data, and why?")).toEqual(["best", "practices", "structured", "data"]);
    expect(librarySearchTerms(Array.from({ length: 30 }, (_, index) => `word${index}`).join(" "))).toHaveLength(16);
    expect(librarySearchTerms("Is it ok?")).toEqual([]);
  });
});
