import { describe, expect, test } from "vitest";
import { COMPETING_RULE, brandWordsOf, competingDraft, competingForAssistant, competingFacts, competingGroups, decisionFor, isHome, variantOf, type CompetingPair, type GroupPage, type PageFigures } from "./insightCompeting";
import { editFinding } from "./insightEditor";
import { factsByKey } from "./insightFacts";

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

/**
 * Ronins' own two groups, 13 July to 10 October 2026 (Anthony, 12 October:
 * "it's recommending we keep app developers London … and merge in mobile app
 * developers which could be anywhere in the UK"; "we're talking about folding
 * a global phrase into … a minor county").
 */
describe("which page owns each search", () => {
  const ronins = (path: string, impressions: number, search: string, clicks = 0): CompetingPair => ({ search, page: `https://www.ronins.co.uk${path}`, clicks, impressions });
  const VOLUMES: Record<string, number> = {
    "mobile app developers": 4_400, "app developers": 1_300, "app developers uk": 720, "mobile app developers london": 480, "app developers near me": 480,
    "android app developers": 260, "web designers": 8_100, "web design surrey": 260, "web design guildford": 320, "web design london": 2_400,
  };
  const FIGURES: Record<string, PageFigures> = {
    "/app-developers-london/": { kind: "Service", type: "SERVICE", visits: 30, enquiries: 4, recent: 1, recentBefore: null, shownAll: 56_602, googleEnquiries: 2 },
    "/mobile-app-developers/": { kind: "Service", type: "SERVICE", visits: 36, enquiries: 0, recent: 0, recentBefore: null, shownAll: 53_039, googleEnquiries: 0 },
    "/android-app-development/": { kind: "Service", type: "SERVICE", visits: 6, enquiries: 0, recent: 0, recentBefore: null, shownAll: 6_341, googleEnquiries: 0 },
    "/web-design-surrey/": { kind: "Service", type: "SERVICE", visits: 26, enquiries: 5, recent: 1, recentBefore: null, shownAll: 33_655, googleEnquiries: 1 },
    "/web-design-london/": { kind: "Service", type: "SERVICE", visits: 66, enquiries: 1, recent: 0, recentBefore: null, shownAll: 95_861, googleEnquiries: 1 },
    "/hub/how-to-choose-a-web-design-agency/": { kind: "Content hub", type: "INFORMATIONAL", visits: 2, enquiries: 0, recent: 0, recentBefore: null, shownAll: 3_910, googleEnquiries: 0 },
  };
  const app = [
    ronins("/mobile-app-developers/", 2_391, "mobile app developers"), ronins("/app-developers-london/", 600, "mobile app developers"),
    ronins("/app-developers-london/", 2_989, "app developers"), ronins("/mobile-app-developers/", 2_200, "app developers"),
    ronins("/app-developers-london/", 1_617, "app developers uk"), ronins("/mobile-app-developers/", 289, "app developers uk"),
    ronins("/app-developers-london/", 474, "mobile app developers london"), ronins("/mobile-app-developers/", 112, "mobile app developers london"),
    ronins("/app-developers-london/", 728, "app developers near me"), ronins("/mobile-app-developers/", 943, "app developers near me"),
    ...["android app developers", "android app development company", "android app development uk"].flatMap((search) => [ronins("/android-app-development/", 300, search), ronins("/mobile-app-developers/", 200, search)]),
  ];
  const web = [
    ronins("/web-design-london/", 1_976, "web designers"), ronins("/web-design-surrey/", 400, "web designers"), ronins("/hub/how-to-choose-a-web-design-agency/", 300, "web designers"),
    ronins("/web-design-surrey/", 900, "web design surrey"), ronins("/web-design-london/", 300, "web design surrey"),
    ronins("/web-design-surrey/", 200, "web design guildford"), ronins("/web-design-london/", 150, "web design guildford"),
    ronins("/web-design-london/", 1_200, "web design london"), ronins("/web-design-surrey/", 200, "web design london"),
    ronins("/hub/how-to-choose-a-web-design-agency/", 300, "how to choose a web design agency"), ronins("/web-design-london/", 250, "how to choose a web design agency"), ronins("/web-design-surrey/", 100, "how to choose a web design agency"),
    ...["what does a web designer do", "web design agency tips"].flatMap((search) => [ronins("/hub/how-to-choose-a-web-design-agency/", 200, search), ronins("/web-design-london/", 200, search)]),
  ];
  const grouped = (pairs: CompetingPair[], offices: string[] = []) => competingGroups(input({
    pairs, brandWords: brandWordsOf("www.ronins.co.uk"), searchOf: (search) => ({ position: 20, volume: VOLUMES[search] ?? null }),
    pageOf: (path) => FIGURES[path], places: { homeIso: "GB", offices },
  }));
  const ownerOf = (groups: ReturnType<typeof competingGroups>, search: string) => {
    const found = groups.flatMap((group) => group.searches).find((entry) => entry.search === search);
    return [found?.owner, found?.why];
  };

  test("a search naming no place goes to the page for no one place; one naming London to London's", () => {
    const groups = grouped(app);
    expect(ownerOf(groups, "mobile app developers")).toEqual(["/mobile-app-developers/", ["NO_PLACE"]]);
    expect(ownerOf(groups, "app developers")).toEqual(["/mobile-app-developers/", ["NO_PLACE"]]);
    // The country alone names no one place.
    expect(ownerOf(groups, "app developers uk")).toEqual(["/mobile-app-developers/", ["NO_PLACE"]]);
    expect(ownerOf(groups, "mobile app developers london")).toEqual(["/app-developers-london/", ["PLACE"]]);
    // Two pages for no one place: the one whose words fit.
    expect(ownerOf(groups, "android app developers")).toEqual(["/android-app-development/", ["WORDS"]]);
  });

  test("nothing is merged that owns searches of its own, and the page owning the most searched keeps the group", () => {
    const groups = grouped(app);
    const group = groups.find((entry) => entry.pages.some((page) => page.path === "/mobile-app-developers/"))!;
    expect(group.owner).toBe("/mobile-app-developers/");
    expect(group.pages.map((page) => [page.path, page.decision])).toEqual([
      ["/mobile-app-developers/", "OWNER"], ["/app-developers-london/", "OWNER"], ["/android-app-development/", "OWNER"],
    ]);
  });

  test("\"near me\" goes to the page for a place the business has an office, else to the page for no one place", () => {
    expect(ownerOf(grouped(app, ["london"]), "app developers near me")).toEqual(["/app-developers-london/", ["NEAR"]]);
    expect(ownerOf(grouped(app), "app developers near me")).toEqual(["/mobile-app-developers/", ["NO_PLACE"]]);
  });

  test("a county's page owns its towns, a selling page a search to buy, and an article a question", () => {
    const groups = grouped(web);
    expect(ownerOf(groups, "web design surrey")).toEqual(["/web-design-surrey/", ["PLACE"]]);
    expect(ownerOf(groups, "web design guildford")).toEqual(["/web-design-surrey/", ["PLACE"]]);
    expect(ownerOf(groups, "web design london")).toEqual(["/web-design-london/", ["PLACE"]]);
    // Both selling pages are for a place: the article for no one place never takes a search to buy.
    expect(ownerOf(groups, "web designers")).toEqual(["/web-design-london/", ["SELLS", "GOOGLE"]]);
    expect(ownerOf(groups, "how to choose a web design agency")).toEqual(["/hub/how-to-choose-a-web-design-agency/", ["ARTICLE"]]);
    // London's page owns the most searched, so it keeps the group; Surrey's keeps its own.
    const [group] = groups;
    expect(group.owner).toBe("/web-design-london/");
    expect(group.pages.find((page) => page.path === "/web-design-surrey/")).toMatchObject({ decision: "OWNER", owns: 2, place: "surrey" });
  });

  test("Ask Hakken reads every group as kept, in the screens' words, and is told never to advise for itself", () => {
    const read = competingForAssistant(grouped(web).map((group) => ({ ...group, decidedBy: "RULE" as const })));
    expect(read.rule).toMatch(/Give it as written/);
    expect(read.rule).toMatch(/never your own advice/);
    const [group] = read.groups;
    expect(group).toMatchObject({ main_page: "/web-design-london/", decided_by: "the rule: the specialist hasn't looked at this group yet" });
    expect(group.pages.find((page) => page.page === "/web-design-surrey/")?.do).toBe("keep it for the 2 searches it should own");
    expect(group.searches.find((search) => search.search === "web design guildford")).toMatchObject({ should_own: "/web-design-surrey/", why: "names Guildford" });
  });

  test("the agents are told the same rule, kind and place first, and that volume never picks the owner", () => {
    expect(COMPETING_RULE).toMatch(/First the kind: a question goes to an article/);
    expect(COMPETING_RULE).toMatch(/How often a search is searched never decides which page owns it/);
  });
});

