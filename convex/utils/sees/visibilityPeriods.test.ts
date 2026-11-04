import { describe, expect, test } from "vitest";
import { readFixture } from "@/src/test/readFixture";
import {
  aboveSeen, aiDemandSeen, aiMentionsSeen, auditSeen, featuresSeen, marketSeen, mentionsRivalsSeen, overviewSeen, paidSeen, radarSeen,
  reviewsRivalsSeen, reviewsSeen, rivalSeen, searchesSeen, shareSeen, sideBySideSeen, webMentionsSeen, winsLossesSeen,
} from "@/src/app/(dashboard)/app/sites/_components/siteSeesData";
import { findingWords } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

const moreHandles = readFixture("moreHandlesVisibility");

/**
 * Visibility's second half on every period the date menu offers (ask-hakken-every-chart-page-plan-2026-11-03.md, section
 * 10; Anthony, 2026-11-03: "we have a date selection picker FFS … please add this to your tests"): each page's figures
 * built the way the page builds them (`siteSeesData.ts`), cut as the eye cuts them (`pageDataFor`), and read by its own
 * rules (`own/visibility.ts`).
 *
 * Two sets of figures. More Handles' own, as saved on 3 November 2026 (`moreHandlesVisibility.json`): one check, on 5
 * October (its AI answers again on 15 October), no tracked searches, no Google profile, no web mentions, a crawl the
 * website turned away and no adverts — so most pages there have nothing to compare, and must say nothing untrue. Then a
 * website checked as Visibility checks one, a month apart (October 2025, then July to November 2026), written by hand in the
 * shape of the reads' answers from More Handles' own October figures: every page must find its headline and the
 * biggest things on every period that holds a check.
 */

type Row = Record<string, unknown>;
type Period = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last3Months" | "last6Months" | "last12Months";
type Range = { from: string; to: string; step: "day" | "week" | "month"; before: { from: string; to: string } };
const PERIODS: readonly Period[] = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"];
const HELD = moreHandles as unknown as { periods: Record<Period, Row & { range: Range }>; undated: Record<string, unknown> };
const UNDATED = HELD.undated as Record<string, never>;

/** Each finding in words, as Jev and the writer read them. */
function said(screen: string, data: unknown): string[] {
  const lines = pageFindings(screen, pageDataFor(data, screen)).map(findingWords);
  // `SHOW_FINDINGS=1 npx vitest run … --silent=false` prints every page's findings, to read them as a shop owner would.
  if (process.env.SHOW_FINDINGS) console.log(`${screen}\n  ${lines.join("\n  ")}`);
  return lines;
}

/** Never guessed money, never Hakken's housekeeping, never a code or an id where a name should be. */
function expectClean(lines: readonly string[]) {
  for (const line of lines) {
    expect(line, line).not.toMatch(/\$|cost|worth|spend|per click|cpc/i);
    expect(line, line).not.toMatch(/Not sorted|undefined|NaN|null/);
    expect(line, line).not.toMatch(/\b[0-9a-z]{32}\b/);
  }
}

const label = (feature: string) => ({ ai_overview: "AI Overview", local_pack: "Map pack", featured_snippet: "Featured snippet", people_also_ask: "People also ask", video: "Videos" } as Record<string, string>)[feature] ?? feature;
const engine = (name: string) => ({ chatgpt: "ChatGPT", perplexity: "Perplexity", gemini: "Gemini", claude: "Claude", ai_mode: "Google AI Mode" } as Record<string, string>)[name] ?? name;

// ---------------------------------------------------------------------------------------------------------------------
// More Handles, as saved: one check.
// ---------------------------------------------------------------------------------------------------------------------

