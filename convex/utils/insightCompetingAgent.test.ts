import { describe, expect, test } from "vitest";
import { MOST_SEARCHES, competingForAssistant, competingGroups, type CompetingPair, type KeptGroup, type PageFigures } from "./insightCompeting";
import { COMPETING_ANSWER, SEARCHES_SHOWN, agentInputOf, applyAnswer, carryOver, signatureOf, summaryOf, usableWords } from "./insightCompetingAgent";

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

  test("its words are never cut; a write-up kept cut short reads to its last whole sentence and is asked for again", () => {
    const span = { from: "2026-07-13", to: "2026-10-10" };
    const long = `${"Each page should own its own searches. ".repeat(40)}Done.`;
    const held = group();
    const applied = applyAnswer(held, { headline: "Three app pages compete.", story: long }, 0.04, "2026-10-12");
    expect(applied.words?.story).toBe(long.trim());
    held.words = { headline: "Three app pages compete.", story: "Google splits these searches. Merging would help and" };
    expect(summaryOf(held, span)).toEqual(["Three app pages compete.", "Google splits these searches."]);
    expect(carryOver(group(), held, 0.04)).toBe(false);
  });

  test("it decides every search a group keeps, not only the most searched", () => {
    expect(SEARCHES_SHOWN).toBe(MOST_SEARCHES);
    expect(agentInputOf(group(), new Map()).searches).toHaveLength(group().searches.length);
    expect(COMPETING_ANSWER).toMatch(/you decide every search/);
  });

  test("its words open the group's page, filled from the group's own figures; a group the rule decided has none, and they carry with the decision", () => {
    const span = { from: "2026-07-13", to: "2026-10-10" };
    const words = { headline: "Three app pages split [[competing./mobile-app-developers/.split]] of your searches.", story: "Give each search one page." };
    const held = group();
    expect(summaryOf(held, span)).toBeNull();
    applyAnswer(held, { owners: [], pages: [] }, 0.04, "2026-10-12");
    held.words = usableWords(held, words, span) ?? undefined;
    expect(summaryOf(held, span)).toEqual([`Three app pages split ${held.split} of your searches.`, "Give each search one page."]);
    // A figure typed, or one the group doesn't hold, and its words aren't kept.
    expect(usableWords(held, { headline: "Three pages split 5 searches.", story: "…" }, span)).toBeNull();
    expect(usableWords(held, { headline: "[[competing./elsewhere/.split]] searches.", story: "…" }, span)).toBeNull();
    const now = group();
    expect(carryOver(now, held, 0.04)).toBe(true);
    expect(summaryOf(now, span)).toEqual(summaryOf(held, span));
    expect(competingForAssistant([{ ...now, summary: summaryOf(now, span) }]).groups[0]).toMatchObject({ summary: `Three app pages split ${held.split} of your searches. Give each search one page.` });
  });
});
