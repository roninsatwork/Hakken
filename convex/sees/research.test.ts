import { describe, expect, test } from "vitest";
import { expectWords } from "@/src/test/seenWords";
import { answersSees, competitorStartSees, ideasSees, lookupSees, researchListSees, researchStartSees, resultsSees } from "./research";

/** What Hakken sees on Keyword research's screens (discovery-detail-and-hakken-sees-plan.md §6). */
const words = (screen: string, box: Parameters<typeof expectWords>[1]) => expectWords(screen, box, "keywordResearch.seen");

describe("Keyword research", () => {
  const lookup = (lookupId: string, keyword: string, volume: number | null, difficulty: number | null, position: number | null, notInTop100 = false, host: string | null = "ronins.co.uk") =>
    ({ lookupId, keyword, host, volume, difficulty, position, notInTop100 });

  test("the searches looked up, and the best chance not yet on page one", () => {
    const box = researchStartSees([
      lookup("l1", "web design surrey", 1300, 40, 3), lookup("l2", "website cost", 2900, 60, 14),
      lookup("l3", "seo guildford", 900, 10, null, true), lookup("l4", "no site", 99999, 0, null, true, null),
    ], [{}]);
    expect(box).toEqual({
      says: [{ code: "lookups", a: 4, b: 1 }, { code: "bestChance", text: "website cost", a: 2900, b: 60 }],
      steps: [{ code: "openLookup", text: "website cost", link: "openLookup", to: { url: "/app/keyword-research/l2" } }],
    });
    words("start", box);
    expect(researchStartSees([], []).says).toEqual([{ code: "start" }]);
    words("start", { says: [{ code: "start" }], steps: [] });
  });
});

describe("A lookup's overview", () => {
  const base = { lookupId: "l1", state: "READY", overview: { volume: 1300, difficulty: 42 }, topResult: { domain: "clutch.co", visits: 800 } };

  test("searched and how hard, where the website stands, and the verdict", () => {
    const box = lookupSees({ ...base, forWebsite: { host: "ronins.co.uk", position: 14, notInTop100: false, verdict: "IMPROVE" } });
    expect(box).toEqual({
      says: [{ code: "volume", a: 1300, b: 42 }, { code: "youRankLow", text: "ronins.co.uk", a: 14 }, { code: "verdict.IMPROVE" }],
      steps: [
        { code: "seeIdeas", link: "keywordIdeas", to: { url: "/app/keyword-research/l1/ideas?kind=terms" } },
        { code: "seeResults", link: "googleResults", to: { url: "/app/keyword-research/l1/results" } },
      ],
    });
    words("overview", box);
    for (const verdict of ["WINNING", "NEW_PAGE", "TOO_HARD"]) words("overview", { says: [{ code: `verdict.${verdict}` }], steps: [] });
  });

  test("on page one, not in the top 100, no website, and not read yet", () => {
    expect(lookupSees({ ...base, forWebsite: { host: "r", position: 3, notInTop100: false, verdict: null } }).says.slice(1)).toEqual([{ code: "youRank", text: "r", a: 3 }, { code: "top", text: "clutch.co", a: 800 }]);
    const out = lookupSees({ ...base, forWebsite: { host: "r", position: null, notInTop100: true, verdict: null } });
    expect(out.says[1]).toEqual({ code: "youDont", text: "r" });
    words("overview", out);
    expect(lookupSees({ ...base, forWebsite: null }).says).toEqual([{ code: "volume", a: 1300, b: 42 }, { code: "top", text: "clutch.co", a: 800 }]);
    words("overview", { says: [{ code: "youRank", text: "r", a: 3 }, { code: "waiting" }, { code: "none" }], steps: [] });
    expect(lookupSees({ ...base, overview: null, state: "WAITING", forWebsite: null }).says).toEqual([{ code: "waiting" }]);
    expect(lookupSees({ ...base, overview: null, state: "FAILED", forWebsite: null }).says).toEqual([{ code: "none" }]);
  });
});

describe("Keyword ideas", () => {
  test("the ideas, those ranked for, and the best chance not on page one", () => {
    const box = ideasSees({ siteId: "s1", rows: [
      { keyword: "web design cost", volume: 2000, difficulty: 30, position: null },
      { keyword: "web designer", volume: 5000, difficulty: 90, position: 40 },
      { keyword: "web design surrey", volume: 1300, difficulty: 10, position: 2 },
    ] });
    expect(box).toEqual({
      says: [{ code: "ideasRanking", a: 3, b: 2 }, { code: "best", text: "web design cost", a: 2000, b: 30 }],
      steps: [{ code: "seeSearch", text: "web design cost", link: "seeSearch", to: { url: "/app/sites/s1/keywords/keyword?keyword=web%20design%20cost" } }],
    });
    words("ideas", box);
    const noSite = ideasSees({ siteId: null, rows: [{ keyword: "a", volume: 1, difficulty: 1, position: null }] });
    expect(noSite).toEqual({ says: [{ code: "ideas", a: 1 }, { code: "best", text: "a", a: 1, b: 1 }], steps: [] });
    words("ideas", noSite);
    expect(ideasSees({ siteId: null, rows: [] }).says).toEqual([{ code: "none" }]);
  });
});