describe("each page's decision", () => {
  const page = (path: string, figures: Partial<GroupPage>): GroupPage => ({
    path, kind: "Service", type: "SERVICE", visits: 10, enquiries: 0, recent: 0, recentBefore: null, clicks: 0, shown: 100, searches: 5, decision: "OWNER", shownAll: 1_000, ...figures,
  });
  const owner = page("/brand-identity-agency/", { enquiries: 1 });

  test("merged when most of its showings are the owner's searches, even when it brings enquiries the redirect carries over", () => {
    expect(decisionFor(page("/brand-design-agency/", { shown: 605, shownAll: 1_536 }), owner)).toBe("MERGE");
    // Anthony, 12 October 2026: "I'm happy to merge pages that generate enquiries, that's valid in fixing cannibalisation".
    expect(decisionFor(page("/ux-consultancy/", { shown: 900, shownAll: 1_000, enquiries: 2 }), owner)).toBe("MERGE");
  });

  test("made clearly different when it has a topic of its own", () => {
    expect(decisionFor(page("/seo-agency/", { shown: 229, shownAll: 7_437 }), owner)).toBe("DIFFERENTIATE");
  });

  test("a page owning searches of its own is kept for them", () => {
    expect(decisionFor(page("/brand-design-agency/", { shown: 605, shownAll: 1_536, owns: 2 }), owner)).toBe("OWNER");
  });

  test("an article beside a page that sells keeps its place and links to it", () => {
    expect(decisionFor(page("/hub/brand-bible/", { type: "INFORMATIONAL" }), owner)).toBe("LINK");
  });
});

