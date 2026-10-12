import { describe, expect, test } from "vitest";
import { competingGroups, type CompetingPair, type KeptGroup, type PageFigures } from "./insightCompeting";
import { COMPETING_ANSWER, agentInputOf, applyAnswer, carryOver, signatureOf } from "./insightCompetingAgent";

/**
 * The Keyword cannibalisation specialist (insightCompetingAgent.ts): what it
 * reads of a group, its answer held to the rule's guards, and a group the
 * rule reads just as last week keeping last week's decision.
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
const pageOf = (held: KeptGroup, path: string) => held.pages.find((page) => page.path === path)!;

describe("the Keyword cannibalisation specialist", () => {
  test("it reads each page's title and the rule's choice for the most searched searches", () => {
    const read = agentInputOf(group(), new Map([["/mobile-app-developers/", "Mobile App Developers UK | Ronins"]]));
    expect(read.pages.find((page) => page.path === "/mobile-app-developers/")).toMatchObject({ title: "Mobile App Developers UK | Ronins", sells: true, rule: { do: "KEEP" } });
    expect(read.searches[0]).toMatchObject({ search: "mobile app developers", searched_a_month: 4_400, rule: { page: "/mobile-app-developers/", why: ["NO_PLACE", "WORDS"] } });
    expect(COMPETING_ANSWER).toMatch(/never type a number/);
  });

  test("its owners are taken where Google shows the page, and the group settles from them", () => {
    const held = group();
    const applied = applyAnswer(held, {
      owners: [
        { search: "app makers", page: "/app-design-agency/", why: "Its title is about making apps." },
        // Google doesn't show /nowhere/ for it: refused.
        { search: "app companies", page: "/nowhere/", why: "…" },
      ],
      pages: [],
      headline: "Three app pages split [[competing./mobile-app-developers/.split]] searches.",
      story: "One page should own each.",
    }, 0.04, "2026-10-12");
    expect(applied).toMatchObject({ owners: 1, refused: 1, words: { headline: "Three app pages split [[competing./mobile-app-developers/.split]] searches." } });
    expect(searchOf(held, "app makers")).toMatchObject({ owner: "/app-design-agency/", why: ["AGENT"], reason: "Its title is about making apps." });
    expect(pageOf(held, "/app-design-agency/")).toMatchObject({ decision: "OWNER", owns: 1 });
    expect(held).toMatchObject({ decidedBy: "AGENT", decidedWeek: "2026-10-12" });
  });

  test("a page owning searches of its own is never merged; one owning none may be, enquiries and all", () => {
    const held = group();
    const applied = applyAnswer(held, {
      pages: [
        { path: "/app-developers-london/", do: "MERGE", into: "/mobile-app-developers/", why: "…" },
        { path: "/app-design-agency/", do: "MERGE", into: "/mobile-app-developers/", why: "It repeats the mobile page." },
      ],
    }, 0.04, "2026-10-12");
    expect(applied.refused).toBe(1);
    expect(pageOf(held, "/app-developers-london/").decision).toBe("OWNER");
    expect(pageOf(held, "/app-design-agency/")).toMatchObject({ decision: "MERGE", into: "/mobile-app-developers/", reason: "It repeats the mobile page." });
  });

  test("a group the rule reads just as last week keeps last week's decision; one read anew is asked again", () => {
    const last = group();
    applyAnswer(last, { owners: [{ search: "app makers", page: "/app-design-agency/", why: "Its title is about making apps." }] }, 0.04, "2026-10-05");
    const now = group();
    expect(carryOver(now, last, 0.04)).toBe(true);
    expect(searchOf(now, "app makers")).toMatchObject({ owner: "/app-design-agency/", reason: "Its title is about making apps." });
    expect(now).toMatchObject({ decidedBy: "AGENT", decidedWeek: "2026-10-05" });
    const changed = { ...group(), signature: "other" };
    expect(carryOver(changed, last, 0.04)).toBe(false);
    expect(changed.decidedBy).toBe("RULE");
  });
});
