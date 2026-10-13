import { describe, expect, test } from "vitest";
import { competingGroups, type CompetingPair, type KeptGroup, type PageFigures } from "./insightCompeting";
import { SEARCHES_EXPLAINED, agentInputOf, applyAnswer, carryOver, signatureOf } from "./insightCompetingAgent";
import { PICK_MAX_AGE_MS, applyChosen, offeredReading, ownerQuestions, pickedPages, picksDue } from "./insightCompetingJudge";

/**
 * Jev picks each search's page (insightCompetingJudge.ts): what the
 * "Which page answers this search?" Decision is asked of each search, its
 * sure answers put on the group, and the specialist explaining them rather
 * than picking a page itself.
 */

const pair = (search: string, path: string, impressions: number): CompetingPair => ({ search, page: `https://www.ronins.co.uk${path}`, clicks: 0, impressions });
const FIGURES: Record<string, PageFigures> = {
  "/app-developers-london/": { kind: "Service", type: "SERVICE", visits: 30, enquiries: 4, recent: 1, recentBefore: null, shownAll: 56_602 },
  "/mobile-app-developers/": { kind: "Service", type: "SERVICE", visits: 36, enquiries: 0, recent: 0, recentBefore: null, shownAll: 53_039 },
  "/app-design-agency/": { kind: "Service", type: "SERVICE", visits: 4, enquiries: 0, recent: 0, recentBefore: null, shownAll: 2_000 },
};
const PAIRS = [
  pair("mobile app developers", "/mobile-app-developers/", 2_391), pair("mobile app developers", "/app-developers-london/", 600), pair("mobile app developers", "/app-design-agency/", 400),
  pair("app developers", "/app-developers-london/", 2_989), pair("app developers", "/mobile-app-developers/", 2_200), pair("app developers", "/app-design-agency/", 400),
  pair("app developers london", "/app-developers-london/", 1_617), pair("app developers london", "/mobile-app-developers/", 289), pair("app developers london", "/app-design-agency/", 300),
  pair("app makers", "/app-developers-london/", 700), pair("app makers", "/mobile-app-developers/", 500), pair("app makers", "/app-design-agency/", 300),
  pair("app companies", "/app-developers-london/", 700), pair("app companies", "/mobile-app-developers/", 500), pair("app companies", "/app-design-agency/", 300),
];
const group = (): KeptGroup => {
  const [made] = competingGroups({
    pairs: PAIRS, brandSearches: new Set(), brandWords: [], searchOf: (search) => ({ position: 20, volume: search === "mobile app developers" ? 4_400 : 500 }),
    pageOf: (path) => FIGURES[path], clickRates: { top3: 0.1 }, websiteRate: 0.04, months: 3, places: { homeIso: "GB", offices: [] },
  });
  return { ...made, decidedBy: "RULE", signature: signatureOf(made) };
};
const searchOf = (held: KeptGroup, name: string) => held.searches.find((search) => search.search === name)!;

describe("the decision model picking each search's page", () => {
  test("is asked about each search with the pages Google showed for it, the most shown first, and the rule's page as its fallback", () => {
    const held = group();
    const asked = ownerQuestions(held, 12).find((question) => question.search === "app makers")!;
    expect(asked.offered.map((page) => page.path)).toEqual(["/app-developers-london/", "/mobile-app-developers/", "/app-design-agency/"]);
    expect(asked.offered[asked.rule].path).toBe(searchOf(held, "app makers").owner);
    expect(ownerQuestions(held, 2).every((question) => question.offered.length === 2)).toBe(true);
  });

  test("its sure answers become each search's page, said to be its; a page Google didn't show for it is refused", () => {
    const held = group();
    const applied = applyChosen(held, new Map([["app makers", "/app-design-agency/"], ["app companies", "/nowhere/"]]), 0.04);
    expect(applied).toEqual({ chosen: 1, changed: 1 });
    expect(searchOf(held, "app makers")).toMatchObject({ owner: "/app-design-agency/", why: ["JEV"] });
    expect(held.pages.find((page) => page.path === "/app-design-agency/")).toMatchObject({ decision: "OWNER", owns: 1 });
  });

  test("with it on, the specialist explains its picks and never picks a page itself", () => {
    const held = group();
    applyChosen(held, new Map([["app makers", "/app-design-agency/"]]), 0.04);
    const rulePage = searchOf(held, "app companies").owner;
    const applied = applyAnswer(held, {
      owners: [
        { search: "app makers", page: "/app-design-agency/", why: "Its title is about making apps." },
        // Another page for a search: refused, as is a reason for a page the rule chose.
        { search: "app makers", page: "/mobile-app-developers/", why: "…" },
        { search: "app companies", page: "/app-design-agency/", why: "…" },
      ],
    }, 0.04, "2026-10-12", { ownersChosen: true });
    expect(applied).toMatchObject({ owners: 0, refused: 2 });
    expect(searchOf(held, "app makers")).toMatchObject({ owner: "/app-design-agency/", why: ["JEV"], reason: "Its title is about making apps." });
    expect(searchOf(held, "app companies").owner).toBe(rulePage);
  });

  test("a search is asked once: again only when the pages Google shows for it change, or its pick grows old", () => {
    const held = group();
    const questions = ownerQuestions(held, 12);
    const now = Date.parse("2026-10-13T10:00:00Z");
    const pick = (search: string, offered: string, page: string | null, pickedAt = now) => ({ search, offered, page, pickedAt });
    const asked = questions.find((question) => question.search === "app makers")!;
    const picks = new Map([
      ["app makers", pick("app makers", offeredReading(asked), "/app-design-agency/")],
      ["app companies", pick("app companies", "other pages", "/app-design-agency/")],
      ["mobile app developers", pick("mobile app developers", offeredReading(questions.find((question) => question.search === "mobile app developers")!), null, now - PICK_MAX_AGE_MS - 1)],
    ]);
    expect(picksDue(questions, picks, now).map((question) => question.search).sort()).toEqual(["app companies", "app developers", "app developers london", "mobile app developers"]);
    // Only a sure pick made between today's pages is used; the rest keep the rule's page.
    const { chosen, unsure } = pickedPages(questions, picks);
    expect([...chosen]).toEqual([["app makers", "/app-design-agency/"]]);
    expect(unsure).toBe(questions.length - 1);
  });

  test("with the pages picked, the specialist reads the most searched and those the decision model moved, each with the rule's page", () => {
    const held = group();
    const rule = searchOf(held, "app makers").owner;
    applyChosen(held, new Map([["app makers", "/app-design-agency/"]]), 0.04);
    expect(searchOf(held, "app makers").rulePage).toBe(rule);
    const read = agentInputOf(held, new Map(), true);
    expect(read).toMatchObject({ owners_chosen: true });
    expect(read.searches.find((search) => search.search === "app makers")?.rule).toMatchObject({ page: "/app-design-agency/", why: ["JEV"], rule_page: rule });
    expect(SEARCHES_EXPLAINED).toBe(60);
  });

  test("its picks carry to next week with the decision; turning it on or off reads the group anew", () => {
    const last = group();
    applyChosen(last, new Map([["app makers", "/app-design-agency/"]]), 0.04);
    applyAnswer(last, {}, 0.04, "2026-10-05", { ownersChosen: true });
    const now = group();
    expect(carryOver(now, last, 0.04)).toBe(true);
    expect(searchOf(now, "app makers")).toMatchObject({ owner: "/app-design-agency/", why: ["JEV"] });
    expect(signatureOf(group(), "JEV")).not.toBe(signatureOf(group()));
  });
});
