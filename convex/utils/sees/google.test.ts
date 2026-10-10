import { describe, expect, test } from "vitest";
import { expectWords } from "@/src/test/seenWords";
import { aboveSees, fanOutTrackedSees, featureRecordSees, featuresSees, movesSees, questionsSees, searchesSees } from "./google";

/** What Hakken sees on the Google results screens (discovery-detail-and-hakken-sees-plan.md §6). */
const search = (keyword: string, lastPosition: number | null, previousPosition: number | null, isActive = true, lastCheckedDay: string | null = "2026-10-08") =>
  ({ keyword, isActive, lastPosition, previousPosition, lastCheckedDay });

describe("Your searches", () => {
  test("up and down since the check before, the biggest fall, and page one", () => {
    const box = searchesSees([search("web design surrey", 3, 5), search("website cost", 18, 6), search("seo guildford", null, 40), search("paused", 90, 2, false)]);
    expect(box.says).toEqual([{ code: "moves", a: 1, b: 2 }, { code: "droppedOut", text: "seo guildford", a: 40 }, { code: "firstPage", a: 1, b: 3 }]);
    expect(box.steps).toEqual([{ code: "seeFall", text: "seo guildford", link: "seeSearch", to: { record: "keyword", key: "seo guildford" } }]);
    expectWords("googleSearches", box);
  });

  test("a fall within the top 100; nothing fell; not checked; none tracked", () => {
    expect(searchesSees([search("a", 18, 6), search("b", 30, 25)]).says[1]).toEqual({ code: "biggestFall", text: "a", a: 6, b: 18 });
    expectWords("googleSearches", { says: [{ code: "biggestFall", text: "a", a: 6, b: 18 }], steps: [] });
    expect(searchesSees([search("a", 2, 4)])).toEqual({ says: [{ code: "moves", a: 1, b: 0 }, { code: "firstPage", a: 1, b: 1 }], steps: [] });
    const still = searchesSees([search("a", 2, 2)]);
    expect(still.says[0]).toEqual({ code: "noMoves" });
    expectWords("googleSearches", still);
    const unchecked = searchesSees([search("a", null, null, true, null)]);
    expect(unchecked.says).toEqual([{ code: "notChecked" }]);
    expectWords("googleSearches", unchecked);
    expect(searchesSees([]).says).toEqual([{ code: "noSearches" }]);
  });
});

describe("Tracked fan-out queries", () => {
  const query = (keyword: string, lastPosition: number | null, timesSeen: number | null, lastCheckedDay: string | null = "2026-10-08") => ({ keyword, queryText: keyword, lastPosition, lastCheckedDay, timesSeen });

  test("page one, page two and not ranking", () => {
    const box = fanOutTrackedSees([query("a", 4, 3), query("b", 14, 9), query("c", 12, 20), query("d", null, 1)], true);
    expect(box.says).toEqual([{ code: "tracked", a: 4, b: 1 }, { code: "pageTwo", a: 2, text: "c" }, { code: "notRanking", a: 1 }]);
    expect(box.steps).toEqual([{ code: "pushUp", text: "c", link: "seeSearch", to: { record: "keyword", key: "c" } }]);
    expectWords("googleFanOut", box);
  });

  test("none tracked (your own website, or a competitor's); not checked", () => {
    const own = fanOutTrackedSees([], true);
    expect(own).toEqual({ says: [{ code: "none" }], steps: [{ code: "pickSome", link: "fanOutQueries", to: { segment: "ai/searched" } }] });
    expectWords("googleFanOut", own);
    expect(fanOutTrackedSees([], false).steps).toEqual([]);
    const unchecked = fanOutTrackedSees([query("a", null, 1, null)], true);
    expect(unchecked.says).toEqual([{ code: "notChecked", a: 1 }]);
    expectWords("googleFanOut", unchecked);
  });
});

describe("Wins and losses", () => {
  const row = (keyword: string, status: string, position: number | null, volume: number | null, day = "2026-10-08") => ({ keyword, status, position, volume, day });

  test("gained against lost at the newest check, the biggest loss and win", () => {
    const box = movesSees([
      row("web design surrey", "UP", 3, 1300), row("website cost", "DOWN", 18, 2900), row("seo", "LOST", null, 900),
      row("new one", "NEW", 40, 50), row("older", "DOWN", 30, 99999, "2026-09-01"),
    ], "2026-10-08");
    expect(box.says).toEqual([{ code: "winsLosses", a: 2, b: 2 }, { code: "biggestLoss", text: "website cost", a: 18, b: 2900 }, { code: "biggestWin", text: "web design surrey", a: 3, b: 1300 }]);
    expect(box.steps).toEqual([
      { code: "seeLoss", text: "website cost", link: "seeSearch", to: { record: "keyword", key: "website cost" } },
      { code: "seeWin", text: "web design surrey", link: "seeSearch", to: { record: "keyword", key: "web design surrey" } },
    ]);
    expectWords("googleMoves", box);
  });

  test("a search gone; nothing moved", () => {
    const box = movesSees([row("seo", "LOST", null, 900)], "2026-10-08");
    expect(box.says).toEqual([{ code: "winsLosses", a: 0, b: 1 }, { code: "biggestLost", text: "seo", a: 900 }]);
    expectWords("googleMoves", box);
    expect(movesSees([row("a", "UP", 3, 1)], "")).toEqual({ says: [{ code: "noMoves" }], steps: [] });
  });
});

