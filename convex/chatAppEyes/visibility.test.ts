import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import { useFixedDay } from "@/src/test/realTime";
import type { Id } from "../_generated/dataModel";
import { ukDay, type CalendarPeriod } from "../utils/calendarPeriods";
import en from "@/messages/en.json";
import {
  aboveSeen, aiDemandSeen, aiMentionsSeen, auditCheckNameFrom, auditSeen, featureNameFrom, featuresSeen, marketMapRows, marketSeen, mentionsRivalsSeen, overviewSeen, paidSeen,
  radarSeen, reviewsRivalsSeen, reviewsSeen, rivalSeen, searchesSeen, shareSeen, sideBySideSeen, webMentionsSeen, winsLossesSeen,
} from "../utils/sees/eyeData/visibility";
import { anchorsSees, comparedSees, ipsSees, linkChangesSees, qualitySees, summarySees, whereSees } from "../utils/sees/eyeData/visibilityBacklinks";
import { bandSquareSees, bandsSees, keywordsSees, newLostSees, pagesSees, searchSees, structureSees } from "../utils/sees/eyeData/visibilityKeywords";
import { allBacklinksSees, anchorSees, brokenLinksSees, linkingWebsiteSees, linkingWebsitesSees } from "../utils/sees/eyeData/visibilityLinkLists";
import { activitySees, businessSees, listingsSees, mapsSees, nearbySees, profileSees } from "../utils/sees/eyeData/visibilityLocal";
import { questionSees, sourceWebsiteSees, sourcesSees, yourPagesEye } from "../utils/sees/eyeData/visibilityRadar";
import { findingWords } from "../utils/sees/findings";
import { pageDataFor } from "../utils/sees/pageData";
import { pageFindings } from "../utils/sees/pageFindings";
import { englishWords } from "../utils/sees/serverWords";
import { VISIBILITY_EYE_READS, VISIBILITY_EYES } from "./visibility";
import type { EyeRun } from "./types";

/**
 * Visibility's screens built on the server for a chat app's question (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
 * Option B) hand the eye what the screens hand it, built by the same functions in the screens' own English words, and
 * so find the screens' own findings. The reads answer from More Handles' saved figures (`moreHandlesVisibility.json`,
 * saved on 3 November 2026, the day each test runs on), the same `convex/utils/sees/visibilityPeriods.test.ts` reads.
 */

type Row = Record<string, unknown>;
type Range = { from: string; to: string; step: "day" | "week" | "month"; before: { from: string; to: string } };
const HELD = readFixture<{ periods: Record<string, Row & { range: Range }>; undated: Record<string, never> }>("moreHandlesVisibility");
const UNDATED = HELD.undated;
const PERIODS: readonly CalendarPeriod[] = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"];
const SITE = "site" as Id<"companyWebsites">;
const HOST = "morehandles.co.uk";

/** More Handles' header as its screens read it: one ranking check, its rivals by their Sites ids. */
const HEADER = {
  host: HOST,
  relationship: "OWNED",
  checkDays: ["2026-10-05"],
  rivals: (UNDATED.andRivals as Array<{ host: string; isYou: boolean }>).filter((row) => !row.isYou).map((row) => ({ siteId: `hold-${row.host}`, host: row.host })),
};

/** A run answering each read from the saved figures, noting every read it was asked for; a read with nothing saved answers null. */
function runFor(period: CalendarPeriod, asked: string[] = [], header: Row = HEADER): EyeRun {
  const held = HELD.periods[period];
  const answers: Record<string, (args: Row) => unknown> = {
    "vis.site": () => header,
    "vis.series": (args) => (args.withRivals ? held.seriesRivals : args.from === held.range.before.from ? held.seriesBefore : held.series),
    "vis.extras": () => UNDATED.extras,
    "vis.above": () => UNDATED.above,
    "vis.features": () => UNDATED.features,
    "vis.searches": () => UNDATED.searches,
    "vis.moves": () => UNDATED.movesUp,
    "vis.andRivals": () => UNDATED.andRivals,
    "vis.rivals": () => UNDATED.rivals,
    "vis.rivalMoves": () => held.rivalMoves,
    "vis.marketMap": () => UNDATED.map,
    "vis.sharedWithRival": () => UNDATED.sharedAll,
    "vis.sharedSearches": () => UNDATED.shared,
    "vis.rivalCited": () => UNDATED.cited,
    "vis.aiDemand": () => UNDATED.aiDemand,
    "vis.mentions": () => UNDATED.aiMentions,
    "vis.share": () => UNDATED.share,
    "vis.webMentions": () => held.webMentions,
    "vis.mentionsRivals": () => held.mentionsRivals,
    "vis.reviews": () => held.reviews,
    "vis.reviewsRivals": () => held.reviewsRivals,
    "vis.paidKeywords": () => UNDATED.paidKeywords,
    "vis.audit": () => UNDATED.audit,
  };
  return async (read, args) => {
    if (!(read in VISIBILITY_EYE_READS)) throw new Error(`There's no read called ${read}.`);
    asked.push(read);
    return answers[read]?.(args) ?? null;
  };
}