describe("a group written up as a finding", () => {
  test("every number is named by the group's own facts, so the Editor fills it, and what to do is the group's decisions", () => {
    const [group] = competingGroups(input());
    const facts = competingFacts(group, { from: "2026-07-13", to: "2026-10-10" });
    const draft = competingDraft(group);
    expect(draft.pattern).toBe("COMPETING_PAGES");
    expect(draft.headline).toBe("[[competing./brand-identity-agency/.pages]] of your pages split Google's searches for \"brand agency\": shown [[competing./brand-identity-agency/.shown]] times in 90 days for [[competing./brand-identity-agency/.clicks]] clicks.");
    expect(draft.action).toBe("Give each search one page: keep /brand-identity-agency/ and /brand-design-agency/ for the searches each should own, each made clearly about its own.");
    expect(facts.find((fact) => fact.key === "competing./brand-identity-agency/.shown")).toMatchObject({ value: 4_500, source: "searchConsole", from: "2026-07-13" });
    const checked = editFinding(draft, factsByKey(facts));
    expect(checked.ok && checked.filled.headline).toBe("2 of your pages split Google's searches for \"brand agency\": shown 4,500 times in 90 days for 5 clicks.");
    expect(draft.checkInDays).toBe(56);
    expect(draft.howWeKnow).not.toMatch(/Hakken|DataForSEO/);
  });

  test("the specialist's own headline and story are used when it wrote them", () => {
    const [group] = competingGroups(input());
    const draft = competingDraft(group, { headline: "Two branding pages split [[competing./brand-identity-agency/.split]] searches.", story: "Each should own its own." });
    expect(draft.headline).toBe("Two branding pages split [[competing./brand-identity-agency/.split]] searches.");
    expect(draft.action).toMatch(/^Give each search one page/);
  });

  test("the home page is never in a group", () => {
    expect(isHome("/")).toBe(true);
    expect(isHome("/index.html")).toBe(true);
    expect(isHome("/home-improvements/")).toBe(false);
  });
});
