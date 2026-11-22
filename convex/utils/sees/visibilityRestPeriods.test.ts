import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import { bandSquareSees } from "./eyeData/visibilityKeywords";
import { allBacklinksSees, anchorSees, brokenLinksSees, linkingWebsiteSees, linkingWebsitesSees } from "./eyeData/visibilityLinkLists";
import { activitySees, businessSees, listingsSees, mapsSees, nearbySees, profileSees } from "./eyeData/visibilityLocal";
import { questionSees, sourceWebsiteSees, sourcesSees, yourPagesEye } from "./eyeData/visibilityRadar";
import { findingWords } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

/**
 * Sixteen Visibility screens whose eye found nothing until 22 November 2026 (visibility-16-eyes; AGENTS.md, "What Hakken
 * Sees On A Screen": "never weak, empty or broken on any page, for any dates"), on every period the date menu offers. Each
 * page's figures are built the way the page builds them (`eyeData/visibilityLinkLists.ts`, `visibilityLocal.ts`,
 * `visibilityRadar.ts`, `visibilityKeywords.ts`), in the screens' own English words, cut as the eye cuts them, and read by
 * its own rules (`own/visibilityLinkLists.ts`, `visibilityLocal.ts`, `visibilityRadar.ts`, `visibilityBandsAndPages.ts`).
 *
 * The figures are Ronins' (its address read as ronins.example, as the owner's own domain stays out of fixtures), as saved on dev on 22 November 2026 (`roninsVisibilityRest.json`). Fifteen of the
 * screens show the newest check, list or month whatever the dates, so their figures are the same on every period and must
 * find their headline and four things or more on each. Rivals' activity counts the dates: its answers were saved for each
 * period, and a quiet week (no rival posted) must still find four things. One business counts its posts over the dates.
 */

type Row = Record<string, unknown>;
type Period = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last3Months" | "last6Months" | "last12Months";
const PERIODS: readonly Period[] = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"];
type Span = { from: string; to: string };
const HELD = readFixture("roninsVisibilityRest") as Record<string, never> & { activity: { lines: never[]; periods: Record<Period, Row & { span: Span; before: Span }> } };
const HOST = "ronins.example";

const names = en.sites.seesNames;
const kinds = en.sites.radar.sources.kinds as Record<string, string>;
const kindName = (kind: string) => kinds[kind] ?? kind;
const bands = en.sites.overview.bands as Record<string, string>;
const details = en.sites.local.profile.details.names as Record<string, string>;
const noAnchor = en.sites.backlinksAnchors.noAnchor;

/** Each finding in words, as Jev and the writer read them, with the eye held to its promises on the page. */
function said(screen: string, data: unknown): string[] {
  expect(data, `${screen}: the builder handed nothing`).toBeTruthy();
  expectEyeHolds(screen, data);
  const lines = pageFindings(screen, pageDataFor(data, screen)).map(findingWords);
  // `SHOW_FINDINGS=1 npx vitest run … --silent=false` prints every page's findings, to read them as a business owner would.
  if (process.env.SHOW_FINDINGS) console.log(`${screen}\n  ${lines.join("\n  ")}`);
  return lines;
}

/** Never guessed money, never a code or a gap where a name should be. */
function expectClean(lines: readonly string[]) {
  for (const line of lines) {
    expect(line, line).not.toMatch(/\$|£|cost|worth|spend|per click|cpc/i);
    expect(line, line).not.toMatch(/undefined|NaN|null|\bnav\b|\bYOURS\b|\bRIVAL\b|\bWEBSITE\b|\bFORUM\b|PHOTOS_ADDED|RATING_CHANGE/);
    expect(line, line).not.toMatch(/\b[0-9a-z]{32}\b/);
  }
}

/** A page's headline first among its findings, and at least `least` things in all. */
function expectHeadline(lines: readonly string[], headline: RegExp, least = 4) {
  expectClean(lines);
  expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(least);
  expect(lines.some((line) => headline.test(line)), lines.join("\n")).toBe(true);
}