const build = (screen: string, period: CalendarPeriod, key?: string, asked: string[] = [], header: Row = HEADER) =>
  VISIBILITY_EYES[screen](runFor(period, asked, header), { siteId: SITE, period, ...(key ? { key } : {}) });

/** The page's findings, in words, held to the eye's promises (`src/test/eyeHolds.ts`). */
function findingsOf(screen: string, data: unknown): string[] {
  expectEyeHolds(screen, data);
  return pageFindings(screen, pageDataFor(data, screen)).map(findingWords);
}

const engine = (name: string) => ({ chatgpt: "ChatGPT", perplexity: "Perplexity", claude: "Claude", ai_mode: "Google AI Mode" } as Record<string, string>)[name]
  ?? name.charAt(0).toUpperCase() + name.slice(1);
/** The features' and the audit checks' names are the screens' own words, as `useFeatureLabel` and the audit page read them. */
const feature = featureNameFrom(englishWords("sites.common.features"));
const check = auditCheckNameFrom(englishWords("sites.audit"));

/** What each page hands its eye, built as the page builds it, with the page's own English names written out. */
function screenData(screen: string, period: CalendarPeriod): unknown {
  const held = HELD.periods[period];
  const range = held.range;
  const own = (held.series as never[])[0];
  const rival = "ironmongerydirect.co.uk";
  switch (screen) {
    case "visibility.overview": return overviewSeen(own, UNDATED.extras, engine, { middle: "The rival in the middle of your group", shared: "searches you share" });
    case "visibility.googleAbove": return aboveSeen(UNDATED.above, { aboveYou: "above you", first: "Searches where you rank first", notOnPage: "Searches where you are not in the top 100" });
    case "visibility.googleFeatures": return featuresSeen(UNDATED.features, own, feature, { host: HOST, withSite: "With this website in it" });
    case "visibility.googleSearches": return searchesSeen(UNDATED.searches, undefined, { pageOne: "Searches on Google's first page", best: "Its best", slipping: "Dropping" });
    case "visibility.competitors": return sideBySideSeen(UNDATED.andRivals, UNDATED.rivals, held.seriesRivals as never, held.rivalMoves as never, { middle: "The rival in the middle of your group", youAbove: "Searches where you rank above it" });
    case "visibility.competitorsMap": return marketSeen(marketMapRows(UNDATED.map as Array<{ role: string; kind: string | null }>, false) as never, { middle: "The website in the middle of your market", more: "Websites in your market with more visitors than you" });
    case "visibility.competitorsRival": return rivalSeen(rival, UNDATED.andRivals, (UNDATED.rivals as Array<{ host: string; verdict: string }>).find((row) => row.host === rival)?.verdict ?? null, UNDATED.sharedAll, "THEM", UNDATED.shared, held.seriesRivals as never, UNDATED.cited, { you: HOST, theyLead: `Searches where ${rival} ranks above you` });
    case "visibility.aiDemand": return aiDemandSeen(UNDATED.aiDemand, { searches: "Your searches", google: "Searched on Google a month", onGoogle: "On Google", every: "Every search together" });
    case "visibility.aiMentions": return aiMentionsSeen(UNDATED.aiMentions, own, engine, { never: "Questions no assistant names you on", warned: "Answers warning against you", before: "The check before" });
    case "visibility.aiShare": return shareSeen(UNDATED.share, engine);
    case "visibility.mentions": {
      const mentions = held.webMentions as { rows: never[]; names: string[] };
      const kinds: Record<string, string> = { NEWS: "News", BLOG: "Blogs", FORUM: "Forums", SHOP: "Shops", ORGANISATION: "Organisations", OTHER: "Other websites" };
      const kind: Record<string, string> = { NEWS: "News", BLOG: "Blog", FORUM: "Forum", SHOP: "Shop", ORGANISATION: "Organisation", OTHER: "Website" };
      const tone: Record<string, string> = { WELL: "Speaks well", NEUTRAL: "Neutral", BADLY: "Speaks badly" };
      return webMentionsSeen(mentions.rows, range, { kinds: (one) => kinds[one], kind: (one) => kind[one], tone: (one) => tone[one] }, { business: mentions.names[0] ?? HOST, noLink: "Pages naming you with no link", badly: "Speak badly of you" });
    }
    case "visibility.mentionsRivals": return mentionsRivalsSeen(held.mentionsRivals as never, { middle: "The rival in the middle" });
    case "visibility.reviews": {
      const reviews = held.reviews as { offices: Array<{ name: string }> };
      const named: Record<string, [string, string]> = {
        thisWeek: ["This week", "The same days last week"], lastWeek: ["Last week", "The week before"], thisMonth: ["This month", "The same days last month"],
        lastMonth: ["Last month", "The month before"], last3Months: ["Last 3 months", "The 3 months before"], last6Months: ["Last 6 months", "The 6 months before"],
        last12Months: ["Last 12 months", "The 12 months before"],
      };
      return reviewsSeen(held.reviews as never, range, {
        business: reviews.offices[0]?.name ?? HOST, stars: `Average stars, ${named[period][0]}`, before: named[period][1], waiting: "Not answered", low: "1 to 3 stars", reply: "Days to answer",
      });
    }
    case "visibility.reviewsRivals": return reviewsRivalsSeen(held.reviewsRivals as never, (source) => ({ GOOGLE: "Google", TRUSTPILOT: "Trustpilot", TRIPADVISOR: "Tripadvisor" } as Record<string, string>)[source], { answering: "The rival answering most" });
    case "visibility.paid": return paidSeen(own, { name: HOST, visitsName: "Visits a month from adverts", beforeName: "The check before" });
    case "visibility.audit": return auditSeen(UNDATED.audit, own, null, check, { host: HOST, errors: "Pages with errors" });
  }
  throw new Error(`No screen data written for ${screen}.`);
}

