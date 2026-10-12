import { describe, expect, test } from "vitest";
import { decide, pageDecisionsFrom, pagesToCreate, type Decided, type DecisionInput } from "./insightDecisions";

/**
 * Page decisions (insights-intelligence-plan.md phase 4): every page's
 * verdict from what Hakken holds, a page other websites link to never removed
 * without a redirect, and the pages to create.
 */

const page = (path: string, figures: Partial<DecisionInput> = {}): DecisionInput => ({
  path, kind: "Content hub", type: "INFORMATIONAL", visits: 0, enquiries: 0, views: 0, shown: 0, clicks: 0, domains: 0, flags: [], inbound: 2, status: 200, ...figures,
});
const none: Decided = { plan: new Map(), competing: new Map() };

describe("each page's decision", () => {
  test("a broken page is redirected when anything links to it, and taken out when nothing does", () => {
    expect(decide(page("/old/", { status: 404, domains: 3 }), none)).toMatchObject({ verdict: "REDIRECT", reason: "BROKEN_LINKED" });
    expect(decide(page("/old/", { flags: ["is_4xx_code"], domains: 0, inbound: 0 }), none)).toMatchObject({ verdict: "REMOVE", reason: "BROKEN" });
  });

  test("a page nobody visits and Google doesn't show is removed, redirected if other websites link to it, kept if a website needs it", () => {
    expect(decide(page("/hub/old-news/"), none)).toMatchObject({ verdict: "REMOVE", reason: "UNUSED" });
    expect(decide(page("/hub/old-news/", { domains: 4 }), none)).toMatchObject({ verdict: "REDIRECT", reason: "UNUSED_LINKED" });
    expect(decide(page("/privacy/", { type: "LEGAL" }), none)).toMatchObject({ verdict: "KEEP", reason: "QUIET" });
    expect(decide(page("/author/anthony/page/3/"), none)).toMatchObject({ verdict: "KEEP", reason: "QUIET" });
    // Without Analytics there is no saying nobody visits it.
    expect(decide(page("/hub/old-news/", { views: null }), none)).toMatchObject({ verdict: "KEEP" });
  });

  test("Keyword cannibalisation's merge and the Page plan's actions come before the site audit", () => {
    const decided: Decided = {
      plan: new Map([["/ai-agency/", "REBUILD"]]),
      competing: new Map([["/brand-design-agency/", { decision: "MERGE", owner: "/brand-identity-agency/" }], ["/ux-consultancy/", { decision: "DIFFERENTIATE", owner: "/ux-design-agency/" }]]),
    };
    expect(decide(page("/brand-design-agency/", { type: "SERVICE", visits: 9, flags: ["low_content_rate"] }), decided)).toEqual({ verdict: "MERGE", reason: "COMPETING_MERGE", into: "/brand-identity-agency/" });
    expect(decide(page("/ai-agency/", { type: "SERVICE", visits: 700 }), decided)).toMatchObject({ verdict: "IMPROVE", reason: "REBUILD" });
    expect(decide(page("/ux-consultancy/", { type: "SERVICE", visits: 28 }), decided)).toEqual({ verdict: "IMPROVE", reason: "COMPETING", into: "/ux-design-agency/" });
  });

  test("the site audit's flags, then keep", () => {
    expect(decide(page("/hub/a/", { visits: 5, flags: ["duplicate_content"] }), none)).toMatchObject({ verdict: "IMPROVE", reason: "DUPLICATE" });
    expect(decide(page("/hub/a/", { visits: 5, flags: ["low_character_count"] }), none)).toMatchObject({ verdict: "IMPROVE", reason: "THIN" });
    // The text-to-code ratio flags nearly every page; it isn't thin content.
    expect(decide(page("/hub/a/", { visits: 5, flags: ["low_content_rate"] }), none)).toMatchObject({ verdict: "KEEP" });
    expect(decide(page("/hub/a/", { visits: 5, flags: ["is_orphan_page"] }), none)).toMatchObject({ verdict: "IMPROVE", reason: "ORPHAN" });
    expect(decide(page("/hub/a/", { visits: 5 }), none)).toMatchObject({ verdict: "KEEP", reason: "WORKING" });
  });

  test("every page decided, what to act on first and the most visited first within each", () => {
    const decisions = pageDecisionsFrom([page("/a/", { visits: 5 }), page("/b/"), page("/c/", { visits: 50, flags: ["is_orphan_page", "is_redirect"] })], none);
    expect(decisions.map((row) => [row.path, row.verdict])).toEqual([["/c/", "IMPROVE"], ["/b/", "REMOVE"], ["/a/", "KEEP"]]);
    // Only the flags a decision reads are kept with it.
    expect(decisions[0].flags).toEqual(["is_orphan_page"]);
  });
});

describe("pages to create", () => {
  test("searches two rivals win and the website has no page for, then buyers' questions it doesn't rank for", () => {
    const gap = [
      { keyword: "brand strategy agency", volume: 390, rivals: [{ position: 4 }, { position: 9 }] },
      { keyword: "branding strategy agency", volume: 390, rivals: [{ position: 6 }, { position: 7 }] },
      { keyword: "one rival only", volume: 900, rivals: [{ position: 2 }] },
      { keyword: "too rare", volume: 20, rivals: [{ position: 3 }, { position: 5 }] },
    ];
    const questions = [
      { builtFrom: "ai agency", kind: "SEARCH", volume: 1_000 },
      { builtFrom: "rebranding cost", kind: "SEARCH", volume: 170 },
      { builtFrom: "your name", kind: "NAME", volume: null },
    ];
    expect(pagesToCreate(gap, questions, new Set(["ai agency"]))).toEqual([
      { search: "brand strategy agency", from: "GAP", volume: 390, rivals: 2, best: 4 },
      { search: "rebranding cost", from: "QUESTION", volume: 170, rivals: 0, best: null },
    ]);
  });
});
