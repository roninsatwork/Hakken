import { describe, expect, test } from "vitest";
import { expectWords } from "@/src/test/seenWords";
import { contentGapSees, marketMapSees, organicCompetitorsSees, rivalSees, sideBySideSees, suggestedSees } from "./competitors";
import { paidKeywordsSees, paidSees } from "./paid";

/** What Hakken sees on the Paid search and Competitors screens (discovery-detail-and-hakken-sees-plan.md §6). */
describe("Paid search", () => {
  test("advertising, what the visits would cost, and its searches", () => {
    const box = paidSees([{ paidKeywords: 3 }, { paidKeywords: 12, paidTraffic: 340, paidTrafficCost: 1200 }, {}]);
    expect(box).toEqual({
      says: [{ code: "advertising", a: 12, b: 340 }, { code: "cost", a: 1200 }],
      steps: [{ code: "seeKeywords", link: "paidKeywords", to: { segment: "paid/keywords" } }],
    });
    expectWords("paid", box);
    expect(paidSees([{ paidKeywords: 0 }]).says).toEqual([{ code: "notAdvertising" }]);
    expect(paidSees([]).says).toEqual([{ code: "none" }]);
    expectWords("paid", { says: [{ code: "notAdvertising" }, { code: "none" }], steps: [] });
  });

  test("the searches paid for, the dearest, and the one bringing most visits", () => {
    const box = paidKeywordsSees([{ keyword: "web design", traffic: 200, trafficCost: 400.4 }, { keyword: "seo agency", traffic: 50, trafficCost: 800.6 }]);
    expect(box).toEqual({
      says: [{ code: "keywords", a: 2, b: 1201 }, { code: "dearest", text: "seo agency", a: 801 }, { code: "mostVisits", text: "web design", a: 200 }],
      steps: [{ code: "seeSearch", text: "seo agency", link: "seeSearch", to: { record: "keyword", key: "seo agency" } }],
    });
    expectWords("paidKeywords", box);
    expect(paidKeywordsSees([]).says).toEqual([{ code: "none" }]);
  });
});

describe("Side by side", () => {
  const rival = (host: string, beatsYouOn: number, youBeatOn: number, comparedOn = 100) => ({ host, beatsYouOn, youBeatOn, comparedOn });

  test("how many you lead, and the rival beating you most", () => {
    const box = sideBySideSees([rival("brightside.co.uk", 60, 20), rival("hilltop.co.uk", 10, 30)], (host) => (host === "brightside.co.uk" ? "hold1" : null));
    expect(box.says).toEqual([{ code: "leadOver", a: 1, b: 2 }, { code: "trailMost", text: "brightside.co.uk", a: 60, b: 20 }]);
    expect(box.steps).toEqual([
      { code: "seeRival", text: "brightside.co.uk", link: "seeRival", to: { record: "rival", key: "hold1" } },
      { code: "seeGap", link: "contentGap", to: { segment: "competitors/gap" } },
    ]);
    expectWords("competitors", box);
  });

  test("ahead of all; not compared; no rival", () => {
    const all = sideBySideSees([rival("a", 1, 9)], () => "x");
    expect(all.says).toEqual([{ code: "leadAll", a: 1 }]);
    expectWords("competitors", all);
    const unread = sideBySideSees([rival("a", 0, 0, 0)], () => null);
    expect(unread.says).toEqual([{ code: "notCompared", a: 1 }]);
    expectWords("competitors", unread);
    const none = sideBySideSees([], () => null);
    expect(none).toEqual({ says: [{ code: "noRivals" }], steps: [{ code: "findRivals", link: "suggestedCompetitors", to: { segment: "competitors/suggested" } }] });
    expectWords("competitors", none);
  });
});

describe("One rival", () => {
  test("the searches it beats you on, and the biggest", () => {
    const box = rivalSees([
      { keyword: "web design", theirPosition: 2, yourPosition: 9, volume: 900 },
      { keyword: "seo", theirPosition: 8, yourPosition: 3, volume: 5000 },
      { keyword: "website cost", theirPosition: 4, yourPosition: 6, volume: 2900 },
    ]);
    expect(box.says).toEqual([{ code: "shared", a: 3, b: 2 }, { code: "biggest", text: "website cost", a: 4, b: 6 }]);
    expect(box.steps[0]).toEqual({ code: "seeSearch", text: "website cost", link: "seeSearch", to: { record: "keyword", key: "website cost" } });
    expectWords("competitorsRival", box);
    const ahead = rivalSees([{ keyword: "seo", theirPosition: 8, yourPosition: 3, volume: 1 }]);
    expect(ahead.says[1]).toEqual({ code: "aheadOnAll" });
    expectWords("competitorsRival", ahead);
    const none = rivalSees([]);
    expect(none.says).toEqual([{ code: "noneShared" }]);
    expectWords("competitorsRival", none);
  });
});