/** Screens whose saved figures hold a comparison on every period: each finds its headline at least. */
const FINDING = ["visibility.overview", "visibility.competitors", "visibility.competitorsMap", "visibility.competitorsRival", "visibility.aiDemand", "visibility.aiMentions", "visibility.aiShare"];
/** Screens whose saved figures are a single check, or none: they hand the eye the screen's own figures and must say nothing untrue. */
const QUIET = ["visibility.googleAbove", "visibility.googleFeatures", "visibility.googleSearches", "visibility.mentions", "visibility.mentionsRivals", "visibility.reviews", "visibility.reviewsRivals", "visibility.paid", "visibility.audit"];
/** Screens about one thing, and the thing a chat app names. */
const KEYED: Record<string, string> = { "visibility.competitorsRival": "ironmongerydirect.co.uk" };

describe("Visibility's screens built on the server, on More Handles' saved figures", () => {
  beforeEach(() => useFixedDay("2026-11-03"));
  afterEach(() => vi.useRealTimers());

  test("every read is one of Visibility's own, and every screen has an eye of its own", () => {
    expect(Object.keys(VISIBILITY_EYE_READS).filter((name) => !name.startsWith("vis."))).toEqual([]);
    expect(Object.keys(VISIBILITY_EYES).filter((screen) => !screen.startsWith("visibility."))).toEqual([]);
  });

  for (const period of PERIODS) {
    test(`${period}: each screen hands the eye what the screen hands it, and the screens that compare find their own findings`, async () => {
      for (const screen of [...FINDING, ...QUIET]) {
        const built = await build(screen, period, KEYED[screen]);
        expect(built, screen).toEqual(screenData(screen, period));
        const lines = findingsOf(screen, built);
        if (FINDING.includes(screen)) expect(lines.length, `${screen}\n${lines.join("\n")}`).toBeGreaterThan(0);
        for (const line of lines) expect(line, line).not.toMatch(/\$|cost|worth|undefined|NaN|null/i);
      }
    });

    test(`${period}: Wins and losses compares the moves over the dates and before, and reads no moves for a site checked once`, async () => {
      const asked: string[] = [];
      const built = await build("visibility.googleMoves", period, undefined, asked) as { winsLosses: { names: Record<string, string> } };
      const held = HELD.periods[period];
      const page = winsLossesSeen((held.series as never[])[0], (held.seriesBefore as never[])[0], undefined, held.range.step, {
        up: "Moved up", down: "Moved down", dates: built.winsLosses.names.dates, usual: built.winsLosses.names.usual, before: built.winsLosses.names.before,
      });
      expect(built).toEqual(page);
      expect(asked).not.toContain("vis.moves");
      findingsOf("visibility.googleMoves", built);
      // Checked more than once, the moves up are read too: the table's first page, the biggest first.
      const twice: string[] = [];
      const moved = await build("visibility.googleMoves", period, undefined, twice, { ...HEADER, checkDays: ["2026-10-15", "2026-10-05"] }) as Row;
      expect(twice).toContain("vis.moves");
      expect(moved.moves).toEqual([]);
    });
  }

  test("the period's own words name the dates and the span before", async () => {
    const built = await build("visibility.googleMoves", "lastMonth") as { winsLosses: { names: Record<string, string> } };
    expect(built.winsLosses.names).toMatchObject({ up: "Moved up", down: "Moved down", dates: "Last month", before: "The month before" });
  });

  test("a screen about one thing is built only for the thing named, and a rival by its address or its Sites id", async () => {
    for (const screen of ["visibility.googleFeature", "visibility.competitorsRival", "visibility.aiAnswer", "visibility.aiPage", "visibility.auditProblem"]) {
      expect(await build(screen, "lastMonth"), screen).toBeNull();
    }
    expect(await build("visibility.googleFeature", "lastMonth", "not_a_feature")).toBeNull();
    expect(await build("visibility.aiAnswer", "lastMonth", "not an id")).toBeNull();
    expect(await build("visibility.competitorsRival", "lastMonth", "nobody.example")).toBeNull();
    const byId = await build("visibility.competitorsRival", "lastMonth", "hold-ironmongerydirect.co.uk");
    expect(byId).toEqual(await build("visibility.competitorsRival", "lastMonth", "https://www.ironmongerydirect.co.uk/"));
    expect(byId).toEqual(screenData("visibility.competitorsRival", "lastMonth"));
  });

  test("a competitor's website has no Content gap, Organic competitors or Site audit, as its screens say", async () => {
    for (const screen of ["visibility.competitorsGap", "visibility.competitorsOrganic", "visibility.audit"]) {
      const asked: string[] = [];
      expect(await build(screen, "lastMonth", undefined, asked, { ...HEADER, relationship: "TRACKED" }), screen).toBeNull();
      expect(asked, screen).toEqual(["vis.site"]);
    }
  });

  test("a screen whose read has nothing saved shows nothing", async () => {
    for (const screen of ["visibility.googleQuestions", "visibility.competitorsSuggested", "visibility.aiBusinesses", "visibility.aiRead", "visibility.aiSearched", "visibility.aiSources", "visibility.mentionsListed", "visibility.reviewsSay", "visibility.assets", "visibility.aiAnswers", "visibility.googleFanOut"]) {
      expect(await build(screen, "lastMonth"), screen).toBeNull();
    }
  });
});

