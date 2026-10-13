import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { leaguesFrom } from "@/convex/utils/insightLeagues";
import type { Fact } from "@/convex/utils/insightFacts";
import InsightsLeaderboardsPage from "./leaderboards/page";
import InsightsLeaguePage from "./leaderboards/[league]/page";
import InsightsSummaryPage from "./summary/page";
import InsightsThisWeekPage from "./this-week/page";
import InsightsAllFindingsPage from "./findings/page";
import InsightsFindingPage from "./findings/[findingId]/page";
import InsightsYourMonthPage from "./your-month/page";
import InsightsReportsPage from "./reports/page";
import InsightsStrategyPage from "./strategy/page";
import InsightsServicePage from "./strategy/service/page";
import InsightsTrackRecordPage from "./track-record/page";
import InsightsMeasurementPage from "./measurement/page";
import InsightsSourcesPage from "./sources/page";
import InsightsOpportunitiesPage from "./opportunities/page";
import InsightsPagePlanPage from "./page-plan/page";
import InsightsFunnelPage from "./funnel/page";
import InsightsPageReviewsPage from "./page-reviews/page";
import InsightsPageReviewPage from "./page-reviews/page/page";
import InsightsExperimentsPage from "./experiments/page";
import InsightsEnquiriesPage from "./enquiries/page";
import InsightsEnquirySourcePage from "./enquiries/source/page";
import InsightsCannibalisationPage from "./cannibalisation/page";
import InsightsCompetingGroupPage from "./cannibalisation/group/page";
import InsightsAiSearchPage from "./ai-search/page";
import InsightsFindingsSectionPage from "./findings/sections/[section]/page";

/**
 * Insights' screens hold to the looks drawn and approved on 2026-10-11
 * (docs/plans/active/insights-analyst-plan.md §11; the boards in
 * docs/plans/assets/insights-analyst/): each screen, rendered with sample
 * figures in English, reads as the outline saved in
 * docs/plans/assets/insights-analyst/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/insights/leaderboards", search: "", league: "", section: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ league: nav.league, findingId: "finding_1", section: nav.section }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

const PLAN = "insights-analyst";
const HOSTS = ["ronins.co.uk", "plugandplay.co.uk", "pixelfield.co.uk", "chilliapple.co.uk", "lightflows.co.uk"];

/** Sample market facts, shaped as the reading layer's, for five websites. */
function facts(): Fact[] {
  const out: Fact[] = [];
  const add = (key: string, value: number, source: Fact["source"] = "market") => out.push({ key, value, unit: "count", source, label: key });
  HOSTS.forEach((host, index) => {
    add(`seo.${host}.traffic.now`, [1054, 576, 956, 2739, 1320][index]);
    add(`seo.${host}.traffic.year`, [939, 4760, 3323, 8066, 1605][index]);
    add(`seo.${host}.strength.now`, [290, 453, 408, 392, 383][index]);
    add(`seo.${host}.top3.now`, [63, 35, 196, 437, 138][index]);
    add(`seo.${host}.linkingSites.now`, [498, 532, 1452, 700, 513][index]);
    add(`seo.${host}.aiOverviews.now`, [134, 82, 288, 521, 146][index]);
    add(`ai.${host}.mentions.now`, [222, 113, 481, 764, 237][index], "ai");
    add(`ai.cited.${host}`, [9, 1, 3, 2, 0][index], "ai");
    add(`ai.answers.chatgpt.${host}.named`, [0, 3, 3, 0, 0][index], "ai");
    add(`ai.answers.chatgpt.${host}.recommended`, [0, 3, 3, 0, 0][index], "ai");
  });
  add("ai.answers.chatgpt.asked", 40, "ai");
  add("local.own.Ronins Group.reviews", 16, "local");
  add("local.rival.Air Social.reviews", 64, "local");
  return out;
}

