import { describe, expect, test } from "vitest";
import { competingGroupValidator } from "./insightCompeting";
import { decisionValidator, pageDecisionsFrom, type DecisionInput, type PageDecision } from "./insightDecisions";
import { readingOf, stillDecided } from "./insightDecided";
import { PAGE_ANSWER, applyPageAnswer, carryPages, pageDecisionsForAssistant, pageReading, pagesToHand } from "./insightPageAgent";

/**
 * The standard every Insights judgement is kept to (insightDecided.ts) and
 * the Page decisions specialist (insightPageAgent.ts): who decided each page
 * and why, last week's verdicts kept where nothing changed, and the guards on
 * what it may decide.
 */

const input = (path: string, figures: Partial<DecisionInput> = {}): DecisionInput => ({
  path, kind: "Service", type: "SERVICE", visits: 40, enquiries: 2, views: 300, shown: 900, clicks: 20, domains: 0, flags: [], inbound: 3, status: 200, ...figures,
});
const decided = (inputs: DecisionInput[], extra: Partial<Parameters<typeof pageDecisionsFrom>[1]> = {}) =>
  pageDecisionsFrom(inputs, { plan: new Map(), competing: new Map(), ...extra }).map((row) => ({ ...row, signature: pageReading(row), decidedBy: row.decidedBy ?? "RULE" as const }));

describe("the standard every Insights judgement is kept to", () => {
  test("each judgement kept says who decided it, when, why and on what reading", () => {
    // A guard: a judgement saved without these can't say who decided it, nor keep last week's decision.
    for (const fields of [decisionValidator.fields, competingGroupValidator.fields]) {
      expect(Object.keys(fields)).toEqual(expect.arrayContaining(["decidedBy", "decidedWeek", "signature"]));
    }
    expect(Object.keys(decisionValidator.fields)).toContain("why");
  });

  test("the same reading twice is the same; last week's stands only if its agent decided it on that reading", () => {
    expect(readingOf(["MERGE", "/a/", true])).toBe(readingOf(["MERGE", "/a/", true]));
    expect(readingOf(["MERGE", "/a/", true])).not.toBe(readingOf(["MERGE", "/b/", true]));
    expect(stillDecided({ signature: "x" }, { decidedBy: "AGENT", signature: "x" })).toBe(true);
    expect(stillDecided({ signature: "x" }, { decidedBy: "RULE", signature: "x" })).toBe(false);
    expect(stillDecided({ signature: "y" }, { decidedBy: "AGENT", signature: "x" })).toBe(false);
  });
});

describe("Page decisions read what else decided a page", () => {
  test("an article Keyword cannibalisation keeps links to its owner, with that specialist's reason; a review asking for a change is to improve", () => {
    const rows = decided([input("/hub/guide/", { type: "INFORMATIONAL" }), input("/web-design-london/")], {
      competing: new Map([["/hub/guide/", { decision: "LINK" as const, owner: "/web-design-london/", why: "It guides readers to the London page.", decidedBy: "AGENT" as const }]]),
      reviews: new Map([["/web-design-london/", "ADD_PROOF"]]),
    });
    expect(rows.find((row) => row.path === "/hub/guide/")).toMatchObject({ verdict: "IMPROVE", reason: "COMPETING_LINK", into: "/web-design-london/", why: "It guides readers to the London page.", decidedBy: "AGENT" });
    expect(rows.find((row) => row.path === "/web-design-london/")).toMatchObject({ verdict: "IMPROVE", reason: "REVIEW" });
  });
});