describe("Wins and losses names its usual line by the chart's step", () => {
  beforeEach(() => useFixedDay("2026-11-03"));
  afterEach(() => vi.useRealTimers());

  test("a usual day, week or month, as the screen's step has it", async () => {
    const usual: Record<string, string> = { day: "A usual day", week: "A usual week", month: "A usual month" };
    for (const period of PERIODS) {
      const built = await build("visibility.googleMoves", period) as { winsLosses: { names: Record<string, string> } };
      expect(built.winsLosses.names.usual, period).toBe(usual[HELD.periods[period].range.step]);
    }
  });
});

// --- Backlinks, Keywords and Brand radar, on More Handles' saved figures ---

type LinksPeriod = Record<string, never> & { range: Range };
const LINKS = readFixture<{ periods: Record<string, LinksPeriod>; undated: Record<string, never> & { dhc: Record<string, never> } }>("moreHandlesVisibilityLinksKeywords");
const U = LINKS.undated;
const NAMES = en.sites.seesNames;
/** The periods that have ended: each holds its whole span, as the Backlinks and Keywords every-period test reads them. */
const WHOLE: readonly CalendarPeriod[] = ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"];
/** More Handles' rival, whose keyword list the deployment held that day: Top pages and Site structure are read on it. */
const RIVAL = "doorhandlecompany.co.uk";

/** A run answering Backlinks' and Keywords' reads from the saved figures, More Handles' own or, with `rival`, its rival's lists. */
function linksRun(period: CalendarPeriod, rival = false, asked: string[] = []): EyeRun {
  const held = LINKS.periods[period];
  const dhc = U.dhc;
  const before = (args: Row) => args.from === held.range.before.from;
  const answers: Record<string, (args: Row) => unknown> = {
    "vis.site": () => ({ ...HEADER, host: rival ? RIVAL : HOST, coverage: { moves: rival ? U.dhcCoverageMoves : U.coverageMoves } }),
    "vis.series": () => (rival ? held.dhcSeries : held.series),
    "vis.andRivals": () => U.siteAndRivals,
    "vis.linkProfile": () => U.profile,
    "vis.linkProfiles": () => U.rivalProfiles,
    "vis.subnets": () => U.subnets,
    "vis.referringIps": () => U.ips,
    "vis.serverFigures": () => U.serverFigures,
    "vis.anchors": () => U.anchors,
    "vis.anchorFigures": () => U.anchorFigures,
    "vis.linkChanges": (args) => (before(args) ? held.changesBefore : held.changes),
    "vis.keywords": () => (rival ? dhc.keywords : U.keywords),
    "vis.keywordFigures": () => (rival ? dhc.keywordFigures : U.keywordFigures),
    "vis.bandMoves": () => (rival ? dhc.bandMoves : U.bandMoves),
    "vis.bandMoved": () => (rival ? dhc.bandMoved : U.bandMoved),
    "vis.checks": (args) => (rival ? (before(args) ? held.dhcChecksBefore : held.dhcChecks) : before(args) ? held.checksBefore : held.checks),
    "vis.keywordRecord": () => U.record,
    "vis.searchPositions": () => held.positions,
    "vis.pages": () => dhc.pages,
    "vis.pageFigures": () => dhc.pageFigures,
    "vis.sections": () => dhc.sections,
    "vis.radar": () => UNDATED.radar,
  };
  return async (read, args) => {
    if (!(read in VISIBILITY_EYE_READS)) throw new Error(`There's no read called ${read}.`);
    asked.push(read);
    return answers[read]?.(args) ?? null;
  };
}

