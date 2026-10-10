import { describe, expect, test } from "vitest";
import { expectWords } from "@/src/test/seenWords";
import { bandMovesSees, bandsSees, keywordRecordSees, keywordsSees, pageRecordSees, pagesSees, sectionsSees } from "./organic";

/** What Hakken sees on the Organic search screens (discovery-detail-and-hakken-sees-plan.md §6). */
describe("Keywords", () => {
  const row = (keyword: string, position: number | null, volume: number | null, traffic: number | null) => ({ keyword, position, volume, traffic });

  test("the searches ranked for, the one bringing most visits, and those just off page one", () => {
    const box = keywordsSees([row("web design surrey", 3, 1300, 80), row("website cost", 12, 2900, 4), row("seo", 13, 900, 1), row("wordpress", 16, 5000, 0), row("lost", null, 10, null)]);
    expect(box.says).toEqual([{ code: "ranking", a: 4, b: 1 }, { code: "mostVisits", text: "web design surrey", a: 80 }, { code: "justOff", a: 2, text: "website cost" }]);
    expect(box.steps).toEqual([
      { code: "pushUp", text: "website cost", link: "seeSearch", to: { record: "keyword", key: "website cost" } },
      { code: "keepTop", text: "web design surrey", link: "seeSearch", to: { record: "keyword", key: "web design surrey" } },
    ]);
    expectWords("keywords", box);
  });

  test("no visits and nothing near page one; nothing read", () => {
    expect(keywordsSees([row("a", 40, 10, 0)])).toEqual({ says: [{ code: "ranking", a: 1, b: 0 }], steps: [] });
    expect(keywordsSees([]).says).toEqual([{ code: "none" }]);
  });
});

describe("Top pages", () => {
  test("the page bringing most visits, its share, and pages past page one", () => {
    const box = pagesSees([
      { path: "/web-design/", keywords: 40, traffic: 300, bestPosition: 2 },
      { path: "", keywords: 90, traffic: 100, bestPosition: 1 },
      { path: "/blog/cost/", keywords: 25, traffic: 0, bestPosition: 14 },
      { path: "/old/", keywords: 3, traffic: null, bestPosition: 40 },
    ]);
    expect(box.says).toEqual([{ code: "pages", a: 4 }, { code: "topPage", text: "/web-design/", a: 75 }, { code: "offPageOne", a: 2, text: "/blog/cost/" }]);
    expect(box.steps).toEqual([
      { code: "seeTop", text: "/web-design/", link: "seePage", to: { record: "page", key: "/web-design/" } },
      { code: "lift", text: "/blog/cost/", link: "seePage", to: { record: "page", key: "/blog/cost/" } },
    ]);
    expectWords("keywordsPages", box);
    expect(pagesSees([]).says).toEqual([{ code: "none" }]);
  });
});

describe("Position bands", () => {
  const bands = { p01_03: 10, p04_10: 20, p11_20: 30, p21_50: 25, p51_up: 15 };

  test("page one, moved onto and off it, and the closest search", () => {
    const box = bandsSees({
      rankingDay: "2026-10-08", bands,
      moves: [{ from: "p11_20", to: "p04_10", count: 4 }, { from: "p04_10", to: "p11_20", count: 6 }, { from: "p01_03", to: "p04_10", count: 2 }],
      closest: { rows: [{ keyword: "website cost" }], total: 7 },
    });
    expect(box.says).toEqual([{ code: "pageOne", a: 30, b: 100 }, { code: "movedOnOff", a: 4, b: 6 }, { code: "closest", a: 7, text: "website cost" }]);
    expect(box.steps).toEqual([
      { code: "pushUp", text: "website cost", link: "seeSearch", to: { record: "keyword", key: "website cost" } },
      { code: "seeOff", a: 6, link: "movedSearches", to: { segment: "keywords/bands/moved" } },
    ]);
    expectWords("keywordsBands", box);
  });

  test("quiet; nothing read", () => {
    expect(bandsSees({ rankingDay: "2026-10-08", bands, moves: [], closest: { rows: [], total: 0 } })).toEqual({ says: [{ code: "pageOne", a: 30, b: 100 }], steps: [] });
    expect(bandsSees({ rankingDay: null, bands, moves: [], closest: { rows: [], total: 0 } }).says).toEqual([{ code: "none" }]);
  });
});

describe("Searches that changed band", () => {
  test("up against down, and the biggest drop", () => {
    const box = bandMovesSees([{ keyword: "a", was: 15, now: 8, volume: 10 }, { keyword: "b", was: null, now: 40, volume: 5 }, { keyword: "c", was: 4, now: 14, volume: 900 }]);
    expect(box).toEqual({
      says: [{ code: "moved", a: 2, b: 1 }, { code: "biggestDrop", text: "c", a: 4, b: 14 }],
      steps: [{ code: "seeDrop", text: "c", link: "seeSearch", to: { record: "keyword", key: "c" } }],
    });
    expectWords("keywordsBandsMoved", box);
    expect(bandMovesSees([]).says).toEqual([{ code: "none" }]);
  });
});