const LEAGUES = { siteId: "site_1", host: "ronins.co.uk", rivals: 4, asOf: "2026-10-05", leagues: leaguesFrom(facts(), "ronins.co.uk") };
const YEAR = { from: "2025-10-11", to: "2026-10-10" };
const YEAR_BEFORE = { from: "2024-10-11", to: "2025-10-10" };
const FINDING_ROW = {
  findingId: "finding_1", siteId: "site_1", host: "ronins.co.uk", week: "2026-10-05", rank: 1, specialist: "strategy", pattern: "sameVisitorsFewerResults",
  headline: "Search sent the same visitors but 101 enquiries, down from 171.", action: "Give the guides people read a way to an enquiry.",
  sure: "HIGH", sources: ["analytics", "searchConsole"], atStake: 70, ruledOut: 2, isNew: true, outcome: null, checkOn: "2026-12-07", createdAt: Date.parse("2026-10-11T07:00:00Z"),
};
/** Findings in sections (insights-intelligence-plan.md phase 7): one each from search, AI answers and the strategist. */
const ALL_FINDINGS = [
  FINDING_ROW,
  { ...FINDING_ROW, findingId: "finding_2", specialist: "search", pattern: "almostOnPageOne", headline: "Twelve searches are a place from page one.", atStake: 20, rank: 2 },
  { ...FINDING_ROW, findingId: "finding_3", specialist: "aiVisibility", pattern: "missingFromAnAssistant", headline: "Perplexity never names you for branding.", atStake: null, rank: 3, checkOn: "2027-01-04" },
];
const SCORE = [
  { measure: "enquiries", now: 26, before: 74, unit: "count", lowerIsBetter: false, place: null, places: null, status: "BEHIND" },
  { measure: "visitorsPerEnquiry", now: 19, before: 10, unit: "count", lowerIsBetter: true, place: null, places: null, status: "BEHIND" },
  { measure: "marketShare", now: 15.9, before: 5, unit: "percent", lowerIsBetter: false, place: 3, places: 5, status: "ON_TRACK" },
];
/** The period chosen in the header, as the history reads it (insights-intelligence-plan.md phases 1 and 8): three months of Ronins'. */
const MONTH_POINT = (month: string, visits: number, enquiries: number) => ({
  month, whole: true, visits, enquiries, people: Math.round(visits * 0.7), clicks: 390, shown: 294618, position: 19.2, share: 46,
  service: { visits: Math.round(visits * 0.4), enquiries: Math.round(enquiries * 0.4), clicks: 125, shown: 218788, position: 20.7 },
  groups: [{ group: "GOOGLE", visits: Math.round(visits * 0.7), enquiries: Math.round(enquiries * 0.5) }, { group: "AI", visits: 6, enquiries: 0 }],
  rivals: 6132,
});
const PERIOD_VIEW = {
  siteId: "site_1", host: "ronins.co.uk",
  periods: [{ id: "2026-09", kind: "MONTH" }, { id: "2026-08", kind: "MONTH" }],
  chosen: { id: "2026-09", kind: "MONTH", months: ["2026-09"], before: ["2026-08"], yearAgo: ["2025-09"] },
  figures: {
    enquiries: { now: 10, before: 7, yearAgo: 26 }, visits: { now: 240, before: 201, yearAgo: 366 }, people: { now: 175, before: 156, yearAgo: 235 },
    rate: { now: 4.2, before: 3.5, yearAgo: 7.1 }, clicks: { now: 390, before: 338, yearAgo: 422 }, shown: { now: 294618, before: 376191, yearAgo: 329362 },
  },
  months: [MONTH_POINT("2025-09", 366, 26), MONTH_POINT("2026-08", 201, 7), MONTH_POINT("2026-09", 240, 10)],
  kinds: [], sources: [],
  why: {
    compare: "YEAR_AGO", lost: 16, split: { counting: 3, visits: 5, rate: 8 }, paragraph: null,
    tests: [
      { id: "COUNTING", verdict: "LIKELY", part: 3, figures: { shareNow: 46, shareThen: 59 }, sources: ["analytics", "searchConsole"] },
      { id: "MARKET", verdict: "PART", part: null, figures: { rivalsNow: 6132, rivalsThen: 17160, shownNow: null, shownThen: null, clicksNow: 125, clicksThen: 130 }, sources: ["dataForSeo", "searchConsole"] },
      { id: "RANKINGS", verdict: "WATCH", part: null, figures: { positionNow: 20.7, positionThen: null, bestMonth: "2026-03", bestPosition: 17.5, pageOneNow: null, pageOneBefore: null }, sources: ["searchConsole", "dataForSeo", "googleUpdates"] },
      { id: "SHOWN", verdict: "NO_DATA", part: null, figures: { shownNow: 218788, shownThen: null, aiWith: null, aiOf: null }, sources: ["searchConsole", "dataForSeo"] },
      { id: "SOURCES", verdict: "LIKELY", part: 5, figures: { source0: "AI", source0Now: 6, source0Then: 32 }, sources: ["analytics"] },
      { id: "CONVERSION", verdict: "BIGGEST", part: 8, figures: { rateNow: 4.2, rateThen: 7.1, serviceRateNow: 4.3, serviceRateThen: 8.6 }, sources: ["analytics"] },
    ],
  },
  breakMonth: "2025-10",
};

const TRIO = (now: number, before: number, yearAgo: number) => ({ now, before, yearAgo });
const KIND = (key: string, name: string | null, type: string, visits: [number, number, number], enquiries: [number, number, number]) => ({ key, name, type, visits: TRIO(...visits), enquiries: TRIO(...enquiries) });
/** What brings enquiries (insights-intelligence-plan.md phase 2): Ronins' September 2026 by kind, source, search and event. */
const ENQUIRY_VIEW = { ...PERIOD_VIEW, kinds: [
  KIND("service", "Service", "SERVICE", [92, 80, 101], [4, 3, 12]), KIND("hub", "Content hub", "INFORMATIONAL", [54, 50, 120], [1, 1, 3]),
  KIND("brand", "Brand", "OTHER", [53, 40, 90], [3, 2, 10]), KIND("NOT_SORTED", null, "NOT_SORTED", [12, 9, 20], [0, 0, 0]),
], sources: [{ group: "GOOGLE", visits: TRIO(177, 150, 250), enquiries: TRIO(5, 4, 17) }, { group: "AI", visits: TRIO(6, 9, 32), enquiries: TRIO(0, 0, 2) }] };
const ENQUIRIES = {
  siteId: "site_1", host: "ronins.co.uk", chosen: PERIOD_VIEW.chosen,
  sources: [
    { key: "Organic Search\u001fgoogle", group: "GOOGLE", name: "Google", visits: TRIO(177, 150, 250), enquiries: TRIO(5, 4, 17) },
    { key: "Direct\u001f(direct)", group: "TYPED", name: "(direct)", visits: TRIO(43, 30, 40), enquiries: TRIO(5, 3, 2) },
    { key: "AI Assistant\u001fchatgpt.com", group: "AI", name: "ChatGPT", visits: TRIO(5, 8, 27), enquiries: TRIO(0, 0, 2) },
  ],
  events: [
    { name: "form_submission", counted: true, times: TRIO(13, 9, 30), enquiries: TRIO(10, 7, 26) },
    { name: "contact", counted: false, times: TRIO(2, 1, 4), enquiries: TRIO(0, 0, 0) },
  ],
  pages: [
    { path: "/", kind: "Brand", type: "OTHER", visits: TRIO(51, 40, 70), enquiries: TRIO(3, 2, 9), from: { GOOGLE: 1, AI: 0, TYPED: 2, OTHER: 0 } },
    { path: "/ai-agency", kind: "Service", type: "SERVICE", visits: TRIO(52, 40, 30), enquiries: TRIO(2, 1, 3), from: { GOOGLE: 1, AI: 1, TYPED: 0, OTHER: 0 } },
  ],
  journey: { from: "2026-07-14", to: "2026-10-11", rows: [{ path: "/about-us/", kind: "Brand", visits: 65, enquiries: 4 }, { path: "/ai-agency/", kind: "Service", visits: 158, enquiries: 3 }] },
  searches: [{ search: "ai agency", page: "/ai-agency/", kind: "Service", clicks: 106, estimate: 1.6, sure: true }, { search: "ronins", page: "/", kind: "Brand", clicks: 41, estimate: 0.4, sure: false }],
  noEnquiries: [{ search: "bespoke web design", page: "/hub/what-is-bespoke-web-design/", kind: "Content hub", clicks: 12 }],
  byMonth: [
    { month: "2025-09", kinds: [{ key: "service", visits: 101, enquiries: 12 }, { key: "brand", visits: 90, enquiries: 10 }], events: [{ name: "form_submission", enquiries: 26 }] },
    { month: "2026-08", kinds: [{ key: "service", visits: 80, enquiries: 3 }, { key: "brand", visits: 40, enquiries: 2 }], events: [{ name: "form_submission", enquiries: 7 }] },
    { month: "2026-09", kinds: [{ key: "service", visits: 92, enquiries: 4 }, { key: "brand", visits: 53, enquiries: 3 }], events: [{ name: "form_submission", enquiries: 10 }] },
  ],
};
const ENQUIRY_SOURCE = {
  chosen: PERIOD_VIEW.chosen, group: "AI",
  figures: { visits: TRIO(5, 8, 27), enquiries: TRIO(0, 0, 2) },
  months: [{ month: "2025-09", visits: 27, enquiries: 2 }, { month: "2026-08", visits: 8, enquiries: 0 }, { month: "2026-09", visits: 5, enquiries: 0 }],
  kinds: [{ key: "service", name: "Service", type: "SERVICE", visits: 4, enquiries: 0 }, { key: "brand", name: "Brand", type: "OTHER", visits: 1, enquiries: 0 }],
  pages: [{ path: "/ai-agency", kind: "Service", visits: 2, enquiries: 0 }, { path: "/venture-studio", kind: "Service", visits: 2, enquiries: 0 }],
};