const regions = new Intl.DisplayNames(["en"], { type: "region" });
/** Where links come from's group names in English, as `useLinkGroupName` words them. */
function groupName(breakdown: string, key: string): string {
  const words = en.sites.linkSources;
  if (key === "(rest)") return words.rest;
  if (key === "(none)" || key === "") return words.unknown;
  if (breakdown === "countries" && key === "WW") return words.worldwide;
  if (breakdown === "countries" && /^[A-Z]{2}$/.test(key)) return regions.of(key) ?? key;
  if (breakdown === "tlds") return `.${key}`;
  return key.replace(/[_-]/g, " ");
}
/** New and lost links' steps named as its table names them in English: a month whole, a day short with its year. */
const stepName = (step: string) => (day: string) => (step === "month"
  ? new Date(`${day.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
  : new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }));

/** What each page hands its eye on More Handles' figures, built as the page builds it, with the page's own English names written out. */
function linksScreenData(screen: string, period: CalendarPeriod): unknown {
  const held = LINKS.periods[period];
  const dhc = U.dhc;
  const rivals = { rivals: NAMES.rivals };
  switch (screen) {
    case "visibility.backlinks": return summarySees(held.series, rivals);
    case "visibility.backlinksCompared": return comparedSees(U.siteAndRivals, rivals);
    case "visibility.backlinksQuality": return qualitySees(U.profile, held.series, U.rivalProfiles, rivals);
    case "visibility.backlinksWhere": return whereSees(U.rivalProfiles, groupName, (breakdown) => en.sites.linkSources.breakdowns[breakdown], rivals);
    case "visibility.backlinksAnchors": return anchorsSees(U.anchors, U.anchorFigures, { noAnchor: en.sites.backlinksAnchors.noAnchor, noWords: NAMES.noWords, brand: NAMES.brand, spammy: NAMES.spammy, fresh: NAMES.fresh });
    case "visibility.backlinksIps": return ipsSees(U.profile, U.subnets, U.ips, U.serverFigures, { oneWebsite: NAMES.oneWebsite, busiestThree: NAMES.busiestThree });
    case "visibility.backlinksNewLost": {
      const step = held.range.step;
      const other = step === "month" ? NAMES.otherMonths : step === "week" ? NAMES.otherWeeks : NAMES.otherDays;
      return linkChangesSees(held.changes, held.changesBefore, held.range, stepName(step), { otherSteps: other });
    }
    case "visibility.keywords": return keywordsSees(U.keywords, U.keywordFigures, held.series, { rivals: NAMES.rivals, rose: NAMES.rose, fell: NAMES.fell });
    case "visibility.keywordsBands": return bandsSees(held.series, U.bandMoves, U.bandMoved, { rivals: NAMES.rivals, pageOne: en.sites.bands.pageOne, pageTwo: en.sites.bands.pageTwo, closestOthers: NAMES.closestOthers });
    case "visibility.keywordsNewLost": return newLostSees(held.checks, held.checksBefore, undefined, U.coverageMoves, held.series, { rivals: NAMES.rivals, rose: NAMES.rose, fell: NAMES.fell });
    case "visibility.keywordRecord": return searchSees(U.record, held.positions, null, HOST, { rivals: NAMES.rivals, rivalsAbove: NAMES.rivalsAbove, rivalsMissing: NAMES.rivalsMissing });
    case "visibility.keywordsPages": return pagesSees(dhc.pages, dhc.pageFigures, held.dhcSeries, (kind) => (en.sites.common.pageTypes as Record<string, string>)[kind] ?? "–", {
      website: RIVAL, itsSearches: NAMES.itsSearches, quietPages: NAMES.quietPages, topFive: NAMES.topFive, oneSearch: NAMES.oneSearch,
    });
    case "visibility.keywordsStructure": return structureSees(dhc.sections, { itsSearches: NAMES.itsSearches, wholeWebsite: NAMES.wholeWebsite });
    case "visibility.radarOverview": return radarSeen(UNDATED.radar, { rivalsNotYou: en.sites.radar.eye.rivalsNotYou });
  }
  throw new Error(`No screen data written for ${screen}.`);
}

/** Screens read on More Handles' own figures, and those read on its rival's lists; each finds its own findings on every period. */
const OWN_SCREENS = [
  "visibility.backlinks", "visibility.backlinksCompared", "visibility.backlinksQuality", "visibility.backlinksWhere", "visibility.backlinksAnchors", "visibility.backlinksIps",
  "visibility.keywords", "visibility.keywordsBands", "visibility.keywordsNewLost", "visibility.keywordRecord",
];
const RIVAL_SCREENS = ["visibility.keywordsPages", "visibility.keywordsStructure"];
const LINKS_KEYED: Record<string, string> = { "visibility.keywordRecord": "door handles" };

describe("Backlinks, Keywords and Brand radar built on the server, on More Handles' saved figures", () => {
  beforeEach(() => useFixedDay("2026-11-03"));
  afterEach(() => vi.useRealTimers());

  for (const period of WHOLE) {
    test(`${period}: each screen hands the eye what the screen hands it, and finds its own findings`, async () => {
      for (const screen of [...OWN_SCREENS, ...RIVAL_SCREENS]) {
        const rival = RIVAL_SCREENS.includes(screen);
        const built = await VISIBILITY_EYES[screen](linksRun(period, rival), { siteId: SITE, period, ...(LINKS_KEYED[screen] ? { key: LINKS_KEYED[screen] } : {}) });
        expect(built, screen).toEqual(linksScreenData(screen, period));
        const lines = findingsOf(screen, built);
        expect(lines.length, `${screen}\n${lines.join("\n")}`).toBeGreaterThan(0);
        for (const line of lines) expect(line, line).not.toMatch(/\$|£|cost|worth|cpc|undefined|NaN|null/i);
      }
    });

    test(`${period}: New and lost links sets the dates against the span before, and says nothing where the supplier counted nothing`, async () => {
      const built = await VISIBILITY_EYES["visibility.backlinksNewLost"](linksRun(period), { siteId: SITE, period });
      expect(built).toEqual(linksScreenData("visibility.backlinksNewLost", period));
      const lines = findingsOf("visibility.backlinksNewLost", built);
      if ((LINKS.periods[period].changes as unknown[]).length === 0) expect(lines).toEqual([]);
      else expect(lines[0], lines.join("\n")).toMatch(/^Links: \d+ new and \d+ lost/);
    });
  }

  test("Brand radar hands the eye what its screen hands it: quiet on More Handles' empty months, and its findings where AI answers name the group", async () => {
    const quiet = await VISIBILITY_EYES["visibility.radarOverview"](linksRun("lastMonth"), { siteId: SITE, period: "lastMonth" });
    expect(quiet).toEqual(linksScreenData("visibility.radarOverview", "lastMonth"));
    expect(findingsOf("visibility.radarOverview", quiet)).toEqual([]);
    // Three months by hand, as `convex/utils/sees/visibilityPeriods.test.ts` holds Brand radar's rules to.
    const radar = {
      months: ["2026-08", "2026-09", "2026-10"],
      businesses: [
        { host: HOST, you: true, mentions: 28, before: 40, asks: 5200, pagesCited: 3, series: [44, 40, 28] },
        { host: "handles4u.co.uk", you: false, mentions: 45, before: 30, asks: 7000, pagesCited: 12, series: [25, 30, 45] },
        { host: "ironmongerydirect.co.uk", you: false, mentions: 60, before: 58, asks: 9000, pagesCited: 20, series: [55, 58, 60] },
      ],
      questions: Array.from({ length: 30 }, (_, at) => ({ question: `Which door handles ${at}?`, volume: 1000 - at * 20, you: at % 3 === 0 ? 2 : null, rivals: at % 2 === 0 ? ["handles4u.co.uk"] : [], yourPage: null, tracked: false })),
    };
    const built = await VISIBILITY_EYES["visibility.radarOverview"](echoRun(HEADER, [], { "vis.radar": radar }), { siteId: SITE, period: "lastMonth" });
    expect(built).toEqual(radarSeen(radar, { rivalsNotYou: en.sites.radar.eye.rivalsNotYou }));
    const lines = findingsOf("visibility.radarOverview", built);
    expect(lines.some((line) => /^handles4u\.co\.uk: times AI answers name it rose/.test(line)), lines.join("\n")).toBe(true);
  });

  test("New and lost keywords reads no moves after a first check, as its screen asks for none", async () => {
    const asked: string[] = [];
    await VISIBILITY_EYES["visibility.keywordsNewLost"](linksRun("lastMonth", false, asked), { siteId: SITE, period: "lastMonth" });
    expect(asked).not.toContain("vis.moves");
  });
});

// --- Screens that hand their eye what one read answers, or a page of it ---

/** A run answering each read with what it was asked, so a test sees which read a screen made and how it opened it. */
function echoRun(header: Row = HEADER, asked: string[] = [], answers: Record<string, unknown> = {}): EyeRun {
  return async (read, args) => {
    if (!(read in VISIBILITY_EYE_READS)) throw new Error(`There's no read called ${read}.`);
    asked.push(read);
    if (read === "vis.site") return header;
    return read in answers ? answers[read] : { read, args };
  };
}
const ask = (screen: string, run: EyeRun, key?: string) => VISIBILITY_EYES[screen](run, { siteId: SITE, period: "lastMonth", ...(key ? { key } : {}) });
const opening = (sort: string, direction: string) => ({ sort, direction, page: 1, rows: 25 });

