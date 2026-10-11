import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { leaguesFrom } from "@/convex/utils/insightLeagues";
import type { Fact } from "@/convex/utils/insightFacts";
import InsightsLeaderboardsPage from "./leaderboards/page";
import InsightsLeaguePage from "./leaderboards/[league]/page";

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
  useParams: () => ({ league: nav.league }),
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
});