describe("Google's results", () => {
  test("who is first, where the website is, and rivals on the page", () => {
    const box = resultsSees({ rows: [
      { position: 2, url: "https://ronins.co.uk/", domain: "ronins.co.uk", who: "YOU", visits: 300 },
      { position: 1, url: "https://clutch.co/x", domain: "clutch.co", who: null, visits: 900 },
      { position: 3, url: "https://b.co.uk/", domain: "b.co.uk", who: "RIVAL", visits: 10 },
    ] });
    expect(box).toEqual({
      says: [{ code: "top", text: "clutch.co", a: 900 }, { code: "youAt", a: 2 }, { code: "rivals", a: 1 }],
      steps: [{ code: "seeTop", text: "clutch.co", link: "visitPage", to: { url: "https://clutch.co/x" } }],
    });
    words("results", box);
    expect(resultsSees({ rows: [] }).says).toEqual([{ code: "none" }]);
  });
});

describe("What the AI says", () => {
  const figures = { answered: 4, nameYou: 1, nameARival: 3, rivalMost: "brightside.co.uk", pagesCited: 20, pagesCitedYours: 2 };

  test("answers naming the website, the rival named most, and pages cited", () => {
    const box = answersSees({ figures, host: "ronins.co.uk" });
    expect(box).toEqual({ says: [{ code: "named", a: 1, b: 4 }, { code: "rivalMost", text: "brightside.co.uk", a: 3 }, { code: "cited", a: 2, b: 20 }], steps: [] });
    words("ai", box);
    const noSite = answersSees({ figures: { ...figures, rivalMost: null }, host: null });
    expect(noSite.says).toEqual([{ code: "answered", a: 4 }]);
    words("ai", noSite);
    expect(answersSees({ figures: null, host: null }).says).toEqual([{ code: "none" }]);
  });
});

describe("A list", () => {
  test("its searches tracked, and the biggest the website does not rank for", () => {
    const box = researchListSees({ siteId: "s1", rows: [
      { keyword: "a", volume: 10, position: null, tracked: true }, { keyword: "b", volume: 900, position: null, tracked: false }, { keyword: "c", volume: 5, position: 3, tracked: true },
    ] });
    expect(box).toEqual({
      says: [{ code: "tracked", a: 2, b: 3 }, { code: "notRanked", a: 2, text: "b" }],
      steps: [{ code: "seeSearch", text: "b", link: "seeSearch", to: { url: "/app/sites/s1/keywords/keyword?keyword=b" } }],
    });
    words("list", box);
    const ranked = researchListSees({ siteId: null, rows: [{ keyword: "c", volume: 5, position: 3, tracked: false }] });
    expect(ranked).toEqual({ says: [{ code: "tracked", a: 0, b: 1 }, { code: "allRanked" }], steps: [] });
    words("list", ranked);
    expect(researchListSees({ siteId: null, rows: [] }).says).toEqual([{ code: "empty" }]);
  });
});

describe("Start from a competitor", () => {
  test("the searches it has and you do not, and the biggest", () => {
    const box = competitorStartSees({ rivalHost: "brightside.co.uk", preparing: false, rows: [{ keyword: "a", position: 4, volume: 100 }, { keyword: "b", position: 9, volume: 900 }] }, "s1");
    expect(box).toEqual({
      says: [{ code: "gap", text: "brightside.co.uk", a: 2 }, { code: "biggest", text: "b", a: 900, b: 9 }],
      steps: [{ code: "seeSearch", text: "b", link: "seeSearch", to: { url: "/app/sites/s1/keywords/keyword?keyword=b" } }],
    });
    words("competitor", box);
    for (const [result, code] of [[{ rivalHost: "x", preparing: true, rows: [] }, "preparing"], [{ rivalHost: "x", preparing: false, rows: [] }, "none"]] as const) {
      const quiet = competitorStartSees(result, null);
      expect(quiet).toEqual({ says: [{ code, text: "x" }], steps: [] });
      words("competitor", quiet);
    }
  });
});
