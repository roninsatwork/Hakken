import { appendFileSync } from "node:fs";
import { readFixture } from "@/src/test/readFixture";
import { describe, expect, test } from "vitest";
import en from "../../../messages/en.json";
import {
  aiSearchNames, aiSearchSees, cannibalisationNames, cannibalisationSees, competingGroupNames, competingGroupSees, enquiriesNames, enquiriesSees,
  enquirySourceNames, enquirySourceSees, findingNames, findingSees, findingsNames, findingsSees, funnelNames, funnelSees, leaderboardsNames,
  leaderboardsSees, leagueNames, leagueSees, measurementNames, measurementSees, opportunitiesNames, opportunitiesSees, pagePlanNames, pagePlanSees,
  pageReviewNames, pageReviewSees, pageReviewsNames, pageReviewsSees, reportNames, reportSees, strategyNames, strategySees, summaryNames, summarySees,
  thisWeekNames, thisWeekSees, type InsightsWords,
} from "@/src/app/(dashboard)/app/insights/_components/insightsSees";
import { sourceWords } from "@/src/app/(dashboard)/app/insights/_components/insightPeriodWords";
import { findingWords } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

const periodsFixture = readFixture("moreHandlesInsightsPeriods");
const weekFixture = readFixture("moreHandlesInsightsWeek");

/**
 * Every Insights page's own findings on More Handles' own figures as saved on 3 November 2026
 * (ask-hakken-every-chart-page-plan-2026-11-03.md, section 9; Anthony, 2026-11-03: "we have a date selection picker FFS
 * … please add this to your tests"). Insights' period menu offers each whole month held, each whole quarter and the
 * last 12 months: the pages that follow it (Enquiries, a source's enquiries, the Funnel, the Summary) are held to every
 * one of the 20 More Handles has. The rest read the newest week, one state each. The figures are built through the
 * pages' own builders (`_components/insightsSees.ts`) and trimmed as the eye trims them, so the test reads what the eye
 * reads. Set SHOW_FINDINGS to a file's path to write down what each page finds.
 */

type T3 = [number, number | null, number | null];
type Fixture = {
  kindNames: Record<string, [string | null, string]>;
  periods: Record<string, {
    chosen: { id: string; kind: "MONTH" | "QUARTER" | "YEAR"; months: string[]; before: string[] | null; yearAgo: string[] | null };
    figures: { enquiries: T3; visits: T3; rate: T3; people: T3 | null; clicks: T3 | null; shown: T3 | null };
    kinds: Array<[string, number, number | null, number | null, number, number | null, number | null]>;
    sources: Array<[string, string, string, number, number | null, number | null, number, number | null, number | null]>;
    source: Record<string, { group: string; figures: { visits: T3; enquiries: T3 }; kinds: Array<[string | null, string, number, number]>; pages: Array<[string, number, number]> }>;
  }>;
  sourceMonths: Record<string, Array<[string, number, number]>>;
  searchClicks: number[];
  noEnquiryClicks: number[];
};
const FIX = periodsFixture as unknown as Fixture;
// The week's answers, shaped as their reads return them: typed loosely here, as the builders type their own inputs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WEEK = weekFixture as any;
const PERIODS = Object.keys(FIX.periods);

/** The section's words as the pages read them, `{name}` left for a rule to fill. */
const t: InsightsWords = (key, values = {}) => {
  const found = key.split(".").reduce<unknown>((at, part) => (at && typeof at === "object" ? (at as Record<string, unknown>)[part] : undefined), en.insights);
  if (typeof found !== "string") throw new Error(`No words for insights.${key}`);
  return found.replace(/\{(\w+)\}/g, (all, name: string) => String({ platformName: "Hakken", ...values }[name] ?? all));
};
const trio = ([now, before, yearAgo]: T3) => ({ now, before, yearAgo });
/** What a page found, written to the file named by SHOW_FINDINGS while the rules are tuned: read them, would a shop owner care? */
const show = (screen: string, said: string[]) => {
  if (process.env.SHOW_FINDINGS) appendFileSync(process.env.SHOW_FINDINGS, `\n${screen} (${expect.getState().currentTestName ?? ""})\n  ${said.join("\n  ")}\n`);
};

