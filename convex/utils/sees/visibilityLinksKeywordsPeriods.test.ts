import { describe, expect, test } from "vitest";
import { readFixture } from "@/src/test/readFixture";
import en from "@/messages/en.json";
import {
  anchorsSees, comparedSees, ipsSees, linkChangesSees, qualitySees, summarySees, whereSees,
} from "@/src/app/(dashboard)/app/sites/[siteId]/backlinks/_components/linkSees";
import {
  bandsSees, keywordsSees, newLostSees, pagesSees, searchSees, structureSees, withoutGuessedMoney,
} from "@/src/app/(dashboard)/app/sites/[siteId]/keywords/_components/keywordSees";
import { findingWords, type Finding } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

const saved = readFixture("moreHandlesVisibilityLinksKeywords");

/**
 * Visibility's Backlinks and Keywords pages, on every period the date menu offers, on the figures the dev deployment held
 * on 3 November 2026 (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10; Anthony, 2026-11-03: "we have a date
 * selection picker FFS … please add this to your tests"). More Handles (morehandles.co.uk) for every Backlinks page and
 * for A search; its rival doorhandlecompany.co.uk for the Keywords lists, as More Handles' own keyword list held no
 * searches that day (its copy and its check counted none, while its ranks hold some: a data fault, reported). Each page's
 * figures are built as the page builds them (`linkSees.ts`, `keywordSees.ts`), then cut as the eye cuts them.
 *
 * Visibility's figures come from checks on set days. Every website held one check, on 5 October, so nothing moved between
 * checks on any period: the findings set yours against your rivals' and parts against their whole. A period after the
 * check (This week, Last week, This month) shows the figures as they stood before its dates, as the Summary's boxes do.
 */

type Fixture = typeof saved;
type Period = Fixture["periods"]["lastMonth"];
const PERIODS = saved.periods as unknown as Record<string, Period>;
const U = saved.undated;
const NAMES = en.sites.seesNames;
const WHOLE = ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
const BEGUN = ["thisWeek", "thisMonth"] as const;
const ALL = [...WHOLE, ...BEGUN] as const;

/** Never money, never Hakken's housekeeping: the words a finding must not hold. */
const NEVER = /(\$|£|€|cost|worth|cpc|per click|not sorted)/i;

const regions = new Intl.DisplayNames(["en"], { type: "region" });
/** Where links come from's group names, as `useLinkGroupName` words them in English. */
function groupName(breakdown: string, key: string): string {
  const words = en.sites.linkSources;
  if (key === "(rest)") return words.rest;
  if (key === "(none)" || key === "") return words.unknown;
  if (breakdown === "countries" && key === "WW") return words.worldwide;
  if (breakdown === "countries" && /^[A-Z]{2}$/.test(key)) return regions.of(key) ?? key;
  if (breakdown === "tlds") return `.${key}`;
  return key.replace(/[_-]/g, " ");
}

/** The page's findings as its eye works them out, in the plain English sentences Jev reads. */
function said(screen: string, data: unknown): { findings: Finding[]; words: string[] } {
  const findings = pageFindings(screen, pageDataFor(data, screen));
  return { findings, words: findings.map(findingWords) };
}

const series = (period: string) => PERIODS[period].series as unknown as Parameters<typeof summarySees>[0];
const dhcSeries = (period: string) => PERIODS[period].dhcSeries as unknown as Parameters<typeof summarySees>[0];

