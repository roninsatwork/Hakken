import { describe, expect, it } from "vitest";

import { pagesFor, readSectionPath, sectionHref, switchHref } from "./websitesSection";

/**
 * The Websites section's one map of its pages (docs/plans/active/
 * websites-section-menu-plan.md): where each lives for All websites and for
 * one website, which page an address is, and where choosing a website goes.
 */
const base = "/admin/companies/company_1/websites";
const own = { siteId: "hold_1", relationship: "OWNED" as const };
const rival = { siteId: "hold_2", relationship: "TRACKED" as const };

describe("the Websites section's pages", () => {
  it("keeps every address that already existed, for both scopes", () => {
    expect(sectionHref("company_1", "websites", null)).toBe(base);
    expect(sectionHref("company_1", "questions", null)).toBe(`${base}/ai-searches`);
    expect(sectionHref("company_1", "searches", null)).toBe(`${base}/ai-searches/searches`);
    expect(sectionHref("company_1", "fanOut", null)).toBe(`${base}/ai-searches/fan-out`);
    // Schedule and limits became two screens on 2026-09-28; the old addresses redirect to Schedules.
    expect(sectionHref("company_1", "schedules", null)).toBe(`${base}/schedules`);
    expect(sectionHref("company_1", "limits", null)).toBe(`${base}/limits`);
    expect(sectionHref("company_1", "market", null)).toBe(`${base}/market`);
    expect(sectionHref("company_1", "runs", null)).toBe(`${base}/runs`);

    expect(sectionHref("company_1", "todo", own)).toBe(`${base}/site/hold_1`);
    expect(sectionHref("company_1", "searches", own)).toBe(`${base}/site/hold_1/searches`);
    expect(sectionHref("company_1", "rankings", own)).toBe(`${base}/site/hold_1/keywords`);
    expect(sectionHref("company_1", "answers", own)).toBe(`${base}/site/hold_1/citations`);
    expect(sectionHref("company_1", "names", own)).toBe(`${base}/site/hold_1/profile`);
    expect(sectionHref("company_1", "schedules", own)).toBe(`${base}/site/hold_1/schedules`);
    expect(sectionHref("company_1", "limits", own)).toBe(`${base}/site/hold_1/limits`);
    expect(sectionHref("company_1", "market", own)).toBe(`${base}/site/hold_1/market`);
    expect(sectionHref("company_1", "market", rival)).toBe(`${base}/site/hold_2/market`);
  });

  it("keeps the company's pages the company's, whichever website is chosen", () => {
    expect(sectionHref("company_1", "runs", own)).toBe(`${base}/runs`);
    expect(sectionHref("company_1", "websites", own)).toBe(base);
  });

  it("offers a competitor only what a competitor has", () => {
    expect(pagesFor("TRACKED").map((page) => page.id)).toEqual(["websites", "names", "market", "rankings", "schedules", "limits", "runs"]);
    expect(pagesFor("OWNED")).toHaveLength(13);
    expect(pagesFor(null)).toHaveLength(13);
  });

  it("reads which page an address is, and for which website", () => {
    expect(readSectionPath("company_1", base)).toEqual({ page: "websites", siteId: null });
    expect(readSectionPath("company_1", `${base}/ai-searches/fan-out`)).toEqual({ page: "fanOut", siteId: null });
    expect(readSectionPath("company_1", `${base}/runs/cycle_1`)).toEqual({ page: "runs", siteId: null });
    expect(readSectionPath("company_1", `${base}/site/hold_1`)).toEqual({ page: "todo", siteId: "hold_1" });
    expect(readSectionPath("company_1", `${base}/site/hold_1/fan-out`)).toEqual({ page: "fanOut", siteId: "hold_1" });
    expect(readSectionPath("company_1", `${base}/site/hold_1/schedules`)).toEqual({ page: "schedules", siteId: "hold_1" });
    expect(readSectionPath("company_1", `${base}/site/hold_1/limits`)).toEqual({ page: "limits", siteId: "hold_1" });
    expect(readSectionPath("company_1", `${base}/limits`)).toEqual({ page: "limits", siteId: null });
    expect(readSectionPath("company_1", `${base}/market`)).toEqual({ page: "market", siteId: null });
    expect(readSectionPath("company_1", `${base}/site/hold_2/market`)).toEqual({ page: "market", siteId: "hold_2" });
    // One prompt's fan-out queries is a page of Your prompts, at either scope.
    expect(readSectionPath("company_1", `${base}/ai-searches/prompts/question_1`)).toEqual({ page: "questions", siteId: null });
    expect(readSectionPath("company_1", `${base}/site/hold_1/questions/question_1`)).toEqual({ page: "questions", siteId: "hold_1" });
  });

  it("keeps the page open when choosing a website that has it, and opens where a website of that kind starts otherwise", () => {
    expect(switchHref("company_1", "questions", own)).toBe(`${base}/site/hold_1/questions`);
    expect(switchHref("company_1", "questions", null)).toBe(`${base}/ai-searches`);
    // A competitor has no questions of its own: it opens on its rankings.
    expect(switchHref("company_1", "questions", rival)).toBe(`${base}/site/hold_2/keywords`);
    expect(switchHref("company_1", "limits", rival)).toBe(`${base}/site/hold_2/limits`);
    // The list itself belongs to no website: choosing one opens its to-do list.
    expect(switchHref("company_1", "websites", own)).toBe(`${base}/site/hold_1`);
  });
});