/** A period's view and its enquiries, as `insightsPeriodView` and `insightsEnquiries` return them. */
function periodOf(id: string) {
  const period = FIX.periods[id];
  const view = {
    siteId: "gs7s64z25gddkrkcarvpfjxw7x8fqkwn", host: "morehandles.co.uk", periods: [], chosen: period.chosen, months: [], sources: [], why: null, breakMonth: null,
    figures: { enquiries: trio(period.figures.enquiries), visits: trio(period.figures.visits), rate: trio(period.figures.rate), people: period.figures.people && trio(period.figures.people), clicks: period.figures.clicks && trio(period.figures.clicks), shown: period.figures.shown && trio(period.figures.shown) },
    kinds: period.kinds.map(([key, ...figures]) => ({ key, name: FIX.kindNames[key][0], type: FIX.kindNames[key][1], visits: trio(figures.slice(0, 3) as T3), enquiries: trio(figures.slice(3) as T3) })),
  };
  const enquiries = {
    siteId: view.siteId, host: view.host, chosen: period.chosen, events: [], pages: [], journey: null, byMonth: [],
    sources: period.sources.map(([key, name, group, ...figures]) => ({ key, name, group, visits: trio(figures.slice(0, 3) as T3), enquiries: trio(figures.slice(3) as T3) })),
    searches: FIX.searchClicks.map((clicks) => ({ search: "", page: "", kind: null, clicks, estimate: 0, sure: false })),
    noEnquiries: FIX.noEnquiryClicks.map((clicks) => ({ search: "", page: "", kind: null, clicks })),
  };
  return { view, enquiries };
}

function found(screen: string, data: unknown) {
  const said = pageFindings(screen, pageDataFor(data, screen)).map(findingWords);
  show(screen, said);
  return said;
}

/** Never Hakken's housekeeping, never money, never a code where a name should be. */
function clean(said: string[]) {
  const all = said.join("\n");
  expect(all).not.toMatch(/Not sorted|Unclassified|NOT_SORTED|NOT_RECORDED/);
  expect(all).not.toMatch(/£|\brevenue\b|\bworth\b|\bspend\b/i);
  expect(all).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
}

const sourceName = (row: { name: string; group: string }) => sourceWords(row.name, row.group, { typed: t("why.groups.TYPED"), unknown: t("enquiries.unknownSource") });

describe("Insights' pages that follow the period menu find the biggest things on every period (More Handles, 3 November 2026)", () => {
  // The oldest month held has nothing before it to set against: its figures stand alone.
  const compared = PERIODS.filter((id) => FIX.periods[id].chosen.before || FIX.periods[id].chosen.yearAgo);

  for (const id of PERIODS) {
    test(`What brings enquiries, ${id}`, () => {
      const { view, enquiries } = periodOf(id);
      const said = found("insights.enquiries", enquiriesSees(view as never, enquiries as never, null, enquiriesNames(t), sourceName));
      clean(said);
      if (!compared.includes(id)) return void expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(2);
      expect(said.some((line) => line.startsWith("The whole website: enquiries")), said.join("\n")).toBe(true);
      expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
    });

    for (const name of ["Google", "ChatGPT"]) {
      test(`One source's enquiries (${name}), ${id}`, () => {
        const { view } = periodOf(id);
        const own = FIX.periods[id].source[name];
        const source = {
          chosen: FIX.periods[id].chosen, group: own.group, figures: { visits: trio(own.figures.visits), enquiries: trio(own.figures.enquiries) },
          months: FIX.sourceMonths[name].map(([month, visits, enquiries]) => ({ month, visits, enquiries })),
          kinds: own.kinds.map(([kindName, type, visits, enquiries], at) => ({ key: String(at), name: kindName, type, visits, enquiries })),
          pages: own.pages.map(([path, visits, enquiries]) => ({ path, kind: null, visits, enquiries })),
        };
        const said = found("insights.enquiriesSource", enquirySourceSees(source as never, view as never, enquirySourceNames(t, name)));
        clean(said);
        // The oldest month has nothing before it; a small source then (ChatGPT sent 91 visits) has little else to set apart.
        if (!compared.includes(id)) return void expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(1);
        expect(said.some((line) => line.startsWith(`${name}: enquiries`)), said.join("\n")).toBe(true);
        expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
      });
    }

    test(`The funnel, ${id}`, () => {
      const { view } = periodOf(id);
      const said = found("insights.funnel", funnelSees(WEEK.conversion, view as never, null, funnelNames(t)));
      clean(said);
      // Its headline: the step between two of the funnel's steps that moved most against a year before.
      expect(said[0], said.join("\n")).toMatch(/^Enquired when they visited: enquiry rate (up|down)/);
      expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
    });

    test(`The summary, ${id}`, () => {
      const { view } = periodOf(id);
      const said = found("insights.summary", summarySees(view as never, WEEK.thisWeek, WEEK.leagues, WEEK.conversion, null, summaryNames(t), (month) => month));
      clean(said);
      if (compared.includes(id)) expect(said.some((line) => line.startsWith("The whole website: enquiries")), said.join("\n")).toBe(true);
      expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
    });
  }
});