const PAGES: Record<string, { screen: string; dated: boolean; build: (period: string) => unknown; least: number; headline: RegExp }> = {
  summary: {
    screen: "visibility.backlinks", dated: true, least: 4, headline: /^morehandles\.co\.uk: linking websites/,
    build: (period) => summarySees(series(period), { rivals: NAMES.rivals }),
  },
  compared: {
    screen: "visibility.backlinksCompared", dated: false, least: 4, headline: /^morehandles\.co\.uk: linking websites/,
    build: () => comparedSees(U.siteAndRivals, { rivals: NAMES.rivals }),
  },
  quality: {
    screen: "visibility.backlinksQuality", dated: true, least: 4, headline: /^morehandles\.co\.uk: spam score/,
    build: (period) => qualitySees(U.profile, series(period), U.rivalProfiles, { rivals: NAMES.rivals }),
  },
  where: {
    screen: "visibility.backlinksWhere", dated: false, least: 4, headline: /^United Kingdom: of the links/,
    build: () => whereSees(U.rivalProfiles, groupName, (breakdown) => en.sites.linkSources.breakdowns[breakdown], { rivals: NAMES.rivals }),
  },
  anchors: {
    screen: "visibility.backlinksAnchors", dated: false, least: 4, headline: /^delivery page holds/,
    build: () => anchorsSees(U.anchors, U.anchorFigures, { noAnchor: en.sites.backlinksAnchors.noAnchor, noWords: NAMES.noWords, brand: NAMES.brand, spammy: NAMES.spammy, fresh: NAMES.fresh }),
  },
  ips: {
    screen: "visibility.backlinksIps", dated: false, least: 4, headline: /^199\.36\.158\.0\/24 holds/,
    build: () => ipsSees(U.profile, U.subnets, U.ips, U.serverFigures, { oneWebsite: NAMES.oneWebsite, busiestThree: NAMES.busiestThree }),
  },
  searches: {
    screen: "visibility.keywords", dated: true, least: 4, headline: /^Searches that fell:/,
    build: (period) => keywordsSees(U.keywords as never, U.keywordFigures, series(period), { rivals: NAMES.rivals, rose: NAMES.rose, fell: NAMES.fell }),
  },
  bands: {
    screen: "visibility.keywordsBands", dated: true, least: 4, headline: /^morehandles\.co\.uk: of its searches on Google's first page/,
    build: (period) => bandsSees(series(period), U.bandMoves as never, U.bandMoved as never, { rivals: NAMES.rivals, pageOne: en.sites.bands.pageOne, pageTwo: en.sites.bands.pageTwo, closestOthers: NAMES.closestOthers }),
  },
  search: {
    screen: "visibility.keywordRecord", dated: true, least: 3, headline: /^morehandles\.co\.uk: place on Google 12/,
    build: (period) => searchSees(U.record as never, PERIODS[period].positions as never, null, "morehandles.co.uk", { rivals: NAMES.rivals, rivalsAbove: NAMES.rivalsAbove, rivalsMissing: NAMES.rivalsMissing }),
  },
  newLost: {
    // One check, its first: the page counts no moves of its own, so the supplier's across every search stand in, beside a
    // typical rival's share that fell. More Handles' new and fallen shares sit within three points of its rivals': no news.
    screen: "visibility.keywordsNewLost", dated: true, least: 3, headline: /^Searches ranked for: 2375 new and 0 lost/,
    build: (period) => newLostSees(PERIODS[period].checks as never, PERIODS[period].checksBefore as never, undefined, U.coverageMoves, series(period), { rivals: NAMES.rivals, rose: NAMES.rose, fell: NAMES.fell }),
  },
};

/** The Keywords lists on More Handles' rival, whose list the dev deployment held (1,000 searches, 139 pages, 24 sections). */
const RIVAL_PAGES: typeof PAGES = {
  searches: {
    screen: "visibility.keywords", dated: true, least: 4, headline: /^Searches that fell:/,
    build: (period) => keywordsSees(U.dhc.keywords as never, U.dhc.keywordFigures, dhcSeries(period), { rivals: NAMES.rivals, rose: NAMES.rose, fell: NAMES.fell }),
  },
  bands: {
    // Its top three and page two sit within three points of a typical rival's, which is no news: three things to say.
    screen: "visibility.keywordsBands", dated: true, least: 3, headline: /^doorhandlecompany\.co\.uk: of its searches on Google's first page/,
    build: (period) => bandsSees(dhcSeries(period), U.dhc.bandMoves as never, U.dhc.bandMoved as never, { rivals: NAMES.rivals, pageOne: en.sites.bands.pageOne, pageTwo: en.sites.bands.pageTwo, closestOthers: NAMES.closestOthers }),
  },
  newLost: {
    screen: "visibility.keywordsNewLost", dated: true, least: 4, headline: /^Searches ranked for: 1728 new and 0 lost/,
    build: (period) => newLostSees(PERIODS[period].dhcChecks as never, PERIODS[period].dhcChecksBefore as never, undefined, U.dhcCoverageMoves, dhcSeries(period), { rivals: NAMES.rivals, rose: NAMES.rose, fell: NAMES.fell }),
  },
  pages: {
    screen: "visibility.keywordsPages", dated: true, least: 4, headline: /^\/ holds/,
    build: (period) => pagesSees(U.dhc.pages as never, U.dhc.pageFigures, dhcSeries(period), (kind) => (en.sites.common.pageTypes as Record<string, string>)[kind] ?? kind, { website: "doorhandlecompany.co.uk", itsSearches: NAMES.itsSearches, quietPages: NAMES.quietPages, topFive: NAMES.topFive, oneSearch: NAMES.oneSearch }),
  },
  structure: {
    screen: "visibility.keywordsStructure", dated: false, least: 4, headline: /^\/ holds/,
    build: () => structureSees(U.dhc.sections as never, { itsSearches: NAMES.itsSearches, wholeWebsite: NAMES.wholeWebsite }),
  },
};