/** Ronins' answers (its address read as ronins.example, as the owner's own domain stays out of fixtures) for the sixteen screens given rules of their own on 22 November 2026, as saved on dev that day. */
type RoninsSpan = { from: string; to: string };
const RONINS = readFixture<Record<string, never> & { activity: { lines: never[]; periods: Record<string, Row & { span: RoninsSpan; before: RoninsSpan }> } }>("roninsVisibilityRest");
const RONINS_HOST = "ronins.example";
/** A run answering each read from Ronins' saved answers, noting each read and what it was asked with. */
function roninsRun(asked: Array<[string, Row]>): EyeRun {
  const answers: Record<string, (args: Row) => unknown> = {
    "vis.site": () => ({ ...HEADER, host: RONINS_HOST }),
    "vis.linkTotals": () => RONINS.linkTotals,
    "vis.referringDomains": () => RONINS.referringDomains,
    "vis.brokenBacklinks": () => RONINS.brokenBacklinks,
    "vis.backlinks": () => RONINS.backlinks,
    "vis.linkingWebsite": () => RONINS.linkingWebsite,
    "vis.anchorRecord": () => RONINS.anchorRecord,
    "vis.bandMoved": () => RONINS.bandMovedDown,
    "vis.bandMoves": () => RONINS.bandMoves,
    "vis.localProfile": () => RONINS.localProfile,
    "vis.localMaps": () => RONINS.localMaps,
    "vis.localActivity": (args) => ({ ...RONINS.activity.periods[args.period as string], lines: RONINS.activity.lines }),
    "vis.localListings": () => RONINS.localListings,
    "vis.localMarket": () => RONINS.localMarket,
    "vis.business": () => RONINS.businessAirSocial,
    "vis.radarQuestion": () => RONINS.radarQuestion,
    "vis.radarSources": () => RONINS.radarSources,
    "vis.radarWebsite": () => RONINS.radarWebsite,
    "vis.yourPages": () => RONINS.yourPages,
  };
  return async (read, args) => {
    if (!(read in VISIBILITY_EYE_READS)) throw new Error(`There's no read called ${read}.`);
    asked.push([read, args]);
    return answers[read]?.(args) ?? null;
  };
}