describe("Insights' pages that read the newest week find the biggest things on it (More Handles, 3 November 2026)", () => {
  const monthName = (month: string) => month;

  test("AI search", () => {
    const engines = { chatgpt: en.aiEngines.chatgpt, gemini: en.aiEngines.gemini, claude: en.aiEngines.claude, perplexity: en.aiEngines.perplexity };
    const said = found("insights.aiSearch", aiSearchSees(WEEK.aiSearch, null, aiSearchNames(t, engines)));
    clean(said);
    expect(said[0], said.join("\n")).toMatch(/^AI assistants: visits (up|down)/);
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("Cannibalisation", () => {
    const said = found("insights.cannibalisation", cannibalisationSees(WEEK.cannibalisation, cannibalisationNames(t)));
    clean(said);
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("A cannibalisation group", () => {
    const said = found("insights.cannibalisationGroup", competingGroupSees(WEEK.group, competingGroupNames(t)));
    clean(said);
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("Findings", () => {
    const said = found("insights.findings", findingsSees(WEEK.allFindings, findingsNames(t)));
    clean(said);
    expect(said[0], said.join("\n")).toMatch(/^This week: findings (up|down)/);
    // Three weeks of findings, none checked yet: the week, the findings found again, the section holding most.
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(3);
  });

  test("A finding", () => {
    const heading = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);
    for (const finding of WEEK.findings) {
      const said = found("insights.finding", findingSees(finding, findingNames(t), heading));
      clean(said);
      expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(2);
    }
  });

  test("This week", () => {
    const said = found("insights.thisWeek", thisWeekSees(WEEK.thisWeek, thisWeekNames(t), monthName));
    clean(said);
    expect(said[0], said.join("\n")).toMatch(/^The whole website: visitors for one enquiry (up|down)/);
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("A report and Your month", () => {
    const monthly = found("insights.yourMonth", reportSees(WEEK.reports.monthly, reportNames(t), (month) => (month === WEEK.reports.monthly.period ? "September 2026" : month)));
    clean(monthly);
    expect(monthly[0], monthly.join("\n")).toMatch(/^September 2026: enquiries (up|down)/);
    expect(monthly.length, monthly.join("\n")).toBeGreaterThanOrEqual(4);
    const weekly = found("insights.report", reportSees(WEEK.reports.weekly, reportNames(t), monthName));
    clean(weekly);
    expect(weekly[0], weekly.join("\n")).toMatch(/^The whole website: enquiries (up|down)/);
    expect(weekly.length, weekly.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("Leaderboards", () => {
    const said = found("insights.leaderboards", leaderboardsSees(WEEK.leagues, null, leaderboardsNames(t)));
    clean(said);
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("A league, each of them", () => {
    for (const league of WEEK.leagues.leagues) {
      const said = found("insights.leaderboard", leagueSees(league, leagueNames(t, league.id)));
      clean(said);
      // Behind the leader: the leader, the website just above and just below. Leading (or level at the top), less to say.
      expect(said.length, `${league.id}\n${said.join("\n")}`).toBeGreaterThanOrEqual(league.place > 2 ? 3 : league.place === 2 ? 2 : 1);
    }
  });

  test("Measurement", () => {
    const said = found("insights.measurement", measurementSees(WEEK.measurement, null, measurementNames(t), (day) => day));
    clean(said);
    expect(said[0], said.join("\n")).toMatch(/^The last 28 days: visits for every 100 Google clicks (up|down)/);
    // No day broke on More Handles in these eight weeks: the ratio, the visits beside the clicks, weekends against weekdays.
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(3);
  });

  test("Opportunities", () => {
    const said = found("insights.opportunities", opportunitiesSees(WEEK.plan, null, opportunitiesNames(t), t("opportunities.notSorted")));
    clean(said);
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("The page plan", () => {
    const VERDICTS: Record<string, string> = { K: "KEEP", I: "IMPROVE", M: "MERGE", R: "REDIRECT", X: "REMOVE" };
    const decided = {
      pages: WEEK.decisions.pages, creates: [],
      decisions: (WEEK.decisions.rows as Array<[string, number, number]>).map(([verdict, kind, visits], at) => ({ path: `/${at}`, verdict: VERDICTS[verdict], kind: WEEK.decisions.kinds[kind], visits })),
    };
    const said = found("insights.pagePlan", pagePlanSees(WEEK.plan, decided as never, null, pagePlanNames(t), t("decisions.notSorted")));
    clean(said);
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("Page reviews", () => {
    const said = found("insights.pageReviews", pageReviewsSees(WEEK.conversion, pageReviewsNames(t)));
    clean(said);
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(3);
  });

  test("A page's review", () => {
    const said = found("insights.pageReview", pageReviewSees(WEEK.conversion.pages[0], WEEK.service, null, pageReviewNames(t)));
    clean(said);
    expect(said[0], said.join("\n")).toMatch(/^\/: visitors for one enquiry (up|down)/);
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("The strategy", () => {
    // Named as `useServiceName` names them: the guides, the home page, or the page's title before any "|".
    const serviceName = (service: { kind: string; title: string | null; page: string }) => (service.kind === "GUIDES" ? t("strategy.guides") : service.kind === "HOME" ? t("strategy.home") : service.title?.split("|")[0].trim() || service.page);
    const said = found("insights.strategy", strategySees(WEEK.strategy, null, strategyNames(t), serviceName));
    clean(said);
    expect(said.length, said.join("\n")).toBeGreaterThanOrEqual(4);
  });
});
