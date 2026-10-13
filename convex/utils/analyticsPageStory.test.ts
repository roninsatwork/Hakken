import { describe, expect, test } from "vitest";
import { channelKey, emptyRow, type ListRow } from "../googleAnalyticsLists";
import { clicksOf, devicesOf, differentPages, joined, nextOf, readShare, referrerUrls, sourcesOf, viewsPerVisit, weekdaysOf, whoOf } from "./analyticsPageStory";

/**
 * A page's story on its own All pages screen (docs/plans/active/analytics-page-screen-plan.md
 * §2–§4), worked out from Google's answers as ronins.co.uk's Kapferer article
 * read on 13 October 2026: 593 visits started on it, Google's 500 made no
 * conversion and one visit typed in made one, and Google counted the
 * article three times or more a visit.
 */

const row = (key: string, fill: Partial<ListRow>): ListRow => ({ ...emptyRow(key), ...fill });

describe("a page's story", () => {
  test("every address its views' page before may name: https or http, slash or not, each of the website's addresses", () => {
    expect(referrerUrls(["www.ronins.co.uk"], "/hub/prism/")).toEqual([
      "https://www.ronins.co.uk/hub/prism/", "https://www.ronins.co.uk/hub/prism",
      "http://www.ronins.co.uk/hub/prism/", "http://www.ronins.co.uk/hub/prism",
    ]);
    expect(referrerUrls(["Ronins.co.uk"], "/")).toEqual(["https://ronins.co.uk/", "http://ronins.co.uk/"]);
  });

  test("different pages a visit count a page once, however often Google counts it (PS4)", () => {
    // 593 visits saw 640 page-visits between them: 1.08 different pages, where Google counted 3.5.
    expect(differentPages(640, 593)).toBeCloseTo(1.08, 2);
    expect(differentPages(0, 593)).toBe(1);
    expect(differentPages(10, 0)).toBeNull();
    expect(viewsPerVisit(2021, 593)).toBeCloseTo(3.41, 2);
    expect(viewsPerVisit(5, 0)).toBeNull();
  });

  test("how far it is read: readers past 90% down over the visits that saw it, never over its swollen views", () => {
    expect(readShare([row("page_view", { times: 2021 }), row("scroll", { times: 47 })], 593)).toBeCloseTo(0.079, 3);
    expect(readShare([row("scroll", { times: 3 })], 0)).toBeNull();
    expect(readShare([row("scroll", { times: 9 })], 4)).toBe(1);
  });

  test("where its views went: another page, this page again, or none, each against its views", () => {
    const next = nextOf(2021, 593, [row("~12", { views: 46 }), row("~3", { views: 21 }), row("(not set)", { views: 4 })]);
    expect(next.map((one) => [one.kind, one.key, one.views])).toEqual([
      ["again", null, 1428],
      ["left", null, 526],
      ["page", "~12", 46],
      ["page", "~3", 21],
    ]);
    expect(next.reduce((sum, one) => sum + one.share, 0)).toBeCloseTo(1);
    // Never below nothing, and nothing for a page no one viewed.
    expect(nextOf(10, 10, [row("~1", { views: 30 })]).find((one) => one.kind === "left")).toBeUndefined();
    expect(nextOf(0, 0, [])).toEqual([]);
  });

  test("each source on its own line, with its pages, time, reading, people back and conversions (PS2)", () => {
    const google = channelKey("Organic Search", "google");
    const typed = channelKey("Direct", "(direct)");
    const lines = sourcesOf(
      [row(google, { visits: 500, seconds: 19_000 }), row(typed, { visits: 70, seconds: 7840, counts: new Map([["generate_lead", 1]]) }), row(channelKey("Referral", "nobody.test"), {})],
      [row(google, { visits: 520 }), row(typed, { visits: 168 })],
      [row(joined(google, "new"), { visits: 475 }), row(joined(google, "returning"), { visits: 25 }), row(joined(typed, "returning"), { visits: 70 })],
      [row(joined(google, "page_view"), { times: 1700 }), row(joined(google, "scroll"), { times: 238 })],
      (one) => ({ conversions: one.counts.get("generate_lead") ?? 0, value: (one.counts.get("generate_lead") ?? 0) * 2000 }),
    );
    expect(lines).toEqual([
      { key: google, channel: "Organic Search", source: "google", visits: 500, pages: 1.04, time: 38, read: 238 / 500, back: 0.05, conversions: 0, value: 0 },
      { key: typed, channel: "Direct", source: "(direct)", visits: 70, pages: 2.4, time: 112, read: null, back: 1, conversions: 1, value: 2000 },
    ]);
  });

  test("age and gender where Google can tell: shares of the readers it placed, the website's beside them, conversions in each (PS7)", () => {
    const who = whoOf(
      [{ key: "18-24", count: 26 }, { key: "25-34", count: 12 }, { key: "unknown", count: 409 }],
      [{ key: "18-24", count: 143 }, { key: "25-34", count: 90 }, { key: "35-44", count: 56 }, { key: "45-54", count: 51 }, { key: "unknown", count: 2837 }],
      [{ key: "unknown", count: 1 }],
    );
    expect(who.readersPlaced).toBe(38);
    expect(who.rows.map((one) => [one.key, Math.round(one.share * 100), Math.round((one.websiteShare ?? 0) * 100), one.conversions])).toEqual([
      ["18-24", 68, 42, 0],
      ["25-34", 32, 26, 0],
    ]);
    // Its one conversion, from a visit Google couldn't place.
    expect(who).toMatchObject({ conversionsPlaced: 0, conversions: 1 });
    // A group with a conversion and no reader placed is still drawn.
    expect(whoOf([], [], [{ key: "female", count: 2 }]).rows).toEqual([{ key: "female", readers: 0, share: 0, websiteShare: null, conversions: 2 }]);
  });

  test("devices beside the website's, the days of the week Monday first, and the links out most clicked", () => {
    expect(devicesOf([row("mobile", { views: 1132 }), row("desktop", { views: 829 }), row("tablet", { views: 60 })], new Map([["desktop", 15_780], ["mobile", 6960], ["tablet", 467]]))
      .map((one) => [one.device, Math.round(one.share * 100), Math.round((one.websiteShare ?? 0) * 100)])).toEqual([["mobile", 56, 30], ["desktop", 41, 68], ["tablet", 3, 2]]);
    expect(weekdaysOf([row("0", { views: 204 }), row("1", { views: 352 })]).map((one) => one.day)).toEqual(["1", "2", "3", "4", "5", "6", "0"]);
    expect(weekdaysOf([row("0", { views: 204 })])[6]).toEqual({ day: "0", views: 204 });
    expect(clicksOf([
      row(joined("click", "https://en.wikipedia.org/wiki/Brand"), { times: 14 }),
      row(joined("file_download", "https://ronins.co.uk/prism.pdf"), { times: 3 }),
      row(joined("click", "(not set)"), { times: 9 }),
    ], 25)).toEqual([
      { kind: "click", url: "https://en.wikipedia.org/wiki/Brand", clicks: 14 },
      { kind: "download", url: "https://ronins.co.uk/prism.pdf", clicks: 3 },
    ]);
  });
});
