import { describe, expect, test } from "vitest";
import { expectWords } from "@/src/test/seenWords";
import { assetTarget, assetsSees, auditSees, overviewSees, problemSees, websitesSees, yourPagesSees } from "./site";

/** What Hakken sees on a website's own screens and the Websites list (discovery-detail-and-hakken-sees-plan.md §6). */
describe("Overview", () => {
  test("visits, searches and links over the dates chosen", () => {
    const box = overviewSees({
      before: { estimatedTraffic: 900, rankedKeywordsTotal: 1200, referringDomains: 120 },
      points: [{ estimatedTraffic: 840.4, rankedKeywordsTotal: 1150 }, { referringDomains: 112 }],
    });
    expect(box).toEqual({
      says: [{ code: "visitsDown", a: 60, b: 840 }, { code: "searchesDown", a: 50, b: 1150 }, { code: "linksDown", a: 8, b: 112 }],
      steps: [
        { code: "seeLosses", link: "newAndLostKeywords", to: { segment: "keywords/new-lost" } },
        { code: "seeLostLinks", link: "newAndLost", to: { segment: "backlinks/new-lost" } },
      ],
    });
    expectWords("overview", box);
  });

  test("growing, steady, and nothing held", () => {
    const up = overviewSees({ before: null, points: [{ estimatedTraffic: 100, rankedKeywordsTotal: 10, referringDomains: 5 }, { estimatedTraffic: 100, rankedKeywordsTotal: 12, referringDomains: 6 }] });
    expect(up).toEqual({
      says: [{ code: "visitsSteady", a: 100 }, { code: "searchesUp", a: 2, b: 12 }, { code: "linksUp", a: 1, b: 6 }],
      steps: [{ code: "seeTopPages", link: "topPages", to: { segment: "keywords/pages" } }],
    });
    expectWords("overview", up);
    expect(overviewSees({ before: null, points: [{ estimatedTraffic: 1 }] }).says).toEqual([{ code: "none" }]);
    expect(overviewSees(undefined).says).toEqual([{ code: "none" }]);
    expectWords("overview", { says: [{ code: "none" }, { code: "visitsUp", a: 1, b: 2 }], steps: [] });
  });
});

describe("Your assets", () => {
  const asset = (name: string, kind: string, stage: "NOT_THERE" | "NOT_SEEN" | "SEEN_NOT_CHOSEN" | "WORKING", key = `${kind}:${name}`) => ({ key, kind, name, stage });

  test("working and losing, the stage most are lost at, and the first to fix", () => {
    const box = assetsSees([
      asset("ronins.co.uk", "WEBSITE", "WORKING"), asset("Ronins, Guildford", "PROFILE", "SEEN_NOT_CHOSEN", "PROFILE:office1"),
      asset("Trustpilot", "REVIEW_SITE", "SEEN_NOT_CHOSEN"), asset("clutch.co", "DIRECTORY", "NOT_THERE"),
    ]);
    expect(box).toEqual({
      says: [{ code: "stages", a: 1, b: 2, c: 1 }, { code: "mostAt.SEEN_NOT_CHOSEN", a: 2 }],
      steps: [{ code: "fix.SEEN_NOT_CHOSEN", text: "Ronins, Guildford", link: "seeAsset", to: { segment: "local", filters: { office: "office1" } } }],
    });
    expectWords("assets", box);
    for (const stage of ["NOT_THERE", "NOT_SEEN"] as const) {
      expectWords("assets", { says: [{ code: `mostAt.${stage}`, a: 1 }], steps: [{ code: `fix.${stage}`, text: "x", link: "seeAsset", to: { segment: "" } }] });
    }
  });

  test("every asset opens where it is worked on; all working; none", () => {
    expect(["PAGE", "PROFILE", "REVIEW_SITE", "AI_APP", "AI_OVERVIEW", "DIRECTORY", "PRESS", "WEBSITE"].map((kind) => assetTarget({ key: `${kind}:k1`, kind, name: "/n/" }))).toEqual([
      { record: "page", key: "/n/" }, { segment: "local", filters: { office: "k1" } }, { segment: "reviews" }, { segment: "ai/answers" },
      { segment: "radar/gaps" }, { record: "website", key: "/n/" }, { segment: "mentions" }, { segment: "" },
    ]);
    const working = assetsSees([asset("a", "WEBSITE", "WORKING")]);
    expect(working).toEqual({ says: [{ code: "stages", a: 1, b: 0, c: 0 }, { code: "allWorking" }], steps: [] });
    expectWords("assets", working);
    expect(assetsSees([]).says).toEqual([{ code: "none" }]);
  });
});

