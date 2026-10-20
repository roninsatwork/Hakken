import { describe, expect, test } from "vitest";
import {
  almostSees, appearanceSees, bandsSees, brandSees, competingSees, curveSees, demandSees, estimatesSees, keywordsSees, lowCtrSees,
  movesSees, newLostSees, pagesSees, performanceSees, placesSees, recordSees, trackedSees, typesSees, websitesSees, type ListFigures,
} from "@/convex/utils/sees/searchConsoleScreens";
import { expectWords } from "./seenWords";

/**
 * What Hakken sees on Search Console's other screens
 * (search-console-volatility-plan.md §8, HS8): each rule on figures like
 * ronins.co.uk's, the advice it gives, and words for every sentence it can
 * say, in English and Italian.
 */

const LIST: ListFigures = {
  rows: 152, clicks: 70, impressions: 9_800, previousClicks: 89, position: 18.2, gaining: 12, losing: 20, gained: 30, lost: -49,
  volume: 3_400, expected: 140, high: 4, low: 9, pagesInvolved: 11,
  bands: { "1-3": 9, "4-10": 31, "11-20": 40, "21-50": 50, "51+": 22 }, bandsBefore: { "1-3": 11, "4-10": 30, "11-20": 38, "21-50": 50, "51+": 22 },
  brand: { now: { brandClicks: 40, nonBrandClicks: 30 }, before: { brandClicks: 42, nonBrandClicks: 47 } },
};
const EMPTY: ListFigures = { ...LIST, rows: 0, clicks: 0, previousClicks: null, gaining: 0, losing: 0, brand: null };
const codes = (box: { says: Array<{ code: string }>; steps: Array<{ code: string }> }) => ({ says: box.says.map((one) => one.code), steps: box.steps.map((one) => one.code) });

describe("What Hakken sees on Search Console's other screens", () => {
  test("Keywords: how many, their clicks against the days before, the top three; check Google, then push the near ones", () => {
    const box = keywordsSees(LIST, "lastMonth");
    expect(codes(box)).toEqual({ says: ["shown", "clicksDown", "topThree"], steps: ["checkGoogle", "pushNear"] });
    expect(box.says[1]).toMatchObject({ a: 21, period: "lastMonth" });
    expectWords("keywords", box, "searchConsole.seen");
    expectWords("keywords", keywordsSees(EMPTY, "lastMonth"), "searchConsole.seen");
  });

  test("Pages, Position bands, Wins and losses", () => {
    for (const [screen, box] of [
      ["pages", pagesSees(LIST, "lastMonth")], ["pages", pagesSees(EMPTY, "lastMonth")], ["bands", bandsSees(LIST)], ["moves", movesSees(LIST, "lastMonth")], ["moves", movesSees(EMPTY, "lastMonth")],
    ] as const) expectWords(screen, box, "searchConsole.seen");
    expect(codes(bandsSees(LIST))).toEqual({ says: ["bands", "topFewer"], steps: ["pushNear"] });
    expect(codes(movesSees(LIST, "lastMonth"))).toEqual({ says: ["gainingLosing", "netDown"], steps: ["seeLosing", "checkGoogle"] });
  });

  test("Almost there, Shown but not clicked, Missed demand, Pages competing, Real against estimated", () => {
    for (const [screen, rule] of [["almost", almostSees], ["lowCtr", lowCtrSees], ["demand", demandSees], ["competing", competingSees], ["estimates", estimatesSees]] as const) {
      expectWords(screen, rule(LIST), "searchConsole.seen");
      expectWords(screen, rule(EMPTY), "searchConsole.seen");
    }
    expect(codes(demandSees(LIST))).toEqual({ says: ["missed", "missedVolume"], steps: ["writeForDemand"] });
  });

  test("Brand and non-brand: the brand's share, and the rest's clicks against the days before", () => {
    const box = brandSees(LIST);
    expect(codes(box)).toEqual({ says: ["brandShare", "othersDown"], steps: ["growOthers"] });
    expect(box.says.map((one) => one.a)).toEqual([57, 36]);
    expectWords("brand", box, "searchConsole.seen");
    expectWords("brand", brandSees(EMPTY), "searchConsole.seen");
  });

  test("Tracked keywords and pages: none yet says how to start", () => {
    expect(codes(trackedSees(EMPTY, "lastMonth", "keywords"))).toEqual({ says: ["noneKeywords"], steps: ["trackKeywords"] });
    for (const kind of ["keywords", "pages"] as const) {
      const screen = kind === "keywords" ? "trackedKeywords" : "trackedPages";
      expectWords(screen, trackedSees(LIST, "lastMonth", kind), "searchConsole.seen");
      expectWords(screen, trackedSees(EMPTY, "lastMonth", kind), "searchConsole.seen");
    }
  });

  test("Performance, New and lost, By page classification, Countries and devices, Rich results, Click rate by position", () => {
    const performance = performanceSees({ clicks: 70, impressions: 9_800, position: 18.24 }, { clicks: 89, position: 17.1 }, "lastMonth");
    expect(codes(performance)).toEqual({ says: ["performance", "clicksDown", "position"], steps: ["checkGoogle"] });
    for (const [screen, box] of [
      ["performance", performance],
      ["performance", performanceSees(null, null, "lastMonth")],
      ["newLost", newLostSees({ newKeywords: 14, lostKeywords: 21, newPages: 2, lostPages: 1 }, "lastMonth")],
      ["types", typesSees({ name: "Service pages", clicks: 40 }, 70)],
      ["types", typesSees(null, 0)],
      ["places", placesSees({ name: "United Kingdom", clicks: 61 }, 70, 22)],
      ["places", placesSees(null, 0, null)],
      ["appearance", appearanceSees(2, { name: "FAQ" })],
      ["appearance", appearanceSees(0, null)],
      ["ctrCurve", curveSees([{ position: 1, ctr: 0.21, impressions: 40 }, { position: 3, ctr: 0.08, impressions: 120 }])],
      ["ctrCurve", curveSees([])],
    ] as const) expectWords(screen, box, "searchConsole.seen");
  });

  test("A keyword's or a page's own screen, and the list of websites", () => {
    const record = recordSees("web design surrey", { clicks: 4, position: 12.4 }, { clicks: 9, position: 7.9 }, "lastMonth");
    expect(codes(record).says).toEqual(["recordFigures", "clicksDown", "fell"]);
    expectWords("record", record, "searchConsole.seen");
    expectWords("record", recordSees("web design surrey", null, null, "lastMonth"), "searchConsole.seen");
    const websites = websitesSees([
      { siteId: "s1", host: "ronins.co.uk", connected: true, clicks: 261 },
      { siteId: "s2", host: "korda.co.uk", connected: false, clicks: null },
    ]);
    expect(codes(websites)).toEqual({ says: ["connected", "oneWebsite", "notConnected"], steps: ["connect"] });
    expect(websites.steps[0].to).toEqual({ url: "/app/search-console/s2/connection" });
    expectWords("websites", websites, "searchConsole.seen");
  });
});