describe("Who ranks above you", () => {
  const row = (position: number | null, above: Array<[string, boolean]>, day: string | null = "2026-10-08") =>
    ({ isActive: true, day, position, above: above.map(([domain, isRival]) => ({ domain, isRival })) });

  test("the website above you most often, rivals above, and searches you top", () => {
    const box = aboveSees([row(4, [["clutch.co", false], ["brightside.co.uk", true], ["clutch.co", false]]), row(2, [["clutch.co", false]]), row(1, [])]);
    expect(box.says).toEqual([{ code: "aboveMost", text: "clutch.co", a: 2, b: 3 }, { code: "rivalsAbove", a: 1 }, { code: "youFirst", a: 1 }]);
    expect(box.steps).toEqual([{ code: "seeWebsite", text: "clutch.co", link: "seeWebsite", to: { record: "website", key: "clutch.co" } }]);
    expectWords("googleAbove", box);
  });

  test("nobody above; not checked", () => {
    const box = aboveSees([row(1, [])]);
    expect(box).toEqual({ says: [{ code: "nobodyAbove" }, { code: "youFirst", a: 1 }], steps: [] });
    expectWords("googleAbove", box);
    expect(aboveSees([row(null, [], null)]).says).toEqual([{ code: "notChecked" }]);
  });
});

describe("Search features", () => {
  const name = (feature: string) => ({ local_pack: "Map box", ai_overview: "AI Overview" })[feature] ?? feature;

  test("the features that leave you out most", () => {
    const box = featuresSees({ checked: 40, totals: [
      { feature: "ai_overview", searches: 20, withSite: 5 }, { feature: "local_pack", searches: 30, withSite: 10 }, { feature: "video", searches: 4, withSite: null },
    ] }, name);
    expect(box.says).toEqual([{ code: "checked", a: 40, b: 3 }, { code: "missed", text: "Map box", a: 20, b: 30 }, { code: "missedToo", text: "AI Overview", a: 15 }]);
    expect(box.steps).toEqual([{ code: "seeFeature", text: "Map box", link: "seeFeature", to: { record: "feature", key: "local_pack" } }]);
    expectWords("googleFeatures", box);
  });

  test("in every feature shown; not checked", () => {
    const box = featuresSees({ checked: 2, totals: [{ feature: "local_pack", searches: 2, withSite: 2 }] }, name);
    expect(box).toEqual({ says: [{ code: "checked", a: 2, b: 1 }, { code: "inAll" }], steps: [] });
    expectWords("googleFeatures", box);
    expect(featuresSees({ checked: 0, totals: [] }, name).says).toEqual([{ code: "notChecked" }]);
  });
});

describe("One search feature", () => {
  test("in it on how many, and the biggest search you are not in it on", () => {
    const box = featureRecordSees([{ keyword: "a", position: 1, volume: 10 }, { keyword: "b", position: null, volume: 900 }, { keyword: "c", position: null, volume: null }]);
    expect(box).toEqual({
      says: [{ code: "inIt", a: 1, b: 3 }, { code: "biggestOut", text: "b", a: 900 }],
      steps: [{ code: "seeSearch", text: "b", link: "seeSearch", to: { record: "keyword", key: "b" } }],
    });
    expectWords("googleFeature", box);
    expect(featureRecordSees([]).says).toEqual([{ code: "none" }]);
  });
});

describe("Questions people ask", () => {
  test("the questions on your searches, and the one on most of them", () => {
    const box = questionsSees([
      { text: "How much does a website cost?", kind: "QUESTION", searches: ["website cost", "web design price"] },
      { text: "web design near me", kind: "RELATED", searches: ["a", "b", "c"] },
      { text: "Do I need a website?", kind: "QUESTION", searches: ["website cost"] },
    ]);
    expect(box).toEqual({
      says: [{ code: "questions", a: 2, b: 2 }, { code: "mostCommon", text: "How much does a website cost?", a: 2 }],
      steps: [
        { code: "answer", text: "How much does a website cost?", more: "website cost", link: "seeSearch", to: { record: "keyword", key: "website cost" } },
        { code: "checkPages", link: "yourPages", to: { segment: "your-pages" } },
      ],
    });
    expectWords("googleQuestions", box);
    expect(questionsSees([{ text: "x", kind: "RELATED", searches: ["a"] }]).says).toEqual([{ code: "none" }]);
  });
});
