import { describe, expect, test } from "vitest";
import { campaignForEye, CAME_FROM_CODES, CAME_FROM_WORDS, cameFromOf, cameFromWords, campaignNameWords, hasNoName, isCameFromCode } from "./campaignNames";

describe("where a campaign's link was, as a person says it", () => {
  test.each([
    ["google / cpc", "googleAds"],
    ["google / organic", "googleFreeListing"],
    ["fb / paid", "facebookAd"],
    ["facebook / cpc", "facebookAd"],
    ["ig / paid", "instagramAd"],
    ["bing / cpc", "microsoftAds"],
    ["GMB / organic", "googleBusinessProfile"],
    ["Email marketing software / email", "email"],
    ["brevo / email", "email"],
    ["Korda Clothing Subscribers / email", "email"],
    ["trustpilot / company_profile", "trustpilot"],
    ["pinterest / social", "pinterest"],
    ["Pinterest / Social", "pinterest"],
    ["(not set) / (not set)", "notKnown"],
    ["", "notKnown"],
  ])("%s is %s", (source, code) => {
    expect(cameFromOf(source)).toBe(code);
  });

  test("any other source stays as it was written", () => {
    expect(cameFromOf("linkedin / social")).toBe("linkedin");
    expect(cameFromOf("John Catt / web")).toBe("John Catt");
    expect(cameFromOf("ShoptheCountryKitchenLook / Blog")).toBe("ShoptheCountryKitchenLook");
    expect(cameFromOf("fb / social")).toBe("fb");
    expect(cameFromOf("google / referral")).toBe("google");
  });

  test("a source with a slash of its own keeps it", () => {
    expect(cameFromOf("a/b / social")).toBe("a/b");
  });

  test("every code has words", () => {
    for (const code of CAME_FROM_CODES) {
      expect(isCameFromCode(code)).toBe(true);
      expect(CAME_FROM_WORDS[code].length).toBeGreaterThan(0);
    }
    expect(isCameFromCode("linkedin")).toBe(false);
    expect(cameFromWords("googleAds")).toBe("Google Ads");
    expect(cameFromWords("linkedin")).toBe("linkedin");
  });
});

describe("a campaign's name", () => {
  test("only a number means it has no name", () => {
    expect(hasNoName("52536031490414")).toBe(true);
    expect(hasNoName("120240126293690587")).toBe(true);
    expect(hasNoName("Performance Max > Zombies")).toBe(false);
    expect(hasNoName("Black Friday 2025")).toBe(false);
    expect(hasNoName("2025")).toBe(false);
  });

  test("it says where the link was, and any other name stays as tagged", () => {
    expect(campaignNameWords("52536031490414", "facebookAd")).toBe("Facebook ad with no name");
    expect(campaignNameWords("52536031490414", "linkedin")).toBe("linkedin with no name");
    expect(campaignNameWords("Shopping > Target Brands - High Perfroming", "googleAds")).toBe("Shopping > Target Brands - High Perfroming");
  });
});

describe("what the eye may read of a campaign", () => {
  test("holds only what the page shows, with the page's names", () => {
    const row = { visits: 10, visitsBefore: 8, change: 0.25, purchases: 1, purchasesBefore: null, conversions: 2, conversionsBefore: 1, conversionRate: 0.2, bounceRate: 0.3, engagementRate: 0.7, fewVisits: true, views: 99, timePerVisit: 240, people: 7, value: 100, revenue: 100 };
    const seen = campaignForEye(row, "Facebook ad with no name", "Facebook ad");
    expect(seen).toMatchObject({ label: "Facebook ad with no name", source: "Facebook ad", visits: 10, purchases: 1 });
    for (const hidden of ["views", "timePerVisit", "people", "value", "revenue"]) expect(seen).not.toHaveProperty(hidden);
  });
});
