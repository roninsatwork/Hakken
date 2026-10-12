import { describe, expect, test } from "vitest";
import { FINDING_SECTIONS, isFindingSection, sectionOf } from "./insightSections";

/** Findings in sections (insights-intelligence-plan.md phase 7): each finding in one section, wherever it's listed. */
describe("a finding's section", () => {
  test("pages competing for one search are Keyword cannibalisation, whoever wrote them", () => {
    expect(sectionOf({ specialist: "search", pattern: "COMPETING_PAGES" })).toBe("cannibalisation");
    expect(sectionOf({ specialist: "market", pattern: "ownSitesCompete" })).toBe("cannibalisation");
  });

  test("the rest by the specialist who wrote them", () => {
    expect(sectionOf({ specialist: "conversion", pattern: "pageLostItsEnquiries" })).toBe("enquiries");
    expect(sectionOf({ specialist: "search", pattern: "almostOnPageOne" })).toBe("search");
    expect(sectionOf({ specialist: "aiVisibility", pattern: "missingFromAnAssistant" })).toBe("ai");
    expect(sectionOf({ specialist: "links", pattern: "linkGap" })).toBe("rivals");
    expect(sectionOf({ specialist: "measurement", pattern: "conversionsNeverFire" })).toBe("technical");
    expect(sectionOf({ specialist: "someone new", pattern: "x" })).toBe("enquiries");
  });

  test("every section is a page of the menu", () => {
    expect(FINDING_SECTIONS.every(isFindingSection)).toBe(true);
    expect(isFindingSection("findings")).toBe(false);
  });
});