function checkPage(website: string, name: string, page: (typeof PAGES)[string]) {
  // An undated page shows the newest check whatever the dates: one run stands for every period.
  for (const period of page.dated ? ALL : (["lastMonth"] as const)) {
    test(`${website}: ${name} on ${page.dated ? period : "any period (the page shows the newest check)"}`, () => {
      const { findings, words } = said(page.screen, page.build(period));
      if (process.env.PRINT_FINDINGS) console.log(`\n${website} ${name} ${period}\n  ${words.join("\n  ")}`);
      const shown = words.join("\n");
      const begun = (BEGUN as readonly string[]).includes(period);
      expect(findings.length, shown).toBeGreaterThanOrEqual(begun ? Math.min(2, page.least) : page.least);
      expect(words.some((line) => page.headline.test(line)), shown).toBe(true);
      expect(words.some((line) => NEVER.test(line)), shown).toBe(false);
      // Every figure a finding names is keyed, and none is a code or an id.
      for (const finding of findings) {
        expect(finding.facts.length, finding.id).toBeGreaterThan(0);
        expect(String(finding.params.name ?? ""), finding.id).not.toMatch(/^[A-Z][A-Z0-9_]+$|^[0-9a-z]{31,37}$/);
      }
    });
  }
}

/**
 * Backlinks › New and lost links reads the supplier's daily count of links gained and lost, which on the dev deployment
 * runs to 5 October, the newest check: This week, Last week and This month hold none of it, so the page draws nothing
 * and the eye must say nothing rather than something untrue; a period with one step of it holds no step to set apart.
 */
const LINK_CHANGES = {
  screen: "visibility.backlinksNewLost",
  build: (period: string) => {
    const step = PERIODS[period].range.step;
    const other = step === "month" ? NAMES.otherMonths : step === "week" ? NAMES.otherWeeks : NAMES.otherDays;
    return linkChangesSees(PERIODS[period].changes, PERIODS[period].changesBefore, PERIODS[period].range as never, (day) => (step === "month" ? day.slice(0, 7) : day), { otherSteps: other });
  },
};

describe("Backlinks and Keywords find the biggest things on every period the date menu offers (dev figures, 3 November 2026)", () => {
  for (const period of ALL) {
    test(`morehandles.co.uk: new and lost links on ${period}`, () => {
      const steps = PERIODS[period].changes.length;
      const { findings, words } = said(LINK_CHANGES.screen, LINK_CHANGES.build(period));
      if (process.env.PRINT_FINDINGS) console.log(`\nmorehandles.co.uk linkChanges ${period} (${steps} steps)\n  ${words.join("\n  ")}`);
      expect(findings.length, words.join("\n")).toBeGreaterThanOrEqual(steps === 0 ? 0 : steps < 3 ? 2 : 3);
      if (steps === 0) expect(findings).toEqual([]);
      else expect(words[0], words.join("\n")).toMatch(/^Links: \d+ new and \d+ lost/);
      expect(words.some((line) => NEVER.test(line))).toBe(false);
    });
  }
  for (const [name, page] of Object.entries(PAGES)) checkPage("morehandles.co.uk", name, page);
  for (const [name, page] of Object.entries(RIVAL_PAGES)) checkPage("doorhandlecompany.co.uk", name, page);
});

