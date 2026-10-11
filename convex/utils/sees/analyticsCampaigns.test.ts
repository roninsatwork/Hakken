import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import type { ListRowFacts } from "./analytics";
import { campaignsSees } from "./analyticsCampaigns";

/**
 * What Hakken sees on Campaigns (google-analytics-plan.md §18.7): the box
 * worked out from Ronins' campaigns as board 17 reads them, with words in
 * English and Italian for every code.
 */

const campaign = (label: string, visits: number, conversions = 0): ListRowFacts => ({
  key: label, label, visits, engagementRate: null, views: visits, conversions, value: 0, change: null, conversionsBefore: null,
});

describe("17 · Campaigns", () => {
  test("few visits tagged and none converted; tag the links", () => {
    const box = campaignsSees([campaign("ai-agents-launch", 7), campaign("clutch-profile", 6), campaign("founder-posts", 3)], 792);
    expect(box).toEqual({
      says: [{ code: "fewTagged", a: 16, b: 808, c: 792 }, { code: "noneConverted" }],
      steps: [{ code: "tagLinks", link: "channels", to: { segment: "channels" } }],
    });
    expectAnalyticsWords("campaigns", box);
  });

  test("most visits tagged: the share, the campaign converting most, a busy one converting nothing", () => {
    const box = campaignsSees([campaign("spring-sale", 400, 12), campaign("newsletter", 120)], 200);
    expect(box).toEqual({
      says: [{ code: "tagged", a: 520, b: 520 / 720 }, { code: "best", text: "spring-sale", a: 12 }, { code: "quiet", text: "newsletter", a: 120 }],
      steps: [{ code: "seeLanding", text: "newsletter", link: "landingPages", to: { segment: "landing-pages" } }],
    });
    const none = campaignsSees([], 808);
    expect(none).toEqual({ says: [{ code: "none", a: 808 }], steps: [{ code: "tagLinks", link: "channels", to: { segment: "channels" } }] });
    for (const shown of [box, none]) expectAnalyticsWords("campaigns", shown);
  });
});