/** Keyword cannibalisation (insights-intelligence-plan.md phase 3): Ronins' AI pages, as the weekly read kept them. */
const AI_GROUP = {
  key: "/ai-agency/", name: "ai agency london", owner: "/ai-agency/",
  pages: [
    { path: "/ai-agency/", kind: "Service", type: "SERVICE", visits: 708, enquiries: 34, recent: 6, recentBefore: 10, shownAll: 42482, clicks: 13, shown: 7824, searches: 150, decision: "OWNER" },
    { path: "/ai-consultancy/", kind: "Service", type: "SERVICE", visits: 85, enquiries: 6, recent: 1, recentBefore: 0, shownAll: 71556, clicks: 4, shown: 17923, searches: 120, decision: "DIFFERENTIATE" },
    { path: "/ai-software-development-company/", kind: "Service", type: "SERVICE", visits: 35, enquiries: 0, recent: 0, recentBefore: 0, shownAll: 4000, clicks: 3, shown: 2122, searches: 40, decision: "MERGE" },
  ],
  searches: [
    { search: "ai agency london", shown: 3000, clicks: 9, split: true, position: 8.2, volume: 480, top: "/ai-agency/", pages: [{ path: "/ai-agency/", shown: 1800, clicks: 9 }, { path: "/ai-consultancy/", shown: 1200, clicks: 0 }], gain: 2.4 },
    { search: "ai consultancy london", shown: 2200, clicks: 2, split: true, position: 11.4, volume: null, top: "/ai-consultancy/", pages: [{ path: "/ai-consultancy/", shown: 1500, clicks: 2 }, { path: "/ai-agency/", shown: 700, clicks: 0 }], gain: 1.1 },
  ],
  shared: 196, split: 127, shown: 29478, clicks: 20, enquiries: 40, recent: 7, recentBefore: 10, gainClicks: 34.6, gainEnquiries: 1.7, sure: "LIKELY",
};
/** Page decisions (insights-intelligence-plan.md phase 4): a verdict for every page, and the pages to create. */
const DECISION = (path: string, kind: string, verdict: string, reason: string, figures: Partial<{ into: string; visits: number; enquiries: number; clicks: number; domains: number }> = {}) => ({
  path, kind, type: "SERVICE", verdict, reason, into: figures.into ?? null, visits: figures.visits ?? 0, enquiries: figures.enquiries ?? 0, views: 10, shown: 100, clicks: figures.clicks ?? 0, domains: figures.domains ?? 0, flags: [],
});
const DECISIONS = {
  siteId: "site_1", host: "ronins.co.uk", decidedAt: Date.parse("2026-10-12T10:00:00Z"), pages: 4,
  decisions: [
    DECISION("/ai-agency/", "Service", "IMPROVE", "REBUILD", { visits: 708, enquiries: 34, clicks: 13, domains: 12 }),
    DECISION("/brand-design-agency/", "Service", "MERGE", "COMPETING_MERGE", { into: "/brand-identity-agency/", visits: 9 }),
    DECISION("/top-digital-trends-to-watch-in-2023/", "Insights", "REMOVE", "UNUSED"),
    DECISION("/ux-design-agency/", "Service", "KEEP", "WORKING", { visits: 13, enquiries: 3, clicks: 5 }),
  ],
  creates: [{ search: "brand strategy agency", from: "GAP", volume: 390, rivals: 2, best: 4 }],
};