describe("Visibility's second half on More Handles' own figures (one check, 5 October 2026), every period", () => {
  for (const period of PERIODS) {
    const held = HELD.periods[period];
    const range = held.range;
    const series = held.series as never;
    const seriesRivals = held.seriesRivals as never;
    const own = (series as Row[])[0] as never;

    test(`${period}: Side by side sets the website beside the rival in the middle of its group`, () => {
      const lines = said("visibility.competitors", sideBySideSeen(UNDATED.andRivals, UNDATED.rivals, seriesRivals, held.rivalMoves as never, { middle: "The rival in the middle of your group", youAbove: "Searches where you rank above it" }));
      expectClean(lines);
      // Its headline on every period: the table shows each website's newest check, whatever the dates.
      expect(lines, lines.join("\n")).toContain("morehandles.co.uk: estimated visitors from Google 11820, against 18294 for The rival in the middle of your group.");
      expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(3);
      // One check: no rival "moved".
      expect(lines.some((line) => /while yours went/.test(line)), lines.join("\n")).toBe(false);
    });

    test(`${period}: the Overview speaks only of what its panels and sections show`, () => {
      const lines = said("visibility.overview", overviewSeen(own, UNDATED.extras, engine, { middle: "The rival in the middle of your group", shared: "searches you share" }));
      expectClean(lines);
      // The top competitors section shows on every period.
      expect(lines.some((line) => line.startsWith("morehandles.co.uk: estimated visitors from Google 11820")), lines.join("\n")).toBe(true);
      expect(lines.some((line) => line.startsWith("handles4u.co.uk · searches you share")), lines.join("\n")).toBe(true);
      // The AI Overviews linking to it grew between the two days of October the dates hold as points.
      const twoPoints = (own as { points: unknown[] }).points.length >= 2;
      expect(lines.some((line) => line.includes("searches showing it in Google's AI Overviews up 23.7%")), lines.join("\n")).toBe(twoPoints);
    });

    test(`${period}: AI answers › Mentions finds the assistants apart, and each one's move between the two checks it shows`, () => {
      const lines = said("visibility.aiMentions", aiMentionsSeen(UNDATED.aiMentions, own, engine, { never: "Questions no assistant names you on", warned: "Answers warning against you", before: "The check before" }));
      expectClean(lines);
      expect(lines, lines.join("\n")).toContain("Perplexity: share of its answers naming the website 20%, against 40% for Gemini.");
      const points = ((own as { points: Array<{ ai: unknown[] }> }).points).filter((point) => point.ai.length > 0).length;
      expect(lines.some((line) => line.startsWith("ChatGPT: AI answers naming it up 100%")), lines.join("\n")).toBe(points >= 2);
    });

    test(`${period}: pages with nothing to compare say nothing untrue`, () => {
      const quiet: Array<[string, unknown]> = [
        ["visibility.googleAbove", aboveSeen(UNDATED.above, { aboveYou: "above you", first: "Searches where you rank first", notOnPage: "Searches where you are not in the top 100" })],
        ["visibility.googleSearches", searchesSeen(UNDATED.searches, undefined, { pageOne: "Searches on Google's first page", best: "Its best" })],
        ["visibility.googleMoves", winsLossesSeen(own, (held.seriesBefore as never[])[0], [], range.step, { up: "Moved up", down: "Moved down", dates: "These dates", usual: "A usual day" })],
        ["visibility.paid", paidSeen(own, { name: "morehandles.co.uk", visitsName: "Visits a month from adverts", beforeName: "The check before" })],
        ["visibility.audit", auditSeen(UNDATED.audit, own, null, (check) => check, { host: "morehandles.co.uk", errors: "Pages with errors" })],
        ["visibility.radarOverview", radarSeen(UNDATED.radar, { rivalsNotYou: "Questions naming rivals and not you" })],
        ["visibility.mentions", webMentionsSeen((held.webMentions as { rows: never[] }).rows, range, { kinds: String, kind: String, tone: String }, { business: "More Handles", noLink: "Pages naming you with no link", badly: "Speak badly of you" })],
        ["visibility.mentionsRivals", mentionsRivalsSeen(held.mentionsRivals as never, { middle: "The rival in the middle" })],
        ["visibility.reviews", reviewsSeen(held.reviews as never, range, { business: "More Handles" })],
        ["visibility.reviewsRivals", reviewsRivalsSeen(held.reviewsRivals as never, String, { answering: "The rival answering most" })],
      ];
      for (const [screen, data] of quiet) expect(said(screen, data), screen).toEqual([]);
    });
  }

  // Pages that show the newest check or the last 12 months, and draw no date menu: one set of figures for every period.
  test("Market map: a website you don't watch shares more of your searches than any rival you do", () => {
    const lines = said("visibility.competitorsMap", marketSeen((UNDATED.map as Row[]).filter((row) => row.role !== "FOUND" || row.kind === null || row.kind === "COMPETITOR") as never, { middle: "The website in the middle of your market", more: "Websites in your market with more visitors than you" }));
    expectClean(lines);
    expect(lines, lines.join("\n")).toContain("screwfix.com: searches shared with you 4873, against 3455 for ironmongerydirect.co.uk.");
    expect(lines.some((line) => line.startsWith("morehandles.co.uk: estimated visitors for each search ranked for 1.9")), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("Share of voice: yours against the rival named most, and the assistant where a rival beats you", () => {
    const lines = said("visibility.aiShare", shareSeen(UNDATED.share, engine));
    expectClean(lines);
    expect(lines, lines.join("\n")).toContain("morehandles.co.uk: of the mentions in AI answers 31.3%, against 20% for handles4u.co.uk.");
    expect(lines, lines.join("\n")).toContain("morehandles.co.uk · Perplexity: of the mentions in AI answers 30.8%, against 38.5% for ironmongerydirect.co.uk.");
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(3);
  });

  test("AI demand: with no AI figures yet, Google's searches against 11 months before, and the searches behind the change", () => {
    const lines = said("visibility.aiDemand", aiDemandSeen(UNDATED.aiDemand, { searches: "Your searches", google: "Searched on Google a month", onGoogle: "On Google", every: "Every search together" }));
    expectClean(lines);
    expect(lines.some((line) => line.startsWith("Your searches: monthly searches")), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(3);
    expect(lines.some((line) => line.includes("asks of AI")), lines.join("\n")).toBe(false);
  });

  test("A rival's own screen: the figures furthest apart, and the searches you share", () => {
    const lines = said("visibility.competitorsRival", rivalSeen("ironmongerydirect.co.uk", UNDATED.andRivals, "LEVEL", UNDATED.sharedAll, "THEM", UNDATED.shared, HELD.periods.lastMonth.seriesRivals as never, UNDATED.cited, { you: "morehandles.co.uk", theyLead: "Searches where ironmongerydirect.co.uk ranks above you" }));
    expectClean(lines);
    expect(lines, lines.join("\n")).toContain("morehandles.co.uk: estimated visitors from Google 11820, against 48616 for ironmongerydirect.co.uk.");
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A website checked a month apart, written by hand from More Handles' October figures.
// ---------------------------------------------------------------------------------------------------------------------

type Check = Row & { day: string };
const OCT = (HELD.periods.lastMonth.seriesRivals as Array<{ host: string; points: Check[] }>).map((line) => ({ host: line.host, october: line.points[0] }));
const ai = (named: Record<string, number>) => Object.entries(named).map(([name, count]) => ({ engine: name, asked: 10, named: count, recommended: count }));
const bands = (top3: number) => ({ p01_03: top3, p04_10: 1200, p11_20: 1700, p21_50: 2500, p51_up: 400 });
const flows = { rankedNew: 0, rankedLost: 0 };

/** Each website's checks: More Handles' own a month apart, each rival's moving its own way. */
const CHECKS: Record<string, Check[]> = {
  "morehandles.co.uk": [
    { day: "2025-10-05", estimatedTraffic: 9800, rankedKeywordsTotal: 5200, allBands: bands(380), referringDomains: 700, aiOverviewRefs: 60, localPacks: 1, featuredSnippets: 2, paidKeywords: 0, paidTraffic: 0, brokenPages: 8, onPageScore: 85, crawledPages: 900, rankedUp: 700, rankedDown: 800, ...flows, ai: ai({ chatgpt: 0, perplexity: 2, gemini: 3, claude: 2 }) },
    { day: "2026-07-05", estimatedTraffic: 14100, rankedKeywordsTotal: 6000, allBands: bands(470), referringDomains: 780, aiOverviewRefs: 140, localPacks: 2, featuredSnippets: 3, paidKeywords: 3, paidTraffic: 55, brokenPages: 10, onPageScore: 82, crawledPages: 930, rankedUp: 1300, rankedDown: 700, ...flows, ai: ai({ chatgpt: 1, perplexity: 4, gemini: 4, claude: 4 }) },
    { day: "2026-08-05", estimatedTraffic: 13900, rankedKeywordsTotal: 6050, allBands: bands(462), referringDomains: 785, aiOverviewRefs: 145, localPacks: 2, featuredSnippets: 3, paidKeywords: 4, paidTraffic: 58, brokenPages: 11, onPageScore: 81, crawledPages: 935, rankedUp: 1100, rankedDown: 900, ...flows, ai: ai({ chatgpt: 1, perplexity: 4, gemini: 5, claude: 4 }) },
    { day: "2026-09-05", estimatedTraffic: 13400, rankedKeywordsTotal: 6100, allBands: bands(455), referringDomains: 790, aiOverviewRefs: 150, localPacks: 2, featuredSnippets: 3, paidKeywords: 4, paidTraffic: 60, brokenPages: 12, onPageScore: 81, crawledPages: 940, rankedUp: 900, rankedDown: 1300, ...flows, ai: ai({ chatgpt: 1, perplexity: 4, gemini: 5, claude: 4 }) },
    { day: "2026-10-05", estimatedTraffic: 11820, rankedKeywordsTotal: 6355, allBands: bands(486), referringDomains: 805, aiOverviewRefs: 173, localPacks: 2, featuredSnippets: 3, paidKeywords: 9, paidTraffic: 45, brokenPages: 31, onPageScore: 74, crawledPages: 960, rankedUp: 1556, rankedDown: 2099, ...flows, ai: ai({ chatgpt: 2, perplexity: 3, gemini: 5, claude: 4 }) },
    { day: "2026-10-15", rankedUp: 0, rankedDown: 0, ...flows, aiOverviewRefs: 214, ai: ai({ chatgpt: 4, perplexity: 1, gemini: 3, claude: 3 }) },
    { day: "2026-11-02", estimatedTraffic: 10900, rankedKeywordsTotal: 6420, allBands: bands(470), referringDomains: 812, aiOverviewRefs: 230, localPacks: 2, featuredSnippets: 1, paidKeywords: 12, paidTraffic: 52, brokenPages: 35, onPageScore: 72, crawledPages: 980, rankedUp: 1400, rankedDown: 2600, ...flows, ai: ai({ chatgpt: 5, perplexity: 1, gemini: 4, claude: 3 }) },
  ],
  ...Object.fromEntries(OCT.filter((one) => one.host !== "morehandles.co.uk").map(({ host, october }, at) => {
    const traffic = october.estimatedTraffic as number;
    // handles4u.co.uk grows fast; the rest about level.
    const grow = host === "handles4u.co.uk" ? [0.85, 1.3] : [0.97 + at * 0.005, 1.02];
    const at2 = (factor: number) => ({ estimatedTraffic: Math.round(traffic * factor), rankedKeywordsTotal: Math.round((october.rankedKeywordsTotal as number) * factor), referringDomains: october.referringDomains, rankedUp: 100, rankedDown: 100, ...flows, ai: [] });
    return [host, [{ day: "2025-10-05", ...at2(grow[0] * 0.8) }, { day: "2026-07-05", ...at2(grow[0] * 0.98) }, { day: "2026-08-05", ...at2(grow[0] * 0.99) }, { day: "2026-09-05", ...at2(grow[0]) }, { ...october, day: "2026-10-05" }, { day: "2026-11-02", ...at2(grow[1]) }]];
  })),
};

const monday = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};
const bucketOf = (day: string, step: Range["step"]) => (step === "day" ? day : step === "week" ? monday(day) : `${day.slice(0, 7)}-01`);
const FLOWS = ["rankedUp", "rankedDown", "rankedNew", "rankedLost"];

/** A website's line as `siteCharts.siteSeries` answers it: its checks in the dates by step, and the check before them. */
function lineOf(host: string, range: Range) {
  const checks = CHECKS[host] ?? [];
  const merge = (list: readonly Check[]) => list.reduce<Row>((point, check) => {
    const next: Row = { ...point };
    for (const [field, value] of Object.entries(check)) {
      if (FLOWS.includes(field)) next[field] = ((point[field] as number | undefined) ?? 0) + (value as number);
      else if (field === "ai") {
        const held = new Map(((point.ai as Array<Row & { engine: string }> | undefined) ?? []).map((one) => [one.engine, { ...one }]));
        for (const one of value as Array<Row & { engine: string; asked: number; named: number; recommended: number }>) {
          const was = held.get(one.engine);
          held.set(one.engine, was ? { ...was, asked: (was.asked as number) + one.asked, named: (was.named as number) + one.named, recommended: (was.recommended as number) + one.recommended } : { ...one });
        }
        next.ai = [...held.values()];
      } else next[field] = value;
    }
    next.lastDay = check.day;
    return next;
  }, {});
  const inDates = checks.filter((check) => check.day >= range.from && check.day <= range.to);
  const buckets = [...new Set(inDates.map((check) => bucketOf(check.day, range.step)))].sort();
  const before = checks.filter((check) => check.day < range.from);
  return {
    websiteId: host, host, isYou: host === "morehandles.co.uk",
    points: buckets.map((bucket) => ({ ...merge(inDates.filter((check) => bucketOf(check.day, range.step) === bucket)), day: bucket })),
    before: before.length > 0 ? { ...merge(before.map((check) => ({ ...check, ...Object.fromEntries(FLOWS.map((flow) => [flow, 0])), ai: [] }))), ...(before.at(-1)!.ai ? { ai: before.at(-1)!.ai } : {}), ...Object.fromEntries(FLOWS.map((flow) => [flow, before.at(-1)![flow] ?? 0])), day: before.at(-1)!.day } : null,
  };
}
const linesOf = (range: Range) => Object.keys(CHECKS).map((host) => lineOf(host, range));

/** The newest check of each website, as Side by side's table reads it. */
const NEWEST = Object.entries(CHECKS).map(([host, checks]) => {
  const newest = checks.filter((check) => check.estimatedTraffic !== undefined).at(-1)!;
  return { websiteId: host, host, isYou: host === "morehandles.co.uk", day: newest.day, estimatedTraffic: newest.estimatedTraffic, keywords: newest.rankedKeywordsTotal, top3: (newest.allBands as { p01_03: number } | undefined)?.p01_03 ?? Math.round((newest.rankedKeywordsTotal as number) / 10), referringDomains: newest.referringDomains, domainRank: 400, backlinks: 20000 };
});

/** Days spread across the year, so each period holds its own: the newest the most. */
function daysOf(count: number, seed: number): string[] {
  return Array.from({ length: count }, (_, at) => {
    const spread = at % 4 === 0 ? 3 : at % 2 === 0 ? 45 : 400;
    const back = (at * 37 + seed * 11) % spread;
    const date = new Date(Date.UTC(2026, 10, 3) - back * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
}

const MENTIONS = daysOf(160, 1).map((day, at) => ({ url: `https://site${at}.example/${at}`, host: `site${at % 40}.example`, title: `Page ${at}`, day, kind: at % 5 === 0 ? 3 : at % 3 === 0 ? 2 : 1, tone: at % 9 === 0 ? 2 : at % 2 === 0 ? 1 : 0, strength: 20 + (at % 60), linked: day > "2026-10-01" ? (at % 4 === 0 ? 1 : 0) : (at % 3 === 0 ? 0 : 1) }));
const REVIEWS = daysOf(90, 2).map((day, at) => ({ listingId: "l1", id: `r${at}`, day, stars: day > "2026-10-01" ? (at % 4 === 0 ? 2 : 4) : 5, text: null, name: null, guide: false, replyDay: at % 3 === 0 ? null : new Date(Date.parse(day) + (day > "2026-10-01" ? 9 : 2) * 86_400_000).toISOString().slice(0, 10), replyRough: false }));

/** Web mentions against rivals and reviews against rivals, worked out for a period as their reads do. */
function mentionsRivalsFor(range: Range) {
  const count = (host: string, span: { from: string; to: string }, factor: number) => Math.round(MENTIONS.filter((row) => row.day >= span.from && row.day <= span.to).length * factor * (host === "handles4u.co.uk" && span === range ? 1.6 : 1));
  const hosts: Array<[string, number]> = [["morehandles.co.uk", 1], ["handles4u.co.uk", 0.8], ["ironmongerydirect.co.uk", 1.4], ["doorhandlecompany.co.uk", 0.5]];
  return {
    steps: [range.from],
    businesses: hosts.map(([host, factor]) => {
      const mentions = count(host, range, factor);
      return { host, you: host === "morehandles.co.uk", mentions, before: count(host, range.before, factor), well: Math.round(mentions / 2), badly: Math.round(mentions / 12), noLink: Math.round(mentions * (host === "morehandles.co.uk" ? 0.7 : 0.35)), series: [mentions] };
    }),
  };
}
function reviewsRivalsFor(range: Range) {
  const fresh = REVIEWS.filter((row) => row.day >= range.from && row.day <= range.to).length;
  return {
    steps: [range.from],
    rows: [
      { name: "More Handles", source: "GOOGLE", you: true, rating: 4.3, reviews: 90, newIn: fresh, answered: Math.round(fresh * 0.6), daysToAnswer: 9 },
      { name: "Handles 4 U", source: "GOOGLE", you: false, rating: 4.8, reviews: 410, newIn: fresh * 3 + 4, answered: fresh * 3, daysToAnswer: 2 },
      { name: "Door Handle Company", source: "GOOGLE", you: false, rating: 4.5, reviews: 160, newIn: fresh + 1, answered: fresh, daysToAnswer: 4 },
    ],
    lines: [],
  };
}

const ABOVE = Array.from({ length: 20 }, (_, at) => ({
  keyword: `door handle ${at + 1}`, position: at < 3 ? 1 : at < 17 ? 3 + at : null, day: "2026-11-02", pageKept: true, rivalsAbove: 0,
  above: at < 3 ? [] : [
    ...(at % 2 === 0 ? [{ position: 1, domain: "ironmongerydirect.co.uk", isRival: true }] : []),
    ...(at % 3 === 0 ? [{ position: 2, domain: "handles4u.co.uk", isRival: true }] : []),
    { position: 1, domain: "screwfix.com", isRival: false },
  ],
}));
const FEATURES = {
  checked: 20,
  searches: [],
  totals: [{ feature: "ai_overview", searches: 14, withSite: 2 }, { feature: "people_also_ask", searches: 18, withSite: null }, { feature: "local_pack", searches: 6, withSite: 1 }, { feature: "video", searches: 4, withSite: null }],
};
const TRACKED = Array.from({ length: 30 }, (_, at) => ({
  keyword: `brass door handles ${at + 1}`, isActive: true, verdict: at % 6 === 0 ? "SLIPPING" : at < 10 ? "PAGE_ONE" : "RANKING",
  lastPosition: at === 4 ? 14 : at === 7 ? 3 : at === 9 ? 18 : 2 + at, previousPosition: at === 4 ? 6 : at === 7 ? 11 : at === 9 ? 9 : at === 6 ? 7 : 1 + at, bestPosition: at === 20 ? 4 : 1 + Math.min(at, 10), lastCheckedDay: "2026-11-02",
}));
const MOVES = [
  { keyword: "door handles", position: 3, previousPosition: 9, change: 6, volume: 74000, traffic: 4000, page: "/door-handles" },
  { keyword: "brass knobs", position: 22, previousPosition: 6, change: -16, volume: 2900, traffic: 10, page: "/knobs" },
  { keyword: "lever handles", position: 5, previousPosition: 7, change: 2, volume: 8100, traffic: 300, page: "/lever" },
];
const MOVES_LATELY = OCT.filter((one) => one.host !== "morehandles.co.uk").map(({ host }, at) => ({ siteId: host, host, checked: true, lastCheck: "2026-11-02", newSearches: host === "handles4u.co.uk" ? 640 : 40 + at * 10, climbed: 200, fell: 150, visits: 1000, visitsBefore: 900, biggestNew: null }));
const COMPARED = OCT.filter((one) => one.host !== "morehandles.co.uk").map(({ host }, at) => ({ host, beatsYouOn: host === "ironmongerydirect.co.uk" ? 14 : 3 + at, youBeatOn: host === "ironmongerydirect.co.uk" ? 4 : 6, comparedOn: 20, verdict: "LEVEL", rankedOn: 20, namedInAnswers: 0, answersCounted: 80, lastSeenDay: "2026-11-02", relationship: "TRACKED", websiteId: host }));
const DEMAND = {
  month: "2026-10",
  rows: (UNDATED.aiDemand as { rows: Array<{ keyword: string; google: number | null; googleMonths: number[] }> }).rows.slice(0, 40).map((row, at) => {
    const base = 100 + at * 30;
    const aiMonths = Array.from({ length: 12 }, (_, month) => Math.round(base * (at % 4 === 0 ? 1 + month * 0.12 : 1)));
    return { ...row, from: at < 10 ? "SEARCH" : "KEYWORD", ai: aiMonths[11], aiMonths };
  }),
};
const RADAR = {
  months: ["2026-08", "2026-09", "2026-10"],
  businesses: [
    { host: "morehandles.co.uk", you: true, mentions: 28, before: 40, asks: 5200, pagesCited: 3, series: [44, 40, 28] },
    { host: "handles4u.co.uk", you: false, mentions: 45, before: 30, asks: 7000, pagesCited: 12, series: [25, 30, 45] },
    { host: "ironmongerydirect.co.uk", you: false, mentions: 60, before: 58, asks: 9000, pagesCited: 20, series: [55, 58, 60] },
  ],
  questions: Array.from({ length: 30 }, (_, at) => ({ question: `Which door handles ${at}?`, volume: 1000 - at * 20, you: at % 3 === 0 ? 2 : null, rivals: at % 2 === 0 ? ["handles4u.co.uk"] : [], yourPage: null, tracked: false })),
};
const AUDIT = {
  day: "2026-11-02", pagesCrawled: 980, pagesFound: 1200, onPageScore: 72, turnedAway: null, cms: null, server: "cloudflare", maxPages: 1000, linksExternal: 0, linksInternal: 0,
  issues: [{ check: "broken links", severity: "ERROR", pages: 35 }, { check: "missing descriptions", severity: "WARNING", pages: 410 }, { check: "slow pages", severity: "WARNING", pages: 120 }, { check: "long titles", severity: "NOTICE", pages: 60 }],
};
const SHARED = { total: 1240, rows: [{ keyword: "door handles", theirPosition: 2, yourPosition: 15, volume: 74000, theirTraffic: 6000 }, { keyword: "hinges", theirPosition: 1, yourPosition: 4, volume: 74000, theirTraffic: 9000 }] };

/** Whether the period's dates hold a check of More Handles': with none the pages show nothing, and must say nothing. */
const holdsCheck = (range: Range) => CHECKS["morehandles.co.uk"].some((check) => check.estimatedTraffic !== undefined && check.day >= range.from && check.day <= range.to);
const begun = (period: Period) => period === "thisWeek" || period === "thisMonth";

describe("Visibility's second half with a check a month apart (by hand, from More Handles' October figures), every period", () => {
  for (const period of PERIODS) {
    const range = HELD.periods[period].range;
    const lines = linesOf(range);
    const own = lines[0] as never;
    const before = { ...range, from: range.before.from, to: range.before.to };
    const ownBefore = lineOf("morehandles.co.uk", before) as never;
    const enough = begun(period) ? 2 : 4;

    // A period whose dates hold no check of the website (Last week, 26 October to 1 November): its dated pages show
    // nothing, and say nothing.
    test(`${period}: the dated pages find their headline and the biggest things, or say nothing with no check in the dates`, () => {
      const pages: Array<[string, unknown, RegExp, number]> = [
        ["visibility.overview", overviewSeen(own, UNDATED.extras, engine, { middle: "The rival in the middle of your group", shared: "searches you share" }), /^morehandles\.co\.uk: (estimated visitors from Google|searches ranked for)/, enough],
        ["visibility.competitors", sideBySideSeen(NEWEST as never, COMPARED as never, lines as never, MOVES_LATELY as never, { middle: "The rival in the middle of your group", youAbove: "Searches where you rank above it" }), /^morehandles\.co\.uk: estimated visitors from Google/, enough],
        ["visibility.googleMoves", winsLossesSeen(own, ownBefore, MOVES, range.step, { up: "Moved up", down: "Moved down", dates: "These dates", usual: "A usual step", before: "The span before" }), /^Moved up: searches/, begun(period) ? 2 : 3],
        ["visibility.paid", paidSeen(own, { name: "morehandles.co.uk", visitsName: "Visits a month from adverts", beforeName: "The check before" }), /^morehandles\.co\.uk: searches with adverts/, 1],
        ["visibility.audit", auditSeen(AUDIT as never, own, null, (check) => check, { host: "morehandles.co.uk", errors: "Pages with errors" }), /^morehandles\.co\.uk: broken pages/, enough],
        ["visibility.googleFeatures", featuresSeen(FEATURES as never, own, label, { host: "morehandles.co.uk", withSite: "With this website in it" }), /^morehandles\.co\.uk: searches showing it in Google's AI Overviews (up|down)/, begun(period) ? 2 : 3],
        ["visibility.aiMentions", aiMentionsSeen((UNDATED.aiMentions as never[]), own, engine, { never: "Questions no assistant names you on", warned: "Answers warning against you", before: "The check before" }), /^(ChatGPT|Perplexity|Gemini|Claude): /, begun(period) ? 2 : 3],
      ];
      for (const [screen, data, headline, least] of pages) {
        const found = said(screen, data);
        expectClean(found);
        if (!holdsCheck(range)) {
          // No check in the dates: the panels, boxes and charts show nothing, and nothing is said of them. Wins and
          // losses' table, Side by side's table and the Overview's competitors show the newest check whatever the dates.
          expect(found.filter((line) => /the span before|from \d+ before|, to \d/.test(line) && !/biggest (climb|drop)/.test(line)), `${screen}\n${found.join("\n")}`).toEqual([]);
          continue;
        }
        expect(found.some((line) => headline.test(line)), `${screen}: its headline\n${found.join("\n")}`).toBe(true);
        expect(found.length, `${screen}\n${found.join("\n")}`).toBeGreaterThanOrEqual(least);
      }
    });

    test(`${period}: Web mentions, Against rivals, Your reviews and Reviews against rivals, over their own days`, () => {
      const pages: Array<[string, unknown, RegExp]> = [
        ["visibility.mentions", webMentionsSeen(MENTIONS, range, { kinds: (kind) => kind.toLowerCase(), kind: (kind) => kind, tone: (tone) => tone }, { business: "More Handles", noLink: "Pages naming you with no link", badly: "Speak badly of you" }), /^More Handles: mentions|^Pages naming you with no link/],
        ["visibility.mentionsRivals", mentionsRivalsSeen(mentionsRivalsFor(range), { middle: "The rival in the middle" }), /handles4u\.co\.uk: mentions|morehandles\.co\.uk: mentions/],
        ["visibility.reviews", reviewsSeen({ figures: { googleRating: 4.3, newIn: REVIEWS.filter((row) => row.day >= range.from && row.day <= range.to).length, newBefore: REVIEWS.filter((row) => row.day >= range.before.from && row.day <= range.before.to).length, waiting: REVIEWS.filter((row) => !row.replyDay).length, oldestWaitingDays: 40, daysToAnswer: 9 }, points: [], rows: REVIEWS }, range, { business: "More Handles", stars: "Average stars, these dates", before: "The span before", waiting: "Not answered", low: "1 to 3 stars", reply: "Days to answer" }), /^More Handles: new reviews|^Average stars/],
        ["visibility.reviewsRivals", reviewsRivalsSeen(reviewsRivalsFor(range), String, { answering: "The rival answering most" }), /^More Handles: star rating/],
      ];
      for (const [screen, data, headline] of pages) {
        const found = said(screen, data);
        expectClean(found);
        expect(found.some((line) => headline.test(line)), `${screen}: its headline\n${found.join("\n")}`).toBe(true);
        expect(found.length, `${screen}\n${found.join("\n")}`).toBeGreaterThanOrEqual(begun(period) ? 2 : 3);
      }
    });
  }

  test("the pages with no date menu: Who ranks above you, Your searches, Market map, A rival, AI demand, Share of voice, Brand radar", () => {
    const pages: Array<[string, unknown, RegExp, number]> = [
      ["visibility.googleAbove", aboveSeen(ABOVE, { aboveYou: "above you", first: "Searches where you rank first", notOnPage: "Searches where you are not in the top 100" }), /^ironmongerydirect\.co\.uk · above you/, 4],
      ["visibility.googleSearches", searchesSeen(TRACKED, undefined, { pageOne: "Searches on Google's first page", best: "Its best", slipping: "Slipping" }), /^Searches on Google's first page/, 4],
      ["visibility.competitorsRival", rivalSeen("handles4u.co.uk", NEWEST as never, "AHEAD", 3112, "THEM", SHARED, linesOf(HELD.periods.last3Months.range) as never, [{ times: 6 }], { you: "morehandles.co.uk", theyLead: "Searches where handles4u.co.uk ranks above you" }), /^morehandles\.co\.uk: estimated visitors from Google/, 4],
      ["visibility.aiDemand", aiDemandSeen(DEMAND as never, { searches: "Your searches", google: "Searched on Google a month", onGoogle: "On Google", every: "Every search together" }), /^Your searches: asks of AI a month/, 3],
      ["visibility.radarOverview", radarSeen(RADAR, { rivalsNotYou: "Questions naming rivals and not you" }), /^handles4u\.co\.uk: times AI answers name it rose/, 4],
    ];
    for (const [screen, data, headline, least] of pages) {
      const found = said(screen, data);
      expectClean(found);
      expect(found.some((line) => headline.test(line)), `${screen}: its headline\n${found.join("\n")}`).toBe(true);
      expect(found.length, `${screen}\n${found.join("\n")}`).toBeGreaterThanOrEqual(least);
    }
  });

  test("a rival moving against you on Side by side over three months: handles4u.co.uk up while you fell", () => {
    const range = HELD.periods.last3Months.range;
    const found = said("visibility.competitors", sideBySideSeen(NEWEST as never, COMPARED as never, linesOf(range) as never, MOVES_LATELY as never, { middle: "The rival in the middle of your group", youAbove: "Searches where you rank above it" }));
    expect(found, found.join("\n")).toContain("handles4u.co.uk: estimated visitors from Google rose to 25511 from 16347 the span before, while yours went to 10900 from 14100.");
  });
});