describe("Organic competitors", () => {
  test("the websites sharing most searches, and those not watched", () => {
    const box = organicCompetitorsSees([
      { host: "clutch.co", intersections: 300, tracked: false }, { host: "brightside.co.uk", intersections: 400, tracked: true }, { host: "x.example", intersections: 20, tracked: false },
    ]);
    expect(box).toEqual({
      says: [{ code: "sharing", a: 3, text: "brightside.co.uk", b: 400 }, { code: "unwatched", a: 2, text: "clutch.co" }],
      steps: [{ code: "lookAt", text: "clutch.co", link: "seeBusiness", to: { record: "business", key: "clutch.co" } }],
    });
    expectWords("competitorsOrganic", box);
    const watched = organicCompetitorsSees([{ host: "a", intersections: 1, tracked: true }]);
    expect(watched.says[1]).toEqual({ code: "allWatched" });
    expectWords("competitorsOrganic", watched);
    expect(organicCompetitorsSees([]).says).toEqual([{ code: "none" }]);
  });
});

describe("Content gap", () => {
  test("the gap, its biggest search, and those every rival has", () => {
    const box = contentGapSees([{ keyword: "a", volume: 10, rivals: [1, 2] }, { keyword: "b", volume: 900, rivals: [1] }, { keyword: "c", volume: null, rivals: [1, 2] }], 2);
    expect(box).toEqual({
      says: [{ code: "gap", a: 3 }, { code: "biggest", text: "b", a: 900 }, { code: "everyRival", a: 2, b: 2 }],
      steps: [{ code: "seeSearch", text: "b", link: "seeSearch", to: { record: "keyword", key: "b" } }],
    });
    expectWords("competitorsGap", box);
    expect(contentGapSees([{ keyword: "a", volume: 1, rivals: [1] }], 1).says).toHaveLength(2);
    expect(contentGapSees([], 2).says).toEqual([{ code: "none" }]);
  });
});

describe("Market map", () => {
  test("your place by visits, and who is just above", () => {
    const box = marketMapSees([
      { host: "clutch.co", role: "FOUND", traffic: 9000 }, { host: "www.brightside.co.uk", role: "RIVAL", traffic: 800 },
      { host: "ronins.co.uk", role: "YOU", traffic: 300 }, { host: "x", role: "FOUND", traffic: null },
    ]);
    expect(box).toEqual({
      says: [{ code: "place", a: 3, b: 3 }, { code: "justAbove", text: "www.brightside.co.uk", a: 800, b: 300 }],
      steps: [{ code: "lookAt", text: "www.brightside.co.uk", link: "seeBusiness", to: { record: "business", key: "brightside.co.uk" } }],
    });
    expectWords("competitorsMap", box);
    const top = marketMapSees([{ host: "ronins.co.uk", role: "YOU", traffic: 300 }, { host: "b", role: "RIVAL", traffic: 300 }]);
    expect(top).toEqual({ says: [{ code: "place", a: 1, b: 2 }, { code: "top" }], steps: [] });
    expectWords("competitorsMap", top);
    expect(marketMapSees([{ host: "ronins.co.uk", role: "YOU", traffic: null }]).says).toEqual([{ code: "none" }]);
  });
});

describe("Suggested competitors", () => {
  test("why each is suggested, and the strongest", () => {
    const box = suggestedSees([
      { host: "clutch.co", reason: "NAMED_BY_AI", times: 12, intersections: null },
      { host: "pixel.example", reason: "RANKS_FOR_YOUR_SEARCHES", times: null, intersections: 140 },
    ]);
    expect(box).toEqual({
      says: [{ code: "reasons", a: 1, b: 1 }, { code: "strongestAi", text: "clutch.co", a: 12 }, { code: "strongestSearch", text: "pixel.example", a: 140 }],
      steps: [{ code: "lookAt", text: "clutch.co", link: "seeWebsite", to: { record: "website", key: "clutch.co" } }],
    });
    expectWords("competitorsSuggested", box);
    expect(suggestedSees([]).says).toEqual([{ code: "none" }]);
  });
});
