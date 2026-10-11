import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
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

/**
 * Insights' screens hold to the looks drawn and approved on 2026-10-11
 * (docs/plans/active/insights-analyst-plan.md §11; the boards in
 * docs/plans/assets/insights-analyst/): each screen, rendered with sample
 * figures in English, reads as the outline saved in
 * docs/plans/assets/insights-analyst/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/insights/leaderboards", search: "", league: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ league: nav.league, findingId: "finding_1" }),
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
  sure: "HIGH", sources: ["analytics", "searchConsole"], atStake: 70, ruledOut: 2, isNew: true, outcome: null, createdAt: Date.parse("2026-10-11T07:00:00Z"),
};
const SCORE = [
  { measure: "enquiries", now: 26, before: 74, unit: "count", lowerIsBetter: false, place: null, places: null, status: "BEHIND" },
  { measure: "visitorsPerEnquiry", now: 19, before: 10, unit: "count", lowerIsBetter: true, place: null, places: null, status: "BEHIND" },
  { measure: "marketShare", now: 15.9, before: 5, unit: "percent", lowerIsBetter: false, place: 3, places: 5, status: "ON_TRACK" },
];
const WEEK = {
  weeks: [{
    siteId: "site_1", host: "ronins.co.uk", week: "2026-10-05", verdict: "Enquiries fell to 169 from 241 while visitors held.", createdAt: Date.parse("2026-10-11T07:00:00Z"),
    checked: 2062, ruledOut: 15, sources: [{ source: "analytics", facts: 1790 }, { source: "searchConsole", facts: 162 }],
    summary: {
      scorecard: SCORE, checked: 2062, ruledOut: 15,
      enquiriesByMonth: [{ month: "2026-09", visits: 600, conversions: 20 }, { month: "2026-10", visits: 400, conversions: 10 }],
      shareByMonth: [{ month: "2026-09", you: 900, total: 6000 }, { month: "2026-10", you: 1054, total: 6645 }],
    },
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
    answer({ "insightsReads:insightsLeagues": LEAGUES, "insightsReads:insightsHome": HOME, "insightsReads:insightsThisWeek": WEEK });
    const { container } = render(<InsightsSummaryPage />);
    await screen.findByText(/Enquiries fell to 169 from 241 while visitors held/);
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
    answer({ "insightsReads:insightsHome": HOME, "insightsReads:insightsAllFindings": [FINDING_ROW] });
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
});
