import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import AppDashboardPage from "./page";

/**
 * The client Dashboard (docs/plans/active/dashboard-way-1-plan-2026-11-21.md, Way 1): the four numbers with their days,
 * the Reading room, then a section for each source the company has switched on, and none for a source switched off, for
 * the company or for everyone. It keeps everyone who lands on it, super admins too (Anthony, 21 November 2026: "remove the
 * auto redirect of super admins to the admin section on first load").
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation(),
  useRouter: () => router,
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const SITE = "site_own";
const days = (values: number[]) => values.map((value, at) => ({ day: `2026-10-${String(at + 1).padStart(2, "0")}`, value }));
const FIGURES = {
  sites: [SITE],
  shop: false,
  analytics: { visits: { now: 245, before: 240, days: days([8, 10, 7]) }, done: { now: 5, before: 2, days: days([0, 1, 0]) } },
  searchConsole: { clicks: { now: 341, before: 390, days: days([12, 9, 14]) }, impressions: { now: 279239, before: 294618, days: days([9000, 9100, 8800]) } },
};

function answer(enabledModules: string[]) {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "users:getMe": { _id: "user_1", role: "SUPER_ADMIN", name: "Anthony" },
    "companies:getMyWorkspaceModules": { companyName: "Ronins Agency", enabledModules },
    "sites:listPickerHolds": [{ siteId: SITE, host: "ronins.co.uk", relationship: "OWNED", ofHost: null, ofSiteId: null, iconUrl: null }],
    "dashboard:dashboardFigures": FIGURES,
    "news:getFrontPage": { lead: null, weekCount: 0 },
  }));
}

beforeEach(() => {
  vi.mocked(usePaginatedQuery).mockReset().mockReturnValue({ results: [], status: "Exhausted", isLoading: false, loadMore: vi.fn() } as never);
});
afterEach(() => vi.mocked(useQuery).mockReset());

describe("the client Dashboard", () => {
  it("keeps a super admin on the page, never sending them to Admin", () => {
    answer([]);
    sessionStorage.clear();
    render(<AppDashboardPage />);
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(router.push).not.toHaveBeenCalledWith("/admin");
    expect(router.replace).not.toHaveBeenCalledWith("/admin");
  });

  it("shows the four numbers, each against the period before", () => {
    answer([]);
    render(<AppDashboardPage />);
    expect(screen.getByText("245")).toBeInTheDocument();
    expect(screen.getByText("341")).toBeInTheDocument();
    expect(screen.getByText("279,239")).toBeInTheDocument();
    // A business that wants enquiries counts events; a shop would count what's bought.
    expect(screen.getByText(/^Events/)).toBeInTheDocument();
  });

  it("shows a section only for a source that's switched on", () => {
    answer(["searchConsole", "clarity"]);
    render(<AppDashboardPage />);
    expect(screen.getByRole("region", { name: "Search Console" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Microsoft Clarity" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Google Analytics" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Visibility" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Bing Webmaster" })).toBeNull();
  });

  it("always shows the Reading room, whatever is switched off", () => {
    answer([]);
    render(<AppDashboardPage />);
    expect(screen.getByRole("region", { name: "Reading room" })).toBeInTheDocument();
  });
});