/** AI search over time (insights-intelligence-plan.md phase 5): Ronins' assistants, answers and cited pages. */
const AI_MONTH = (month: string, chatgpt: number, perplexity: number) => ({ month, assistants: [{ name: "ChatGPT", visits: chatgpt, enquiries: 0 }, { name: "Perplexity", visits: perplexity, enquiries: 1 }] });
const AI_SEARCH = {
  siteId: "site_1", host: "ronins.co.uk", since: "2026-09-23",
  months: [AI_MONTH("2025-07", 20, 2), AI_MONTH("2025-08", 14, 1), AI_MONTH("2025-09", 12, 0), AI_MONTH("2026-04", 18, 1), AI_MONTH("2026-05", 17, 1), AI_MONTH("2026-06", 18, 0), AI_MONTH("2026-07", 17, 1), AI_MONTH("2026-08", 1, 0), AI_MONTH("2026-09", 5, 2)],
  windows: { now: { months: ["2026-07", "2026-08", "2026-09"], visits: 26, enquiries: 3 }, before: { months: ["2026-04", "2026-05", "2026-06"], visits: 55, enquiries: 2 }, yearAgo: { months: ["2025-07", "2025-08", "2025-09"], visits: 49, enquiries: 3 } },
  assistants: [{ name: "ChatGPT", now: 23, before: 53, yearAgo: 46, enquiries: 0 }, { name: "Perplexity", now: 3, before: 2, yearAgo: 3, enquiries: 2 }],
  kinds: [{ key: "service", name: "Service", type: "SERVICE", visits: 18, enquiries: 2 }, { key: "brand", name: "Brand", type: "OTHER", visits: 5, enquiries: 1 }],
  sites: [
    { websiteId: "web_1", host: "ronins.co.uk", own: true, months: [{ month: "2026-10", engine: "perplexity", asked: 20, named: 9, recommended: 9, cited: 9 }, { month: "2026-10", engine: "chatgpt", asked: 30, named: 1, recommended: 1, cited: 1 }] },
    { websiteId: "web_2", host: "pixelfield.co.uk", own: false, months: [{ month: "2026-10", engine: "perplexity", asked: 0, named: 4, recommended: 4, cited: 2 }] },
  ],
  citedCut: false,
  citedPages: [{ path: "/chatbot-agency/", times: 11, engines: ["claude", "chatgpt", "perplexity"] }],
  radar: null,
  chatgpt: null,
  demand: { month: "2026-09", rows: [{ search: "web app", ai: 1640, google: null }] },
};

const CANNIBALISATION = { siteId: "site_1", host: "ronins.co.uk", groups: [{ rank: 1, week: "2026-10-12", from: "2026-07-13", to: "2026-10-10", group: AI_GROUP, findingId: "finding_1" }] };