describe("Visibility's list and record screens hand their eye the screen's own read, as the screen opens it", () => {
  beforeEach(() => useFixedDay("2026-11-03"));
  afterEach(() => vi.useRealTimers());

  test("Backlinks' lists: their first page in their opening order, beside every link counted, built as their screens build them", async () => {
    const totals = ["vis.linkTotals", { siteId: SITE }];
    const lists: Record<string, [string, string, unknown]> = {
      "visibility.backlinksDomains": ["vis.referringDomains", "rank", linkingWebsitesSees(RONINS.referringDomains, RONINS.linkTotals, { linkingNow: NAMES.linkingNow, stoppedLinking: NAMES.stoppedLinking })],
      "visibility.backlinksBroken": ["vis.brokenBacklinks", "domainRank", brokenLinksSees(RONINS.brokenBacklinks, RONINS.linkTotals, { brokenLinks: NAMES.brokenLinks, brokenFollowed: NAMES.brokenFollowed, brokenWebsites: NAMES.brokenWebsites })],
      "visibility.backlinksAll": ["vis.backlinks", "domainRank", allBacklinksSees(RONINS.backlinks, RONINS.linkTotals, { lostLinks: NAMES.lostLinks, lostStrongest: NAMES.lostStrongest, redirectedLinks: NAMES.redirectedLinks, notFollowedLinks: NAMES.notFollowedLinks })],
    };
    for (const [screen, [read, sort, screenBuilds]] of Object.entries(lists)) {
      const asked: Array<[string, Row]> = [];
      expect(await ask(screen, roninsRun(asked)), screen).toEqual(screenBuilds);
      expect(asked, screen).toContainEqual([read, { siteId: SITE, ...opening(sort, "desc") }]);
      expect(asked, screen).toContainEqual(totals);
    }
  });

  test("a competitor's Backlinks lists aren't bought, and their screens show nothing", async () => {
    for (const screen of ["visibility.backlinksAll", "visibility.backlinksBroken", "visibility.backlinksAnchors", "visibility.backlinksIps", "visibility.backlinksNewLost"]) {
      const asked: string[] = [];
      expect(await ask(screen, echoRun({ ...HEADER, relationship: "TRACKED" }, asked)), screen).toBeNull();
      expect(asked, screen).toEqual(["vis.site"]);
    }
  });

  test("Local, Brand radar's Sources and Your pages hand their eye what their screens build from the same read", async () => {
    const kinds = en.sites.radar.sources.kinds as Record<string, string>;
    const details = en.sites.local.profile.details.names as Record<string, string>;
    const activity = RONINS.activity.periods.lastMonth;
    const built: Record<string, [string, Row, unknown]> = {
      "visibility.localProfile": ["vis.localProfile", { siteId: SITE }, profileSees(RONINS.localProfile, (detail) => details[detail], { searchesChecked: NAMES.searchesChecked, rivalsAverage: NAMES.rivalsAverage, reviewsAnswered: NAMES.reviewsAnswered, detailsToFix: NAMES.detailsToFix })],
      "visibility.localMaps": ["vis.localMaps", { siteId: SITE }, mapsSees(RONINS.localMaps, { searchesChecked: NAMES.searchesChecked })],
      "visibility.localActivity": ["vis.localActivity", { siteId: SITE, period: "lastMonth" }, activitySees({ ...activity, lines: RONINS.activity.lines } as never, { yourRivals: NAMES.yourRivals, you: RONINS_HOST })],
      "visibility.localListings": ["vis.localListings", { siteId: SITE }, listingsSees(RONINS.localListings, { yourOffices: NAMES.yourOffices, rivalsAhead: NAMES.rivalsAhead })],
      "visibility.localMarket": ["vis.localMarket", { siteId: SITE }, nearbySees(RONINS.localMarket, { moreReviewsNearby: NAMES.moreReviewsNearby })],
      "visibility.radarSources": ["vis.radarSources", { siteId: SITE }, sourcesSees(RONINS.radarSources, (kind) => kinds[kind], { namingYou: NAMES.namingYou, neverBesideYou: NAMES.neverBesideYou, besideRivals: NAMES.besideRivals })],
      "visibility.yourPages": ["vis.yourPages", { siteId: SITE, ...opening("clicks", "desc") }, yourPagesEye(RONINS.yourPages, { shownOnGoogle: NAMES.shownOnGoogle, neverShown: NAMES.neverShown, notInSitemap: NAMES.notInSitemap, ranking: NAMES.ranking, notCrawled: NAMES.notCrawled })],
    };
    for (const [screen, [read, args, screenBuilds]] of Object.entries(built)) {
      const asked: Array<[string, Row]> = [];
      expect(screenBuilds, screen).toBeTruthy();
      expect(await ask(screen, roninsRun(asked)), screen).toEqual(screenBuilds);
      expect(asked, screen).toContainEqual([read, args]);
    }
    // Every office and AI Overview gaps still hand their eye their read's answer.
    for (const [screen, read] of [["visibility.localOffices", "vis.localOffices"], ["visibility.overviewGaps", "vis.overviewGaps"]]) expect(await ask(screen, echoRun()), screen).toEqual({ read, args: { siteId: SITE } });
  });

  test("Your pages shows nothing on a competitor's website, or while its list is being built", async () => {
    expect(await ask("visibility.yourPages", echoRun(HEADER, [], { "vis.yourPages": { rows: [], own: false } }))).toBeNull();
    expect(await ask("visibility.yourPages", echoRun(HEADER, [], { "vis.yourPages": { rows: [], preparing: true } }))).toBeNull();
  });

  test("a screen about one thing reads the thing named, builds what its screen builds, and reads nothing without it", async () => {
    const kinds = en.sites.radar.sources.kinds as Record<string, string>;
    const keyed: Record<string, [string, string, Row, unknown]> = {
      "visibility.backlinksDomain": ["https://Mei.org.uk/a-page", "vis.linkingWebsite", { siteId: SITE, domain: "mei.org.uk" }, linkingWebsiteSees(RONINS.linkingWebsite, RONINS.linkTotals, { noAnchor: en.sites.backlinksAnchors.noAnchor, followedHeld: NAMES.followedHeld, lostHeld: NAMES.lostHeld })],
      "visibility.backlinksAnchor": ["Website by Ronins", "vis.anchorRecord", { siteId: SITE, anchor: "Website by Ronins" }, anchorSees(RONINS.anchorRecord, RONINS.linkTotals, { noAnchor: en.sites.backlinksAnchors.noAnchor, wholeWebsite: NAMES.wholeWebsite })],
      "visibility.keywordsBandsMoved": ["p11_20.p21_50", "vis.bandMoved", { siteId: SITE, from: "p11_20", to: "p21_50" }, bandSquareSees(RONINS.bandMovedDown, RONINS.bandMoves, { from: "p11_20", to: "p21_50" }, { square: "From 11–20 to 21–50", from: "11–20", to: "21–50" })],
      "visibility.business": ["airsocial.co.uk", "vis.business", { siteId: SITE, business: "airsocial.co.uk" }, null],
      "visibility.question": ["digital products agency", "vis.radarQuestion", { siteId: SITE, question: "digital products agency" }, questionSees(RONINS.radarQuestion, (kind) => kinds[kind], RONINS_HOST, { yourRivals: NAMES.yourRivals })],
      "visibility.website": ["https://www.reddit.com/r/diy", "vis.radarWebsite", { siteId: SITE, host: "www.reddit.com" }, sourceWebsiteSees(RONINS.radarWebsite, (kind) => kinds[kind], { besideRivals: NAMES.besideRivals, pagesNamingYou: NAMES.pagesNamingYou })],
    };
    for (const [screen, [key, read, args, screenBuilds]] of Object.entries(keyed)) {
      const asked: Array<[string, Row]> = [];
      const built = await ask(screen, roninsRun(asked), key);
      expect(asked, screen).toContainEqual([read, args]);
      // A business's posts count to today, as its screen counts them: the test's fixed day.
      expect(built, screen).toEqual(screenBuilds ?? businessSees(RONINS.businessAirSocial, ukDay(), { you: RONINS_HOST }));
      const none: Array<[string, Row]> = [];
      expect(await ask(screen, roninsRun(none)), screen).toBeNull();
      expect(none, screen).toEqual([]);
    }
    expect(await ask("visibility.localMapSearch", echoRun(), " door handles ")).toEqual({ read: "vis.localMapSearch", args: { siteId: SITE, keyword: "door handles" } });
    expect(await ask("visibility.localMapSearch", echoRun())).toBeNull();
    for (const screen of ["visibility.keywordRecord", "visibility.pageRecord"]) expect(await ask(screen, echoRun()), screen).toBeNull();
    expect(await ask("visibility.keywordsBandsMoved", echoRun(), "p01_03.p01_03")).toBeNull();
    expect(await ask("visibility.keywordsBandsMoved", echoRun(), "page one")).toBeNull();
  });

  test("a page's own screen reads the page by its path, whole address or not, with its searches best placed first", async () => {
    const asked: string[] = [];
    const built = await ask("visibility.pageRecord", echoRun(HEADER, asked), "https://morehandles.co.uk/door-handles.html") as { record: Row; keywords: Row };
    expect(built.record).toEqual({ read: "vis.pageRecord", args: { siteId: SITE, page: "/door-handles.html" } });
    expect(built.keywords).toEqual({ read: "vis.keywords", args: { siteId: SITE, path: "/door-handles.html", ...opening("position", "asc") } });
    // No guessed money reaches the eye, whatever the record carries.
    const priced = await ask("visibility.pageRecord", echoRun(HEADER, [], { "vis.pageRecord": { rank: { cpc: 0.97, trafficValue: 218, traffic: 225 } } }), "/door-handles.html");
    expect(JSON.stringify(priced)).not.toMatch(/cpc|trafficValue/);
  });
});