describe("the rules read a move between checks where the dates hold one", () => {
  // Two checks, as a website checked monthly holds over Last 3 months: the newest check moved on from the one before the dates.
  const lines = [
    { host: "morehandles.co.uk", isYou: true, before: { day: "2026-09-05", referringDomains: 760, backlinks: 23900, domainRank: 401, brokenBacklinks: 9, spamScore: 2, brokenPages: 20 }, points: [{ day: "2026-10-05", lastDay: "2026-10-05", referringDomains: 805, backlinks: 24574, domainRank: 406, brokenBacklinks: 15, spamScore: 4, brokenPages: 29 }] },
    { host: "ironmongerydirect.co.uk", isYou: false, before: { day: "2026-09-05", referringDomains: 1500, backlinks: 70000, domainRank: 414, brokenBacklinks: 12, spamScore: 5, brokenPages: 40 }, points: [{ day: "2026-10-05", lastDay: "2026-10-05", referringDomains: 1714, backlinks: 76227, domainRank: 415, brokenBacklinks: 12, spamScore: 5, brokenPages: 47 }] },
    { host: "handlestore.com", isYou: false, before: { day: "2026-09-05", referringDomains: 1420, backlinks: 2700, domainRank: 210, brokenBacklinks: 1100, spamScore: 30, brokenPages: 400 }, points: [{ day: "2026-10-05", lastDay: "2026-10-05", referringDomains: 1431, backlinks: 2786, domainRank: 210, brokenBacklinks: 1185, spamScore: 36, brokenPages: 407 }] },
    { host: "handles4u.co.uk", isYou: false, before: null, points: [{ day: "2026-10-05", lastDay: "2026-10-05", referringDomains: 1070, backlinks: 4502, domainRank: 298, brokenBacklinks: 2712, spamScore: 15, brokenPages: 109 }] },
  ];

  test("Summary: linking websites up, beside the rival that moved most", () => {
    const { words } = said("visibility.backlinks", summarySees(lines as never, { rivals: NAMES.rivals }));
    expect(words[0]).toBe("morehandles.co.uk: linking websites up 5.9%, to 805 from 760 the span before; ironmongerydirect.co.uk: up 14.3%.");
    expect(words.some((line) => line.startsWith("ironmongerydirect.co.uk: linking websites rose to 1714 from 1500"))).toBe(true);
  });

  test("Link quality: spam score up, beside the rival that moved most", () => {
    const { words } = said("visibility.backlinksQuality", qualitySees(null, lines as never, [], { rivals: NAMES.rivals }));
    expect(words[0]).toMatch(/^morehandles\.co\.uk: spam score up 100%, to 4 from 2 the span before; handlestore\.com: up 20%/);
  });

  test("New and lost links: gained against lost, beside the span before's, and the week that lost far more", () => {
    const weeks = (lost: number[]) => lost.map((value, at) => ({ day: `2026-06-${String(1 + at * 7).padStart(2, "0")}`, newBacklinks: 40, lostBacklinks: value, newReferringDomains: 3, lostReferringDomains: 2 }));
    const range = { from: "2026-06-01", to: "2026-06-28", step: "week" as const, before: { from: "2026-05-04", to: "2026-05-31" } };
    const before = [20, 30, 25].map((value, at) => ({ day: `2026-05-${String(4 + at * 7).padStart(2, "0")}`, newBacklinks: 40, lostBacklinks: value, newReferringDomains: 3, lostReferringDomains: 2 }));
    const { words } = said("visibility.backlinksNewLost", linkChangesSees(weeks([30, 7564, 95, 45]), before, range, (day) => `Week of ${day}`, { otherSteps: NAMES.otherWeeks }));
    expect(words[0]).toBe("Links: 160 new and 7734 lost, against 120 new and 75 lost the span before.");
    expect(words).toContain("Week of 2026-06-08: links lost 7564, against 57 for Other weeks, on average.");
  });
});

// Every guessed money figure off (Anthony, 2026-11-03: "Yes, all of it"): the eye's writer and chat never read one either.
describe("no guessed money reaches the eye", () => {
  test("a keyword list's rows and a search's record are handed without what a click costs or what visits are worth", () => {
    const row = { keyword: "door handles", position: 12, change: 0, volume: 49500, traffic: 224.8, page: "/door-handles.html", status: "NEW", cpc: 0.97, trafficValue: 218 };
    const handed = JSON.stringify([
      keywordsSees({ rows: [row], total: 1, page: 1, pages: 1 }, null, [], { rivals: NAMES.rivals, rose: NAMES.rose, fell: NAMES.fell }),
      searchSees({ ...U.record, rank: { ...U.record.rank, cpc: 0.97, trafficValue: 218 } } as never, [], null, "morehandles.co.uk", { rivals: NAMES.rivals, rivalsAbove: NAMES.rivalsAbove, rivalsMissing: NAMES.rivalsMissing }),
      withoutGuessedMoney({ record: { rank: { cpc: 0.97, trafficValue: 218, traffic: 225 } }, keywords: { rows: [row] } }),
    ]);
    expect(handed).not.toMatch(/cpc|trafficValue/);
    expect(handed).toContain("224.8");
  });
});

describe("new and lost links set a span against as many days before it", () => {
  test("the supplier's count stopping inside the dates cuts the span before to as many days", () => {
    // Last month on 3 November: the count runs to 5 October, so 1–5 October is set against 1–5 September, never all of it.
    const range = { from: "2026-10-01", to: "2026-10-31", step: "day" as const, before: { from: "2026-09-01", to: "2026-09-30" } };
    const change = (day: string, gained: number, lost: number) => ({ day, newBacklinks: gained, lostBacklinks: lost, newReferringDomains: 1, lostReferringDomains: 1 });
    const { words } = said("visibility.backlinksNewLost", linkChangesSees([change("2026-10-05", 2, 0)], [change("2026-09-03", 5, 4), change("2026-09-20", 390, 415)], range, (day) => day, { otherSteps: NAMES.otherDays }));
    expect(words[0]).toBe("Links: 2 new and 0 lost, against 5 new and 4 lost the span before.");
  });
});
