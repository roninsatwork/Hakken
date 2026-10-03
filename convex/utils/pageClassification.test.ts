import { describe, expect, test } from "vitest";
import { classifierFor, normalisePage, type ClassificationLine } from "./pageClassification";

/**
 * The one rule for which classification a page belongs to
 * (page-groups-plan.md): by hand first, then the more exact line, else Not
 * sorted — tried on ronins.co.uk's own addresses.
 */
const lines: ClassificationLine[] = [
  { classificationId: "content", kind: "STARTS_WITH", value: "/hub/" },
  { classificationId: "guides", kind: "STARTS_WITH", value: "/hub/guides/" },
  { classificationId: "ai", kind: "CONTAINS", value: "ai-" },
  { classificationId: "company", kind: "EXACT", value: "/" },
  { classificationId: "journal", kind: "SITEMAP_FILE", value: "post-sitemap.xml" },
];

describe("which classification a page belongs to", () => {
  test("the more exact line wins, whatever order the lines were added in", () => {
    const classify = classifierFor(lines, []);
    expect(classify("/hub/guides/ai-seo/").classificationId).toBe("guides");
    expect(classify("/hub/bad-websites/").classificationId).toBe("content");
    expect(classify("/hub/ai-agency-guide/").classificationId).toBe("content");
    expect(classify("/ai-agency/").classificationId).toBe("ai");
    expect(classify("/").classificationId).toBe("company");
  });

  test("a sitemap file catches only what no address line does", () => {
    const classify = classifierFor(lines, []);
    expect(classify("/our-new-office-in-guildford/", "post-sitemap.xml")).toMatchObject({ classificationId: "journal", how: "BY_LINE" });
    expect(classify("/hub/brand-audit/", "post-sitemap.xml").classificationId).toBe("content");
  });

  test("a page set by hand keeps it, and a page taken out is Not sorted", () => {
    const classify = classifierFor(lines, [
      { page: "https://www.ronins.co.uk/ai-agency/", classificationId: "company" },
      { page: "/hub/bad-websites/", classificationId: null },
    ]);
    expect(classify("/ai-agency/")).toEqual({ classificationId: "company", how: "BY_HAND" });
    expect(classify("/hub/bad-websites/")).toEqual({ classificationId: null, how: "TAKEN_OUT" });
  });

  test("a page nothing catches is Not sorted", () => {
    expect(classifierFor(lines, [])("/author/anthony/")).toEqual({ classificationId: null, how: "NONE" });
  });

  test("addresses are compared as lower-case paths, jump links and queries left off", () => {
    expect(normalisePage("https://www.ronins.co.uk/Hub/Kapferer/#prism?x=1")).toBe("/hub/kapferer/");
    expect(normalisePage("hub/x")).toBe("/hub/x");
    expect(classifierFor(lines, [])("https://WWW.ronins.co.uk/HUB/x/#part").classificationId).toBe("content");
  });
});