describe("Your pages", () => {
  const summary = { pages: 120, shown: 80, neverShown: 40, notInSitemap: 12, notCrawled: 3, sitemapRead: true };

  test("pages never shown, missing from the sitemap, and not reached — the two biggest", () => {
    const box = yourPagesSees(true, summary);
    expect(box).toEqual({
      says: [{ code: "pages", a: 120, b: 80 }, { code: "neverShown", a: 40 }, { code: "notInSitemap", a: 12 }],
      steps: [
        { code: "see.neverShown", a: 40, link: "seePages", to: { segment: "your-pages", filters: { filter: "neverShown" } } },
        { code: "see.notInSitemap", a: 12, link: "seePages", to: { segment: "your-pages", filters: { filter: "notInSitemap" } } },
      ],
    });
    expectWords("yourPages", box);
    expectWords("yourPages", { says: [{ code: "notCrawled", a: 3 }], steps: [{ code: "see.notCrawled", a: 3, link: "seePages", to: { segment: "your-pages" } }] });
  });

  test("a sitemap not yet read is not missing pages; nothing missing; not listed; a competitor", () => {
    expect(yourPagesSees(true, { ...summary, neverShown: 0, notCrawled: 0, sitemapRead: false }).says).toEqual([{ code: "pages", a: 120, b: 80 }, { code: "nothingMissing" }]);
    expectWords("yourPages", { says: [{ code: "nothingMissing" }, { code: "notOwn" }, { code: "none" }], steps: [] });
    expect(yourPagesSees(true, null).says).toEqual([{ code: "none" }]);
    expect(yourPagesSees(false, null).says).toEqual([{ code: "notOwn" }]);
  });
});

describe("Site audit", () => {
  const label = (check: string) => ({ no_description: "No description", broken_links: "Broken links" })[check] ?? check;

  test("the pages read and the score, and the worst problem — errors before warnings", () => {
    const box = auditSees({
      pagesCrawled: 240, onPageScore: 87, turnedAway: null,
      issues: [{ check: "no_description", pages: 90, severity: "WARNING" }, { check: "broken_links", pages: 4, severity: "ERROR" }, { check: "x", pages: 1, severity: "ERROR" }],
    }, label);
    expect(box).toEqual({
      says: [{ code: "crawled", a: 240, b: 87 }, { code: "worst", text: "Broken links", a: 4 }, { code: "errors", a: 2 }],
      steps: [{ code: "fix", text: "Broken links", link: "seeProblem", to: { record: "problem", key: "broken_links" } }],
    });
    expectWords("audit", box);
  });

  test("turned away, no score, no problems, not crawled", () => {
    const away = auditSees({ pagesCrawled: 3, onPageScore: null, turnedAway: "BLOCKED", issues: [] }, label);
    expect(away).toEqual({ says: [{ code: "turnedAway", a: 3 }, { code: "noProblems" }], steps: [] });
    expectWords("audit", away);
    expect(auditSees({ pagesCrawled: 3, onPageScore: null, turnedAway: null, issues: [] }, label).says[0]).toEqual({ code: "crawledNoScore", a: 3 });
    expectWords("audit", { says: [{ code: "crawledNoScore", a: 3 }, { code: "notCrawled" }], steps: [] });
    expect(auditSees(null, label).says).toEqual([{ code: "notCrawled" }]);
  });
});

describe("One problem", () => {
  test("the pages it is on, broken links, and the first page to fix", () => {
    const box = problemSees([{ page: "/old/", brokenLinks: [{}, {}] }, { page: "/", brokenLinks: [{}] }], 14, "Broken links");
    expect(box).toEqual({
      says: [{ code: "pages", text: "Broken links", a: 14 }, { code: "brokenLinks", a: 3 }],
      steps: [{ code: "fixFirst", text: "/old/", link: "seePage", to: { record: "page", key: "/old/" } }],
    });
    expectWords("auditProblem", box);
    const none = problemSees([], null, "Broken links");
    expect(none.says).toEqual([{ code: "none", text: "Broken links" }]);
    expectWords("auditProblem", none);
  });
});

describe("Websites", () => {
  const site = (siteId: string, host: string, relationship: string, rankedUp: number | null, rankedDown: number | null, checked = true) => ({ siteId, host, relationship, checked, rankedUp, rankedDown });

  test("the websites held, and the one that moved most", () => {
    const box = websitesSees([site("s1", "ronins.co.uk", "OWNED", 12, 30), site("s2", "brightside.co.uk", "TRACKED", 40, 2)]);
    expect(box).toEqual({
      says: [{ code: "websites", a: 1, b: 1 }, { code: "mostDown", text: "ronins.co.uk", a: 30, b: 12 }, { code: "mostUp", text: "brightside.co.uk", a: 40 }],
      steps: [{ code: "open", text: "ronins.co.uk", link: "openWebsite", to: { url: "/app/sites/s1" } }],
    });
    expectWords("websites", box);
  });

  test("not checked; none held", () => {
    const fresh = websitesSees([site("s1", "ronins.co.uk", "OWNED", null, null, false)]);
    expect(fresh).toEqual({ says: [{ code: "websites", a: 1, b: 0 }, { code: "notChecked" }], steps: [] });
    expectWords("websites", fresh);
    expect(websitesSees([]).says).toEqual([{ code: "none" }]);
  });
});