/** Each screen's figures, built as the screen builds them, for a period of the date menu. */
function screens(period: Period): Record<string, unknown> {
  const activity = HELD.activity.periods[period];
  return {
    "visibility.backlinksDomains": linkingWebsitesSees(HELD.referringDomains, HELD.linkTotals, { linkingNow: names.linkingNow, stoppedLinking: names.stoppedLinking }),
    "visibility.backlinksDomain": linkingWebsiteSees(HELD.linkingWebsite, HELD.linkTotals, { noAnchor, followedHeld: names.followedHeld, lostHeld: names.lostHeld }),
    "visibility.backlinksBroken": brokenLinksSees(HELD.brokenBacklinks, HELD.linkTotals, { brokenLinks: names.brokenLinks, brokenFollowed: names.brokenFollowed, brokenWebsites: names.brokenWebsites }),
    "visibility.backlinksAll": allBacklinksSees(HELD.backlinks, HELD.linkTotals, { lostLinks: names.lostLinks, lostStrongest: names.lostStrongest, redirectedLinks: names.redirectedLinks, notFollowedLinks: names.notFollowedLinks }),
    "visibility.backlinksAnchor": anchorSees(HELD.anchorRecord, HELD.linkTotals, { noAnchor, wholeWebsite: names.wholeWebsite }),
    "visibility.keywordsBandsMoved": bandSquareSees(HELD.bandMovedDown, HELD.bandMoves, { from: "p11_20", to: "p21_50" }, { square: `From ${bands.p11_20} to ${bands.p21_50}`, from: bands.p11_20, to: bands.p21_50 }),
    "visibility.localProfile": profileSees(HELD.localProfile, (detail) => details[detail] ?? detail, { searchesChecked: names.searchesChecked, rivalsAverage: names.rivalsAverage, reviewsAnswered: names.reviewsAnswered, detailsToFix: names.detailsToFix }),
    "visibility.localMaps": mapsSees(HELD.localMaps, { searchesChecked: names.searchesChecked }),
    "visibility.localActivity": activitySees({ ...activity, lines: HELD.activity.lines } as never, { yourRivals: names.yourRivals, you: HOST }),
    "visibility.localListings": listingsSees(HELD.localListings, { yourOffices: names.yourOffices, rivalsAhead: names.rivalsAhead }),
    "visibility.localMarket": nearbySees(HELD.localMarket, { moreReviewsNearby: names.moreReviewsNearby }),
    "visibility.business": businessSees(HELD.businessAirSocial, "2026-11-22", { you: HOST }),
    "visibility.question": questionSees(HELD.radarQuestion, kindName, HOST, { yourRivals: names.yourRivals }),
    "visibility.radarSources": sourcesSees(HELD.radarSources, kindName, { namingYou: names.namingYou, neverBesideYou: names.neverBesideYou, besideRivals: names.besideRivals }),
    "visibility.website": sourceWebsiteSees(HELD.radarWebsite, kindName, { besideRivals: names.besideRivals, pagesNamingYou: names.pagesNamingYou }),
    "visibility.yourPages": yourPagesEye(HELD.yourPages, { shownOnGoogle: names.shownOnGoogle, neverShown: names.neverShown, notInSitemap: names.notInSitemap, ranking: names.ranking, notCrawled: names.notCrawled }),
  };
}

/** Each screen's headline, as its first finding says it. */
const HEADLINES: Record<string, RegExp> = {
  "visibility.backlinksDomains": /^Websites linking to you now holds 9\d(\.\d)?% of the list's linking websites\.$/,
  "visibility.backlinksDomain": /^mei\.org\.uk holds 28\.1% of the list's links\.$/,
  "visibility.backlinksBroken": /^Broken links: 1 of all 6972 links, 0\.01%\.$/,
  "visibility.backlinksAll": /^Links now lost holds \d+(\.\d)?% of the list's links\.$/,
  "visibility.backlinksAnchor": /^Website by Ronins holds 32\.2% of the list's links\.$/,
  "visibility.keywordsBandsMoved": /^From 11–20 to 21–50: searches 2, against 180 for 21–50\.$/,
  "visibility.localProfile": /^Ronins: searches whose map of local businesses shows it 0, against 2 for The searches checked\.$/,
  "visibility.localMaps": /^Ronins: searches whose map of local businesses shows it 0, against 2 for The searches checked\.$/,
  "visibility.localActivity": /^Your rivals: posts \d+, against 0 for ronins\.example\.$/,
  "visibility.localListings": /^Your offices: reviews 31, against 64 for Air Social\.$/,
  "visibility.localMarket": /^Businesses near you with more reviews holds 8\.3% of the list's businesses of your kind nearby\.$/,
  "visibility.business": /^Air Social: reviews 64, against 15 for ronins\.example\.$/,
  "visibility.question": /^ronins\.example holds 100% of the list's businesses the answer names\.$/,
  "visibility.radarSources": /^Websites cited in answers naming you holds 37\.8% of the list's websites\.$/,
  "visibility.website": /^reddit\.com: times cited beside you 35, against 101 for Beside your rivals\.$/,
  "visibility.yourPages": /^Pages Google showed in the last 90 days holds 89\.6% of the list's pages\.$/,
};

describe("sixteen Visibility screens find their headline and four things on every period (Ronins, 22 November 2026)", () => {
  for (const period of PERIODS) {
    test(period, () => {
      // Every screen read first, then each held to its headline: a failure names every screen's findings, not the first.
      const read = Object.entries(screens(period)).map(([screen, data]) => [screen, said(screen, data)] as const);
      for (const [screen, lines] of read) expectHeadline(lines, HEADLINES[screen]);
    });
  }
});