describe("Site structure", () => {
  test("the folder bringing most visits, and the one turning fewest searches into top-three places", () => {
    const box = sectionsSees([
      { section: "/services/", keywords: 120, top3: 30, traffic: 600 },
      { section: "/blog/", keywords: 200, top3: 4, traffic: 200 },
      { section: "/tiny/", keywords: 3, top3: 0, traffic: 0 },
    ]);
    expect(box.says).toEqual([{ code: "folders", a: 3 }, { code: "topFolder", text: "/services/", a: 75 }, { code: "weakFolder", text: "/blog/", a: 200, b: 4 }]);
    expect(box.steps).toEqual([
      { code: "seeFolder", text: "/blog/", link: "folderPages", to: { segment: "keywords/pages", filters: { section: "/blog/" } } },
      { code: "seeFolder", text: "/services/", link: "folderPages", to: { segment: "keywords/pages", filters: { section: "/services/" } } },
    ]);
    expectWords("keywordsStructure", box);
    expect(sectionsSees([]).says).toEqual([{ code: "none" }]);
  });
});

describe("One search", () => {
  const serp = { results: [{ position: 1, domain: "clutch.co", isYou: false }, { position: 2, domain: "brightside.co.uk", isYou: false }, { position: 3, domain: "ronins.co.uk", isYou: true }] };

  test("where you stand and moved from, who is above you, and a new page shown", () => {
    const box = keywordRecordSees({ keyword: "web design surrey", rank: { position: 3, previousPosition: 5, page: "/web-design/", previousPage: "/" }, tracked: null, serp });
    expect(box.says).toEqual([{ code: "moved", a: 3, b: 5 }, { code: "above", text: "clutch.co", a: 2 }, { code: "pageChanged", text: "/web-design/", more: "/" }]);
    expect(box.steps).toEqual([
      { code: "seePage", text: "/web-design/", link: "seePage", to: { record: "page", key: "/web-design/" } },
      { code: "seeAbove", text: "clutch.co", link: "seeWebsite", to: { record: "website", key: "clutch.co" } },
    ]);
    expectWords("keywordRecord", box);
  });

  test("steady, tracked only, and not ranking", () => {
    expect(keywordRecordSees({ keyword: "k", rank: { position: 1, previousPosition: 1, page: "", previousPage: null }, tracked: null, serp: null }).says).toEqual([{ code: "position", a: 1 }]);
    const tracked = keywordRecordSees({ keyword: "k", rank: null, tracked: { lastPosition: 7 }, serp: null });
    expect(tracked).toEqual({ says: [{ code: "position", a: 7 }], steps: [] });
    const none = keywordRecordSees({ keyword: "k", rank: null, tracked: null, serp: { results: [{ position: 1, domain: "clutch.co", isYou: false }] } });
    expect(none.says).toEqual([{ code: "notRanking", text: "k" }, { code: "above", text: "clutch.co", a: 1 }]);
    expectWords("keywordRecord", none);
  });
});

describe("One page", () => {
  const names = (check: string) => ({ no_description: "No description" })[check] ?? check;

  test("its searches, its first problem, its links, and AI answers citing it", () => {
    const box = pageRecordSees({
      page: "/web-design/",
      rank: { keywords: 40, top3: 6, topKeyword: "web design surrey" },
      crawl: { problems: ["no_description", "slow"] },
      cited: { times: 3 },
      links: [{ status: "LIVE" }, { status: "LOST" }],
    }, names);
    expect(box.says).toEqual([{ code: "searches", a: 40, b: 6, text: "web design surrey" }, { code: "problems", a: 2, text: "No description" }, { code: "links", a: 1 }]);
    expect(box.steps).toEqual([
      { code: "fixProblem", text: "No description", link: "seeProblem", to: { record: "problem", key: "no_description" } },
      { code: "seeTopSearch", text: "web design surrey", link: "seeSearch", to: { record: "keyword", key: "web design surrey" } },
    ]);
    expectWords("pageRecord", box);
  });

  test("not ranking with no problems, cited; nothing held", () => {
    const box = pageRecordSees({ page: "/x/", rank: null, crawl: { problems: [] }, cited: { times: 1 }, links: [] }, names);
    expect(box).toEqual({ says: [{ code: "notRanking" }, { code: "noProblems" }, { code: "links", a: 0 }], steps: [] });
    expectWords("pageRecord", box);
    expectWords("pageRecord", { says: [{ code: "cited", a: 1 }], steps: [] });
    expect(pageRecordSees({ page: "/x/", rank: null, crawl: null, cited: { times: 0 }, links: [] }, names).says).toEqual([{ code: "notHeld" }]);
  });
});