const WEEK = {
  weeks: [{
    siteId: "site_1", host: "ronins.co.uk", week: "2026-10-05", verdict: "Enquiries fell to 169 from 241 while visitors held.", createdAt: Date.parse("2026-10-11T07:00:00Z"),
    checked: 2062, ruledOut: 15, sources: [{ source: "analytics", facts: 1790 }, { source: "searchConsole", facts: 162 }],
    summary: {
      scorecard: SCORE, checked: 2062, ruledOut: 15,
      competing: { groups: 6, pages: 29, shared: 1368, shown: 221590, clicks: 50, biggest: { key: "/app-developers-london/", name: "app developers", pages: 6, shared: 643, shown: 115254, clicks: 12 } },
      paragraphs: ["Ronins is holding its place on Google while its enquiries fall.", "AI assistants are where you lead."],
      enquiriesByMonth: [{ month: "2026-09", visits: 600, conversions: 20 }, { month: "2026-10", visits: 400, conversions: 10 }],
      shareByMonth: [{ month: "2026-09", you: 900, total: 6000 }, { month: "2026-10", you: 1054, total: 6645 }],
    },
    changes: 3, nextRead: "2026-10-19", checks: [{ day: "2026-11-10", count: 5 }],
  }],
  findings: [FINDING_ROW],
  open: 1,
};
const FINDING = {
  ...FINDING_ROW,
  story: "Visits from search held at 3,302 against 3,238. Their enquiries fell to 101 from 171.",
  howWeKnow: "Watch enquiries from search over the next 90 days.",
  ruledOut: ["The form is broken: direct visitors still enquire."],
  facts: [
    { key: "ga.channel.Organic Search.conversions.365.now", value: 101, unit: "count", source: "analytics", label: "conversions from Organic Search", country: "gbr", ...YEAR },
    { key: "ga.channel.Organic Search.conversions.365.before", value: 171, unit: "count", source: "analytics", label: "conversions from Organic Search", country: "gbr", ...YEAR_BEFORE },
  ],
  comparisons: [["ga.channel.Organic Search.conversions.365.now", "ga.channel.Organic Search.conversions.365.before"]],
  checkOn: "2027-01-09",
};
const MONTH_REPORT = {
  reportId: "report_1", host: "ronins.co.uk", company: "Ronins Agency", kind: "MONTHLY", title: "Monthly report: September 2026", period: "2026-09",
  from: "2026-09-01", to: "2026-09-30", status: "WRITTEN", createdAt: Date.parse("2026-10-11T07:00:00Z"),
  body: {
    headline: "Enquiries grew to 10 in September.", summary: "Visits climbed from 201 to 241.", points: ["Google clicks rose."], next: ["Expand the service pages."],
    risks: [], opportunities: [], decision: null, scorecard: SCORE, findings: [], did: [{ work: "findings", count: 9 }],
    enquiriesByMonth: [{ month: "2026-08", visits: 201, conversions: 7 }, { month: "2026-09", visits: 241, conversions: 10 }], shareByMonth: [],
    facts: [{ key: "month.enquiries.now", label: "enquiries", value: 10, unit: "count" }, { key: "month.enquiries.before", label: "enquiries", value: 7, unit: "count" }],
  },
};
const SERVICE = { page: "/ai-agency/", title: "AI Agency | London", kind: "SERVICE", enquiries: 31, enquiriesBefore: 26, visits: 700, people: 594, clicks: 204, clicksBefore: null, impressions: 42377, impressionsBefore: null, verdict: "STEADY" };
const HOME = { company: "Ronins Agency", sites: [{ siteId: "site_1", host: "ronins.co.uk" }], lastLooked: Date.parse("2026-10-11T05:00:00Z"), thisWeek: 9, findings: 9 };

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn()) as never);
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Insights' looks", () => {
  it("7 · Leaderboards", async () => {
    nav.pathname = "/app/insights/leaderboards";
    answer({ "insightsReads:insightsLeagues": LEAGUES, "insightsReads:insightsHome": HOME });
    const { container } = render(<InsightsLeaderboardsPage />);
    await screen.findByText(/In the four main leagues you're 5th for domain authority/);
    await expectApprovedLook(container, PLAN, "Leagues", "Insights → Leaderboards");
  });

  it("8 · Domain authority league", async () => {
    nav.pathname = "/app/insights/leaderboards/strength";
    nav.league = "strength";
    answer({ "insightsReads:insightsLeagues": LEAGUES, "insightsReads:insightsHome": HOME });
    const { container } = render(<InsightsLeaguePage />);
    await screen.findByText(/You're 5th of 5 with 290/);
    await expectApprovedLook(container, PLAN, "LeagueStrength", "Insights → Domain authority league");
  });

  it("1 · Executive summary", async () => {
    nav.pathname = "/app/insights/summary";
    answer({ "insightsReads:insightsLeagues": LEAGUES, "insightsReads:insightsHome": HOME, "insightsReads:insightsThisWeek": WEEK, "insightsPeriod:insightsPeriodView": ENQUIRY_VIEW });
    const { container } = render(<InsightsSummaryPage />);
    await screen.findByText(/Of the 16 fewer enquiries than September 2025/);
    await screen.findByText(/Enquiries fell to 169 from 241 while visitors held/);
    await screen.findByText("AI assistants are where you lead.");
    await screen.findByText(/Reads every source again on/);
    await expectApprovedLook(container, PLAN, "Main", "Insights → Executive summary");
  });

  it("2 · This week", async () => {
    nav.pathname = "/app/insights/this-week";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsThisWeek": WEEK });
    const { container } = render(<InsightsThisWeekPage />);
    await screen.findAllByText(FINDING_ROW.headline);
    await expectApprovedLook(container, PLAN, "Week", "Insights → This week");
  });

  it("22 · All findings", async () => {
    nav.pathname = "/app/insights/findings";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsAllFindings": ALL_FINDINGS });
    const { container } = render(<InsightsAllFindingsPage />);
    await screen.findByText(FINDING_ROW.headline);
    await expectApprovedLook(container, PLAN, "Findings", "Insights → All findings");
  });

  it("23 · A finding", async () => {
    nav.pathname = "/app/insights/findings/finding_1";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsFinding": FINDING });
    const { container } = render(<InsightsFindingPage />);
    await screen.findByText(FINDING.headline);
    await expectApprovedLook(container, PLAN, "Finding", "Insights → A finding");
  });

  // When a finding is checked (utils/insightClock.ts; Anthony, 13 October 2026: "go" on counting from the change).
  const CLOCK = { from: "2026-11-03", why: "PAGE_CHANGED", days: 90, key: "ga.landing./hub/kapferer-brand-identity-prism/.conversions.90", page: "/hub/kapferer-brand-identity-prism/" };
  const PROGRESS = { day: "2026-11-09", now: 3, against: 1, than: "YEAR", unit: "count", from: "2026-08-09", to: "2026-11-07" };

  it("23b · A finding says its days start again when its page changes, and its figure so far", async () => {
    nav.pathname = "/app/insights/findings/finding_1";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsFinding": { ...FINDING, checkOn: "2027-02-04", clock: CLOCK, progress: PROGRESS } });
    render(<InsightsFindingPage />);
    await screen.findByText(/compares the 90 days after the page changed on 3 Nov 2026 with the same days a year before, on 4 Feb 2027\. If the page changes before then, the 90 days start again from the change\./);
    expect(screen.getByText(/So far: 3 in the 90 days to 7 Nov 2026, against 1 in the same days a year before\./)).toBeTruthy();
  });

  it("24c · Track record says each open finding's figure so far", async () => {
    nav.pathname = "/app/insights/track-record";
    answer({
      "insightsReads:insightsHome": HOME,
      "insightsReads:insightsTrackRecord": {
        findings: [{ findingId: "finding_1", host: "ronins.co.uk", headline: FINDING_ROW.headline, week: "2026-10-05", checkOn: "2027-02-04", actedAt: null, outcome: null, outcomeNote: null, clock: CLOCK, progress: PROGRESS }],
        tally: { right: 0, wrong: 0, unclear: 0 }, changes: [], learnings: [], fixes: [],
      },
    });
    render(<InsightsTrackRecordPage />);
    await screen.findByText("So far 3, against 1 a year before");
  });

  it("3 · Your month", async () => {
    nav.pathname = "/app/insights/your-month";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsLatestReport": MONTH_REPORT });
    const { container } = render(<InsightsYourMonthPage />);
    await screen.findByText(/Enquiries grew to 10 in September/);
    await expectApprovedLook(container, PLAN, "Month", "Insights → Your month");
  });

  it("6 · Reports", async () => {
    nav.pathname = "/app/insights/reports";
    const row = { reportId: "report_1", siteId: "site_1", host: "ronins.co.uk", kind: "MONTHLY", title: "Monthly report: September 2026", period: "2026-09", from: "2026-09-01", to: "2026-09-30", status: "WRITTEN", createdAt: Date.parse("2026-10-11T07:00:00Z") };
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsReports": [row] });
    const { container } = render(<InsightsReportsPage />);
    await screen.findByText("Monthly report: September 2026");
    await expectApprovedLook(container, PLAN, "Reports", "Insights → Reports");
  });

  it("4 · Strategy", async () => {
    nav.pathname = "/app/insights/strategy";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsStrategy": { siteId: "site_1", host: "ronins.co.uk", week: "2026-10-05", verdict: "v", services: [SERVICE], roadmap: [{ findingId: "finding_1", action: "Rebuild the chatbot page.", expect: "Enquiries fell.", howWeKnow: "Enquiries from the page.", checkOn: "2026-11-30" }] } });
    const { container } = render(<InsightsStrategyPage />);
    await screen.findAllByText("AI Agency");
    await expectApprovedLook(container, PLAN, "Strategy", "Insights → Strategy");
  });

  it("5 · A service", async () => {
    nav.pathname = "/app/insights/strategy/service";
    nav.search = "page=%2Fai-agency%2F";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsService": { host: "ronins.co.uk", service: SERVICE, siteClicks: 540, searches: [{ keyword: "ai agency", volume: 9900, position: 1, rival: null, rivalPosition: null }] } });
    const { container } = render(<InsightsServicePage />);
    await screen.findByText("ai agency");
    await expectApprovedLook(container, PLAN, "ServiceDetail", "Insights → A service");
    nav.search = "";
  });

  it("24 · Track record", async () => {
    nav.pathname = "/app/insights/track-record";
    answer({
      "insightsReads:insightsHome": HOME,
      "insightsReads:insightsTrackRecord": {
        findings: [{ findingId: "finding_1", host: "ronins.co.uk", headline: FINDING_ROW.headline, week: "2026-10-05", checkOn: "2027-01-09", actedAt: null, outcome: null, outcomeNote: null }],
        tally: { right: 0, wrong: 0, unclear: 0 },
        changes: [{ changeId: "change_1", host: "ronins.co.uk", kind: "MERGED", from: "/blockchain-developers/", to: "/blockchain-development-company/", seenIn: "analytics", before: 12, after: 2, result: "LOST", week: "2026-10-05" }],
        learnings: [{ kind: "MERGED", own: { lost: 1, held: 0, grew: 0 }, across: null }],
      },
    });
    const { container } = render(<InsightsTrackRecordPage />);
    await screen.findByText(/Merged \/blockchain-developers\//);
    await expectApprovedLook(container, PLAN, "Track", "Insights → Track record");
  });

  it("29 · Measurement check", async () => {
    nav.pathname = "/app/insights/measurement";
    const check = (id: string, status: string, found: string, names: string[] = [], a: number | null = null, b: number | null = null) => ({ check: id, status, found, names, a, b });
    answer({
      "insightsReads:insightsHome": HOME,
      "insightsReads:insightsMeasurement": {
        siteId: "site_1", host: "ronins.co.uk", week: "2026-10-05",
        measurement: {
          checks: [
            check("enquiryCounted", "LOOK", "leavesBefore", ["click"], 255, 271), check("everyWayCounted", "LOOK", "neverFired", ["phone_click", "email_click"], 2, 3),
            check("enquiriesValued", "PASSING", "valued"), check("visitsHavePage", "LOOK", "noPage", [], 33, 14), check("googleAgrees", "LOOK", "fewer", [], 306, 642),
            check("googleTiesPages", "LIMIT", "partTied", [], 53, 1070), check("analyticsSteady", "PASSING", "steady"), check("referralsReal", "PASSING", "real"),
            check("onlyThisWebsite", "LOOK", "strangers", ["nclnet.org"], 39),
          ],
          byDay: [{ day: "2026-10-06", clicks: 12, visits: 6 }, { day: "2026-10-07", clicks: 15, visits: 8 }],
        },
      },
    });
    const { container } = render(<InsightsMeasurementPage />);
    await screen.findByText("Each enquiry counts once");
    await expectApprovedLook(container, PLAN, "Measurement", "Insights → Measurement check");
  });

  it("30 · Sources", async () => {
    nav.pathname = "/app/insights/sources";
    answer({
      "insightsReads:insightsHome": HOME,
      "insightsReads:insightsSources": [{
        siteId: "site_1", host: "ronins.co.uk",
        sources: [
          { source: "market", status: "CONNECTED", since: "2019-01-31", count: null }, { source: "searchConsole", status: "CONNECTED", since: "2026-07-08", count: null },
          { source: "analytics", status: "CONNECTED", since: "2024-10-01", count: null }, { source: "businessProfiles", status: "CONNECTED", since: null, count: 2 },
          { source: "pages", status: "SOON", since: null, count: null }, { source: "enquiryValue", status: "NOT_SET", since: null, count: 3 },
        ],
      }],
    });
    const { container } = render(<InsightsSourcesPage />);
    await screen.findByText("Google Search Console");
    await expectApprovedLook(container, PLAN, "Sources", "Insights → Sources");
  });

  const PLAN_DATA = {
    siteId: "site_1", host: "ronins.co.uk", week: "2026-10-05",
    kinds: [{ page: "/wordpress-agency/", kind: "Service", type: "SERVICE" }, { page: "/chatbot-agency/", kind: "Service", type: "SERVICE" }],
    plan: {
      siteRate: 3.7,
      opportunities: [
        { search: "ai consultancy", place: 25.7, volume: 2400, shown: 4027, page: "/ai-consultancy/", service: "/ai-consultancy/", rate: 7.1, worth: 29.3 },
        { search: "ai automation agency", place: 9.3, volume: 720, shown: 3264, page: "/ai-agency/", service: "/ai-agency/", rate: 4.4, worth: 5 },
        { search: "wordpress agency", place: 12, volume: null, shown: 5584, page: null, service: null, rate: null, worth: null },
      ],
      pages: [
        { page: "/chatbot-agency/", title: "ChatBot Agency", shouldWin: ["chatbot services"], action: "REBUILD", why: "fell", a: 12, b: 3, enquiries: 3, enquiriesBefore: 12, stake: 9 },
        { page: "/ai-consultancy/", title: "AI Consultancy", shouldWin: ["ai consultancy"], action: "STRENGTHEN", why: "bestRate", a: 7.1, b: 26, enquiries: 6, enquiriesBefore: 0, stake: 351 },
      ],
    },
  };

  it("31 · Opportunities", async () => {
    nav.pathname = "/app/insights/opportunities";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsPlan": PLAN_DATA });
    const { container } = render(<InsightsOpportunitiesPage />);
    await screen.findByText("wordpress agency");
    await expectApprovedLook(container, PLAN, "Opportunities", "Insights → Opportunities");
  });

  it("32 · Page plan", async () => {
    nav.pathname = "/app/insights/page-plan";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsPlan": PLAN_DATA, "insightDecisions:insightsPageDecisions": DECISIONS });
    const { container } = render(<InsightsPagePlanPage />);
    await screen.findByText("/chatbot-agency/");
    await expectApprovedLook(container, PLAN, "PagePlan", "Insights → Page plan");
  });

  const CONVERSION = {
    siteId: "site_1", host: "ronins.co.uk", week: "2026-10-05",
    funnel: [
      { step: "SHOWN", now: 1272709, year: null, source: "searchConsole" }, { step: "CLICKED", now: 2062, year: null, source: "searchConsole" },
      { step: "VISITED", now: 1371, year: 1387, source: "analytics" }, { step: "ENQUIRED", now: 21, year: 59, source: "analytics" },
    ],
    sources: [{ channel: "Organic Search", visits: 3302, enquiries: 101, visitsBefore: 3237, enquiriesBefore: 171 }, { channel: "AI assistants", visits: 83, enquiries: 4, visitsBefore: 20, enquiriesBefore: 0 }],
    pages: [
      { page: "/", title: "Creative Digital Agency | Ronins", kind: "HOME", visits: 2052, enquiries: 98, visitsBefore: 1650, enquiriesBefore: 150, verdict: "REWRITE_TOP", reason: "The opening speaks to brand work while visitors come for AI.", steps: ["Lead the top of the page with AI services.", "Put the enquiry form's first question above the fold."] },
      { page: "/ai-agency/", title: "AI Agency | Automation", kind: "SERVICE", visits: 1089, enquiries: 46, visitsBefore: 561, enquiriesBefore: 32, verdict: "ADD_PROOF", reason: "It asks without showing results.", steps: ["Add one case study with its result before the form."], before: [{ kind: "site", label: "Google", share: 61.2 }, { kind: "page", label: "/", share: 24.5 }, { kind: "none", label: "", share: 14.3 }] },
    ],
    experiments: [{ experimentId: "experiment_1", page: "/", verdict: "REWRITE_TOP", why: "The opening speaks to brand work.", status: "READY", startedAt: null, baseline: null, result: null, visits: 2052 }],
    kinds: [{ page: "/", kind: "Brand", type: "OTHER" }, { page: "/ai-agency/", kind: "Service", type: "SERVICE" }],
  };

  it("33 · Funnel", async () => {
    nav.pathname = "/app/insights/funnel";
    answer({ "insightsReads:insightsHome": HOME, "insightsConversion:insightsConversion": CONVERSION, "insightsPeriod:insightsPeriodView": ENQUIRY_VIEW });
    const { container } = render(<InsightsFunnelPage />);
    await screen.findByText("Shown on Google");
    await expectApprovedLook(container, PLAN, "Funnel", "Insights → Funnel");
  });

  // The Funnel, Track record and Page decisions boxes as their specialists wrote them (insights-one-voice-plan.md; Anthony, 13 October 2026: "Go").
  const BOX = (says: string[], role: string) => ({ says, role, week: "2026-10-12", period: null });

  it("33b · Funnel's box, as the Conversion specialist wrote it", async () => {
    nav.pathname = "/app/insights/funnel";
    answer({ "insightsReads:insightsHome": HOME, "insightsConversion:insightsConversion": CONVERSION, "insightsPeriod:insightsPeriodView": ENQUIRY_VIEW, "insightBoxes:insightsScreenBox": BOX(["The chain is weakest at the click: 1% of times shown."], "INSIGHTS_CONVERSION") });
    render(<InsightsFunnelPage />);
    await screen.findByText(/The chain is weakest at the click: 1% of times shown\./);
    expect(screen.getByText(/The Conversion specialist wrote this for the week of/)).toBeTruthy();
  });

  it("32b · Page decisions' box, as the Page decisions specialist wrote it, with who decided the pages", async () => {
    nav.pathname = "/app/insights/page-plan";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsPlan": PLAN_DATA, "insightDecisions:insightsPageDecisions": DECISIONS, "insightBoxes:insightsScreenBox": BOX(["Merge the chatbot pages first."], "INSIGHTS_PAGE_DECISIONS") });
    render(<InsightsPagePlanPage />);
    await screen.findByText(/Merge the chatbot pages first\./);
    expect(screen.getByText(/The Page decisions specialist wrote this for the week of/)).toBeTruthy();
  });

  it("24b · Track record's box, as the Head of Strategy wrote it", async () => {
    nav.pathname = "/app/insights/track-record";
    answer({
      "insightsReads:insightsHome": HOME,
      "insightsReads:insightsTrackRecord": { findings: [], tally: { right: 2, wrong: 1, unclear: 0 }, changes: [], learnings: [], fixes: [] },
      "insightBoxes:insightsScreenBox": BOX(["Two of three findings checked were right."], "INSIGHTS_HEAD_OF_STRATEGY"),
    });
    render(<InsightsTrackRecordPage />);
    await screen.findByText(/Two of three findings checked were right\./);
    expect(screen.getByText(/The Head of Strategy wrote this for the week of/)).toBeTruthy();
  });

  it("34 · Page reviews", async () => {
    nav.pathname = "/app/insights/page-reviews";
    answer({ "insightsReads:insightsHome": HOME, "insightsConversion:insightsConversion": CONVERSION });
    const { container } = render(<InsightsPageReviewsPage />);
    await screen.findAllByText("/ai-agency/");
    await expectApprovedLook(container, PLAN, "PageReviews", "Insights → Page reviews");
  });

  it("35 · A page's review", async () => {
    nav.pathname = "/app/insights/page-reviews/page";
    nav.search = "page=%2Fai-agency%2F";
    answer({ "insightsReads:insightsHome": HOME, "insightsConversion:insightsConversion": CONVERSION, "insightsReads:insightsService": { host: "ronins.co.uk", service: SERVICE, siteClicks: 540, searches: [{ keyword: "ai agency", volume: 9900, position: 1, rival: null, rivalPosition: null }] } });
    const { container } = render(<InsightsPageReviewPage />);
    await screen.findByText("ai agency");
    await screen.findByText("Google");
    await screen.findByText("Typed in or a bookmark");
    await expectApprovedLook(container, PLAN, "PageDetail", "Insights → A page's review");
    nav.search = "";
  });

  it("37 · What brings enquiries", async () => {
    nav.pathname = "/app/insights/enquiries";
    answer({ "insightsReads:insightsHome": HOME, "insightsPeriod:insightsPeriodView": ENQUIRY_VIEW, "insightsPeriod:insightsEnquiries": ENQUIRIES });
    const { container } = render(<InsightsEnquiriesPage />);
    await screen.findAllByText("Typed in");
    await screen.findByText("about 2");
    await expectApprovedLook(container, PLAN, "Enquiries", "Insights → What brings enquiries");
  });

  it("38 · One source's enquiries", async () => {
    nav.pathname = "/app/insights/enquiries/source";
    nav.search = "name=ChatGPT";
    answer({ "insightsReads:insightsHome": HOME, "insightsPeriod:insightsEnquirySource": ENQUIRY_SOURCE });
    const { container } = render(<InsightsEnquirySourcePage />);
    await screen.findByText("Enquiries from ChatGPT");
    await screen.findByText("/venture-studio");
    await expectApprovedLook(container, PLAN, "EnquirySource", "Insights → One source's enquiries");
    nav.search = "";
  });

  it("39 · Keyword cannibalisation", async () => {
    nav.pathname = "/app/insights/cannibalisation";
    answer({ "insightsReads:insightsHome": HOME, "insightCompeting:insightsCannibalisation": CANNIBALISATION });
    const { container } = render(<InsightsCannibalisationPage />);
    await screen.findAllByText("ai agency london");
    await expectApprovedLook(container, PLAN, "Cannibalisation", "Insights → Keyword cannibalisation");
  });

  it("40 · A group of competing pages", async () => {
    nav.pathname = "/app/insights/cannibalisation/group";
    nav.search = "key=%2Fai-agency%2F";
    answer({ "insightsReads:insightsHome": HOME, "insightCompeting:insightsCompetingGroup": { siteId: "site_1", host: "ronins.co.uk", kept: CANNIBALISATION.groups[0], finding: { headline: "3 of your pages split Google's searches.", action: "Make /ai-agency/ the page.", checkOn: "2026-12-07" } } });
    const { container } = render(<InsightsCompetingGroupPage />);
    await screen.findAllByText(/Merge \/ai-software-development-company\/ into \/ai-agency\//);
    await expectApprovedLook(container, PLAN, "CompetingGroup", "Insights → A group of competing pages");
    nav.search = "";
  });

  it("40b · A group the specialist decided opens with its own words", async () => {
    nav.pathname = "/app/insights/cannibalisation/group";
    nav.search = "key=%2Fai-agency%2F";
    const decided = { ...CANNIBALISATION.groups[0], group: { ...AI_GROUP, decidedBy: "AGENT", decidedWeek: "2026-10-12" }, summary: ["Three AI pages split 120 of your searches.", "Give each search one page, and merge the software page into /ai-agency/."] };
    answer({ "insightsReads:insightsHome": HOME, "insightCompeting:insightsCompetingGroup": { siteId: "site_1", host: "ronins.co.uk", kept: decided, finding: null } });
    render(<InsightsCompetingGroupPage />);
    await screen.findByText(/Three AI pages split 120 of your searches\./);
    expect(screen.getByText(/The Keyword cannibalisation specialist decided these on/)).toBeTruthy();
    expect(screen.queryByText(/hasn't looked at this group yet/)).toBeNull();
    nav.search = "";
  });

  it("41 · AI search", async () => {
    nav.pathname = "/app/insights/ai-search";
    answer({ "insightsReads:insightsHome": HOME, "insightAiSearch:insightsAiSearch": AI_SEARCH });
    const { container } = render(<InsightsAiSearchPage />);
    await screen.findByText("/chatbot-agency/");
    await expectApprovedLook(container, PLAN, "AiSearch", "Insights → AI search");
  });

  it("42 · A section of Findings", async () => {
    nav.pathname = "/app/insights/findings/sections/search";
    nav.section = "search";
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsAllFindings": ALL_FINDINGS });
    const { container } = render(<InsightsFindingsSectionPage />);
    await screen.findByText("Search and content");
    await expectApprovedLook(container, PLAN, "FindingsSection", "Insights → A section of Findings");
    nav.section = "";
  });

  it("36 · Experiments", async () => {
    nav.pathname = "/app/insights/experiments";
    answer({ "insightsReads:insightsHome": HOME, "insightsConversion:insightsConversion": CONVERSION });
    const { container } = render(<InsightsExperimentsPage />);
    await screen.findByText("It's live");
    await expectApprovedLook(container, PLAN, "Experiments", "Insights → Experiments");
  });
});