describe("the Page decisions specialist", () => {
  const rows = () => decided([
    input("/old-offer/", { type: "NOT_SORTED", visits: 0, enquiries: 0, views: 0, shown: 0, clicks: 0, domains: 0 }),
    input("/linked-old/", { type: "NOT_SORTED", visits: 0, enquiries: 0, views: 0, shown: 0, clicks: 0, domains: 4 }),
    input("/thin-service/", { flags: ["low_character_count"] }),
    input("/merged/", { visits: 5 }),
    input("/working/"),
  ], { competing: new Map([["/merged/", { decision: "MERGE" as const, owner: "/working/" }]]) });

  test("is handed the pages the rule doesn't simply keep and Keyword cannibalisation hasn't decided", () => {
    expect(pagesToHand(rows()).map((row) => row.path).sort()).toEqual(["/linked-old/", "/old-offer/", "/thin-service/"]);
    expect(PAGE_ANSWER).toMatch(/Never remove a page other websites link to/);
  });

  test("its answer stands within the guards, each with its sentence; what breaks one leaves the rule's verdict", () => {
    const all = rows();
    const handed = pagesToHand(all);
    const applied = applyPageAnswer(handed, { pages: [
      { path: "/old-offer/", verdict: "REDIRECT", into: "/working/", why: "Its old offer lives on at the working page." },
      // Linked from four websites: removing it would lose them.
      { path: "/linked-old/", verdict: "REMOVE", into: null, why: "Nobody needs it." },
      // A service page is never removed; and a merge must name a page of the website.
      { path: "/thin-service/", verdict: "MERGE", into: "/elsewhere/", why: "Fold it in." },
    ] }, new Set(all.map((row) => row.path)), "2026-10-12");
    expect(applied).toEqual({ changed: 1, kept: 0, refused: 2 });
    expect(handed.find((row) => row.path === "/old-offer/")).toMatchObject({ verdict: "REDIRECT", reason: "SPECIALIST", into: "/working/", why: "Its old offer lives on at the working page.", decidedBy: "AGENT", decidedWeek: "2026-10-12" });
    expect(handed.find((row) => row.path === "/linked-old/")).toMatchObject({ verdict: "REDIRECT", decidedBy: "RULE" });
    expect(handed.find((row) => row.path === "/thin-service/")).toMatchObject({ verdict: "IMPROVE", decidedBy: "RULE" });
  });

  test("next week, a page the rule reads just the same keeps its verdict; one read anew goes back to the rule", () => {
    const last = rows();
    applyPageAnswer(pagesToHand(last), { pages: [{ path: "/old-offer/", verdict: "REDIRECT", into: "/working/", why: "Its old offer lives on at the working page." }] }, new Set(last.map((row) => row.path)), "2026-10-05");
    const before = new Map<string, PageDecision>(last.map((row) => [row.path, row]));
    const now = rows();
    expect(carryPages(now, before)).toBe(1);
    expect(now.find((row) => row.path === "/old-offer/")).toMatchObject({ verdict: "REDIRECT", decidedBy: "AGENT", decidedWeek: "2026-10-05" });
    expect(pagesToHand(now).map((row) => row.path)).not.toContain("/old-offer/");
  });
});

describe("Ask Hakken's read of Page decisions", () => {
  test("every page to act on, as kept, with why and who decided; a page not listed is kept", () => {
    const rows = decided([
      input("/old-offer/", { type: "NOT_SORTED", visits: 0, enquiries: 0, views: 0, shown: 0, clicks: 0, domains: 0 }),
      input("/merged/", { visits: 5 }),
      input("/working/"),
    ], { competing: new Map([["/merged/", { decision: "MERGE" as const, owner: "/working/", why: "It lives off the working page's searches." }]]) });
    const read = pageDecisionsForAssistant(rows);
    expect(read).toMatchObject({ pages: 2, kept: 1, link: "/app/insights/page-plan" });
    expect(read.rule).toMatch(/never advise removing, merging or redirecting a page this doesn't say to/);
    expect(read.toActOn).toEqual(expect.arrayContaining([
      { page: "/merged/", do: "merge", into: "/working/", why: "It lives off the working page's searches.", decided_by: "the Keyword cannibalisation specialist" },
      { page: "/old-offer/", do: "remove", why: "nobody visits it, Google doesn't show it and no website links to it: remove it", decided_by: "Hakken's rule" },
    ]));
  });
});