describe("the screens' other shapes on Ronins' figures", () => {
  test("a square of searches new to the list has no place before, so it says each one's place now and the band it joined", () => {
    const lines = said("visibility.keywordsBandsMoved", bandSquareSees(HELD.bandMovedNew, HELD.bandMoves, { from: "none", to: "p04_10" }, { square: `Newly ranking in ${bands.p04_10}`, from: null, to: bands.p04_10 }));
    expectHeadline(lines, /^Newly ranking in 4–10: searches 1, against 182 for 4–10\.$/, 3);
    expect(lines.some((line) => /biggest (climb|drop)/.test(line)), lines.join("\n")).toBe(false);
  });

  test("a business that hasn't posted for years still sets its reviews and its map searches beside yours", () => {
    const lines = said("visibility.business", businessSees(HELD.businessWebsiteSpace, "2026-11-22", { you: HOST }));
    expectHeadline(lines, /^The Website Space: reviews 39, against 15 for ronins\.example\.$/, 3);
    expect(lines.some((line) => /posts on Google/.test(line)), lines.join("\n")).toBe(false);
  });

  test("the brand question names you first and sets your page among the reference and video pages it quotes", () => {
    const lines = said("visibility.question", questionSees(HELD.radarQuestionBrand, kindName, HOST, { yourRivals: names.yourRivals }));
    expectHeadline(lines, /^ronins\.example holds 100% of the list's businesses the answer names\.$/);
  });

  test("a linking website's screen hands its eye figures at last: before 22 November it handed none", () => {
    const handed = pageDataFor(screens("lastMonth")["visibility.backlinksDomain"], "visibility.backlinksDomain") as Row;
    expect(handed).toMatchObject({ linkingSite: { name: "mei.org.uk", backlinks: 1958 }, whole: { backlinks: 6972 } });
  });

  test("a quiet week says who posted last and who has gone quiet, never that nothing happened", () => {
    for (const period of ["thisWeek", "lastWeek"] as const) {
      const lines = said("visibility.localActivity", screens(period)["visibility.localActivity"]);
      expect(lines.filter((line) => /days since its last post/.test(line)).length, lines.join("\n")).toBe(2);
      expect(lines.some((line) => /^Air Social: posts in 12 months 10/.test(line)), lines.join("\n")).toBe(true);
    }
  });

  test("Sources names the place your rivals are quoted and you never are, never a rival's own site", () => {
    const lines = said("visibility.radarSources", screens("lastMonth")["visibility.radarSources"]);
    expect(lines).toContain("techradar.com: times cited beside you 0, against 34 for Beside your rivals.");
    expect(lines.some((line) => /^plugandplaydesign\.co\.uk: times cited beside you 0/.test(line)), lines.join("\n")).toBe(false);
  });

  test("a change to a profile is said with its own day, never as the span before", () => {
    const lines = [...said("visibility.business", screens("lastMonth")["visibility.business"]), ...said("visibility.localActivity", screens("thisMonth")["visibility.localActivity"])];
    expect(lines).toContain("Air Social: photos 103, against 95 for Air Social, before 2026-11-02.");
    expect(lines).toContain("The Website Space: star rating 4.9, against 5 for The Website Space, before 2026-11-02.");
    expect(lines.some((line) => /photos (up|down) .* the span before/.test(line)), lines.join("\n")).toBe(false);
  });

  test("a screen with nothing saved hands its eye nothing, so it says nothing untrue", () => {
    expect(linkingWebsitesSees(null, null, { linkingNow: "", stoppedLinking: "" })).toBeUndefined();
    expect(linkingWebsiteSees(null, null, { noAnchor, followedHeld: "", lostHeld: "" })).toBeUndefined();
    expect(brokenLinksSees(undefined, null, { brokenLinks: "", brokenFollowed: "", brokenWebsites: "" })).toBeUndefined();
    expect(allBacklinksSees(undefined, null, { lostLinks: "", lostStrongest: "", redirectedLinks: "", notFollowedLinks: "" })).toBeUndefined();
    expect(anchorSees(null, null, { noAnchor, wholeWebsite: "" })).toBeUndefined();
    expect(bandSquareSees(undefined, null, { from: "p11_20", to: "p21_50" }, { square: "", from: "", to: "" })).toBeUndefined();
    expect(profileSees({ office: null }, (detail) => detail, { searchesChecked: "", rivalsAverage: "", reviewsAnswered: "", detailsToFix: "" })).toBeUndefined();
    expect(mapsSees(null, { searchesChecked: "" })).toBeUndefined();
    expect(activitySees(undefined, { yourRivals: "", you: "" })).toBeUndefined();
    expect(listingsSees({ offices: [], rivals: [] }, { yourOffices: "", rivalsAhead: "" })).toBeUndefined();
    expect(nearbySees(undefined, { moreReviewsNearby: "" })).toBeUndefined();
    expect(businessSees({ ...(HELD.businessAirSocial as Row), found: false } as never, "2026-11-22", { you: HOST })).toBeUndefined();
    expect(questionSees({ ...(HELD.radarQuestion as Row), found: false } as never, kindName, HOST, { yourRivals: "" })).toBeUndefined();
    expect(sourcesSees({ websites: [], yourTimes: null, yourPages: null }, kindName, { namingYou: "", neverBesideYou: "", besideRivals: "" })).toBeUndefined();
    expect(sourceWebsiteSees(null, kindName, { besideRivals: "", pagesNamingYou: "" })).toBeUndefined();
    expect(yourPagesEye({ ...(HELD.yourPages as Row), own: false } as never, { shownOnGoogle: "", neverShown: "", notInSitemap: "", ranking: "", notCrawled: "" })).toBeUndefined();
  });
});
