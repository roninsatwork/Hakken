import { describe, expect, test } from "vitest";
import { brandWordsOf, competingFinding, competingGroups, decisionFor, isHome, variantOf, type CompetingPair, type GroupPage, type PageFigures } from "./insightCompeting";

/**
 * Keyword cannibalisation (insights-intelligence-plan.md phase 3): the
 * website's pages gathered into groups by the searches they split, the home
 * page and the website's own name left out, each group's owner and every
 * other page's decision, and what a top-three place would bring.
 */

const pair = (search: string, page: string, impressions: number, clicks = 0): CompetingPair => ({ search, page: `https://acme-shop.test${page}`, clicks, impressions });

/** Searches two branding pages split evenly, one the article only touches, the home page and the brand everywhere. */
function pairs(): CompetingPair[] {
  const out: CompetingPair[] = [];
  for (const search of ["brand agency", "branding agency", "brand design agency", "brand identity agency", "branding company"]) {
    out.push(pair(search, "/brand-identity-agency/", 500, 1), pair(search, "/brand-design-agency/", 400), pair(search, "/", 900, 3));
  }
  // The article is shown for the branding searches, but with a twentieth of the showings: it touches them, it doesn't split them.
  out.push(pair("brand agency", "/hub/brand-bible/", 40));
  out.push(pair("acme shop branding", "/brand-identity-agency/", 300, 10), pair("acme shop branding", "/brand-design-agency/", 300, 2));
  return out;
}

const PAGES: Record<string, PageFigures> = {
  "/brand-identity-agency/": { kind: "Service", type: "SERVICE", visits: 26, enquiries: 1, recent: 1, recentBefore: 0, shownAll: 3_000 },
  "/brand-design-agency/": { kind: "Service", type: "SERVICE", visits: 9, enquiries: 0, recent: 0, recentBefore: 0, shownAll: 4_000 },
  "/hub/brand-bible/": { kind: "Content hub", type: "INFORMATIONAL", visits: 600, enquiries: 3, recent: 1, recentBefore: 2, shownAll: 50_000 },
};
const input = (overrides: Partial<Parameters<typeof competingGroups>[0]> = {}) => ({
  pairs: pairs(),
  brandSearches: new Set<string>(),
  brandWords: brandWordsOf("acme-shop.test"),
  searchOf: (search: string) => ({ position: 14, volume: search === "branding agency" ? 2_400 : null }),
  pageOf: (path: string) => PAGES[path] ?? { kind: null, type: "NOT_SORTED", visits: 0, enquiries: 0, recent: 0, recentBefore: null },
  clickRates: { top3: 0.1, "11to20": 0.01 },
  websiteRate: 0.04,
  months: 3,
  ...overrides,
});

describe("groups of competing pages", () => {
  test("two pages splitting five searches are one group, without the home page or the website's own name", () => {
    const groups = competingGroups(input());
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.pages.map((page) => page.path)).toEqual(["/brand-identity-agency/", "/brand-design-agency/"]);
    expect(group).toMatchObject({ owner: "/brand-identity-agency/", shared: 5, split: 5, shown: 4_500, clicks: 5, enquiries: 1, sure: "ROUGH" });
    // Named by the most shown search its owner is shown for; "acme shop branding" is the website's own name.
    expect(group.searches.map((search) => search.search)).not.toContain("acme shop branding");
    expect(group.name).toBe("brand agency");
  });

  test("a top-three place is priced from how often people search, close variants once, at the website's rate below 100 visits", () => {
    const [group] = competingGroups(input());
    const branding = group.searches.find((search) => search.search === "branding agency")!;
    // 2,400 a month at the website's 10% top-three rate, less the clicks it has (1 in three months).
    expect(branding.gain).toBeCloseTo(240 - 1 / 3);
    // Without a volume, from times shown: 900 in three months at 10% against the 1% it has at 14th.
    const brand = group.searches.find((search) => search.search === "brand agency")!;
    expect(brand.gain).toBeCloseTo(300 * 0.09);
    expect(group.gainEnquiries).toBeCloseTo(Math.round(group.gainClicks! * 0.04 * 10) / 10);
    expect(variantOf("website designers")).toBe(variantOf("web designers"));
  });

  test("a group bigger than six is split again on stronger links, and no page is dropped", () => {
    const many: CompetingPair[] = [];
    const paths = ["/a/", "/b/", "/c/", "/d/", "/e/", "/f/", "/g/", "/h/"];
    // Two tight sets of four, joined by three weak searches between /d/ and /e/.
    for (const [set, members] of [["one", paths.slice(0, 4)], ["two", paths.slice(4)]] as const) {
      for (let n = 0; n < 6; n += 1) for (const path of members) many.push(pair(`${set} search ${n}`, path, 100));
    }
    for (let n = 0; n < 3; n += 1) many.push(pair(`bridge ${n}`, "/d/", 100), pair(`bridge ${n}`, "/e/", 100));
    const groups = competingGroups(input({ pairs: many, brandWords: [] }));
    expect(groups.map((group) => group.pages.map((page) => page.path).sort())).toEqual([["/a/", "/b/", "/c/", "/d/"], ["/e/", "/f/", "/g/", "/h/"]]);
  });
});

describe("each page's decision", () => {
  const page = (path: string, figures: Partial<GroupPage>): GroupPage => ({
    path, kind: "Service", type: "SERVICE", visits: 10, enquiries: 0, recent: 0, recentBefore: null, clicks: 0, shown: 100, searches: 5, decision: "OWNER", shownAll: 1_000, ...figures,
  });
  const owner = page("/brand-identity-agency/", { enquiries: 1 });

  test("merged when most of its showings are the owner's searches and it brings no enquiries", () => {
    expect(decisionFor(page("/brand-design-agency/", { shown: 605, shownAll: 1_536 }), owner)).toBe("MERGE");
  });

  test("made clearly different when it has a topic of its own, or its own enquiries", () => {
    expect(decisionFor(page("/seo-agency/", { shown: 229, shownAll: 7_437 }), owner)).toBe("DIFFERENTIATE");
    expect(decisionFor(page("/ux-consultancy/", { shown: 900, shownAll: 1_000, enquiries: 2 }), owner)).toBe("DIFFERENTIATE");
  });

  test("an article beside a page that sells keeps its place and links to it", () => {
    expect(decisionFor(page("/hub/brand-bible/", { type: "INFORMATIONAL" }), owner)).toBe("LINK");
  });
});

describe("a group written up as a finding", () => {
  test("every number is the group's own, with the facts it rests on and the day it is checked", () => {
    const [group] = competingGroups(input());
    const finding = competingFinding(group, { from: "2026-07-13", to: "2026-10-10" }, "2026-12-07");
    expect(finding.pattern).toBe("COMPETING_PAGES");
    expect(finding.headline).toBe("2 of your pages split Google's searches for \"brand agency\": shown 4,500 times in 90 days for 5 clicks.");
    expect(finding.action).toBe("Make /brand-identity-agency/ the page for these searches: merge /brand-design-agency/ into it, with a redirect.");
    expect(finding.facts.find((fact) => fact.key === "competing./brand-identity-agency/.shown")).toMatchObject({ value: 4_500, source: "searchConsole", from: "2026-07-13" });
    expect(finding.checkOn).toBe("2026-12-07");
    expect(finding.howWeKnow).not.toMatch(/Hakken|DataForSEO/);
  });

  test("the home page is never in a group", () => {
    expect(isHome("/")).toBe(true);
    expect(isHome("/index.html")).toBe(true);
    expect(isHome("/home-improvements/")).toBe(false);
  });
});
