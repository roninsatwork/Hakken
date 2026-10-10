import { describe, expect, test } from "vitest";
import { expectWords } from "@/src/test/seenWords";
import { overviewGapsSees, radarOverviewSees, radarSourcesSees } from "./radar";

/** What Hakken sees on Brand radar's three screens (discovery-detail-and-hakken-sees-plan.md §6). */
describe("Brand radar → Overview", () => {
  const businesses = [
    { host: "ronins.co.uk", you: true, mentions: 64, before: 55 },
    { host: "brightside.co.uk", you: false, mentions: 121, before: 130 },
    { host: "hilltop.co.uk", you: false, mentions: 15, before: null },
  ];
  const questions = [
    { question: "best web design agency in surrey", volume: 1300, you: 2, rivals: ["brightside.co.uk"] },
    { question: "how much does a website cost in the uk", volume: 2900, you: null, rivals: ["brightside.co.uk"] },
    { question: "web design near me", volume: 900, you: null, rivals: [] },
  ];

  test("behind the leader: your share against theirs, the month's move, and the biggest question you are missing", () => {
    const box = radarOverviewSees({ businesses, questions });
    expect(box.says).toEqual([
      { code: "behindLeader", a: 64, b: 32, c: 61, text: "brightside.co.uk" },
      { code: "upMonth", a: 9 },
      { code: "missingQuestion", text: "how much does a website cost in the uk", a: 2900 },
    ]);
    expect(box.steps).toEqual([
      { code: "answerQuestion", text: "how much does a website cost in the uk", link: "seeQuestion", to: { record: "question", key: "how much does a website cost in the uk" } },
      { code: "seeLeader", text: "brightside.co.uk", link: "seeBusiness", to: { record: "business", key: "brightside.co.uk" } },
    ]);
    expectWords("radarOverview", box);
  });

  test("level with the best rival is leading; a fall is said; nothing read says so", () => {
    const level = radarOverviewSees({ businesses: [{ ...businesses[0], mentions: 121, before: 140 }, businesses[1]], questions: [] });
    expect(level.says).toEqual([{ code: "youLead", a: 121, b: 50 }, { code: "downMonth", a: 19 }]);
    expect(level.steps).toEqual([]);
    expectWords("radarOverview", level);
    const none = radarOverviewSees({ businesses: [{ ...businesses[0], mentions: null }], questions });
    expect(none).toEqual({ says: [{ code: "noReading" }], steps: [] });
    expectWords("radarOverview", none);
  });
});

describe("Brand radar → Websites AI cites", () => {
  const websites = [
    { host: "ronins.co.uk", kind: "YOURS", besideYou: 4, besideRivals: 1 },
    { host: "clutch.co", kind: "DIRECTORY", besideYou: 0, besideRivals: 9 },
    { host: "goodfirms.co", kind: "DIRECTORY", besideYou: 0, besideRivals: 3 },
    { host: "brightside.co.uk", kind: "RIVAL", besideYou: 0, besideRivals: 12 },
    { host: "bbc.co.uk", kind: "NEWS", besideYou: 2, besideRivals: 2 },
  ];

  test("the websites quoted, the places rivals are and you are not, and your own pages", () => {
    const box = radarSourcesSees({ websites, yourTimes: 4 });
    expect(box.says).toEqual([
      { code: "websitesQuoted", a: 5, b: 2 },
      { code: "placesMissing", a: 2, text: "clutch.co" },
      { code: "ownPages", a: 4 },
    ]);
    expect(box.steps).toEqual([
      { code: "getOnto", text: "clutch.co", link: "seeWebsite", to: { record: "website", key: "clutch.co" } },
      { code: "workThrough", link: "whereToGetListed", to: { segment: "mentions/listed" } },
    ]);
    expectWords("radarSources", box);
  });

  test("beside you everywhere: no steps, and no page of your own quoted is said", () => {
    const box = radarSourcesSees({ websites: [{ host: "bbc.co.uk", kind: "NEWS", besideYou: 2, besideRivals: 2 }], yourTimes: 0 });
    expect(box).toEqual({ says: [{ code: "websitesQuoted", a: 1, b: 1 }, { code: "ownPagesNone" }], steps: [] });
    expectWords("radarSources", box);
    expect(radarSourcesSees({ websites: [], yourTimes: 0 }).says).toEqual([{ code: "noReading" }]);
  });
});

describe("Brand radar → AI Overview gaps", () => {
  const rows = [
    { keyword: "web design surrey", volume: 1300, position: 3, overview: true, quotesYou: true },
    { keyword: "website cost uk", volume: 2900, position: 7, overview: true, quotesYou: false },
    { keyword: "web agency guildford", volume: 400, position: 4, overview: true, quotesYou: false },
    { keyword: "seo agency london", volume: 8000, position: 41, overview: true, quotesYou: false },
    { keyword: "wordpress agency", volume: 600, position: 2, overview: false, quotesYou: false },
  ];

  test("overviews, the first-page searches they leave you out of, and the month's change", () => {
    const box = overviewGapsSees({ quotedBefore: 3, rows });
    expect(box.says).toEqual([
      { code: "overviews", a: 4, b: 5, c: 1 },
      { code: "gaps", a: 2, b: 3300 },
      { code: "quotedDown", a: 2 },
    ]);
    expect(box.steps).toEqual([{ code: "fixGap", text: "website cost uk", link: "seeSearch", to: { record: "keyword", key: "website cost uk" } }]);
    expectWords("overviewGaps", box);
  });

  test("no gaps, more quotes than a month before, and nothing checked", () => {
    const box = overviewGapsSees({ quotedBefore: 0, rows: rows.slice(0, 1) });
    expect(box).toEqual({ says: [{ code: "overviews", a: 1, b: 1, c: 1 }, { code: "noGaps" }, { code: "quotedUp", a: 1 }], steps: [] });
    expectWords("overviewGaps", box);
    expect(overviewGapsSees({ quotedBefore: null, rows: [] }).says).toEqual([{ code: "noChecks" }]);
  });
});
