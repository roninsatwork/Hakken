import React from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import AdminDashboardPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

// Recharts needs a measured container, which jsdom does not give it. The data
// is asserted against the query's own tests; what matters here is the copy
// around the charts and that the page renders.
vi.mock("recharts", async () => {
  const stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Area: stub,
    AreaChart: stub,
    Bar: stub,
    BarChart: stub,
    CartesianGrid: stub,
    Cell: stub,
    Line: stub,
    LineChart: stub,
    ResponsiveContainer: stub,
    Tooltip: stub,
    XAxis: stub,
    YAxis: stub,
  };
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const overview = {
  windowDays: 30,
  clients: { total: 4, healthy: 2, needsAttention: 1, unused: 1 },
  money: { projectedMrrGBP: 400, aiSpendGBP: 12.5, spendAsPercentOfRevenue: 3.1 },
  seats: { total: 12, active: 4, utilisation: 33 },
  todo: { pendingInvitations: 2, companiesWithNoPlan: 1 },
  planDistribution: [
    { name: "Studio", companies: 2 },
    { name: "No plan", companies: 1 },
  ],
  daily: [
    { day: "2026-07-26", questions: 0, aiCalls: 2, spendGBP: 0.1 },
    { day: "2026-07-27", questions: 5, aiCalls: 9, spendGBP: 0.4 },
  ],
  signInBands: [
    { day: "2026-07-27", didNotSignIn: 8, oneSession: 3, twoSessions: 1, threeSessions: 0, fourSessions: 0, fivePlusSessions: 0 },
  ],
  portfolio: [
    { companyId: "c_attention", name: "Ronins Website", planName: "Studio", mrrGBP: 200, people: 3, activeRecently: 1, quiet: 2, state: "NEEDS_ATTENTION" },
    { companyId: "c_unused", name: "New Client", planName: undefined, mrrGBP: 0, people: 0, activeRecently: 0, quiet: 0, state: "UNUSED" },
    { companyId: "c_healthy", name: "Happy Client", planName: "Studio", mrrGBP: 200, people: 2, activeRecently: 2, quiet: 0, state: "HEALTHY" },
  ],
};

describe("AdminDashboardPage", () => {
  let fixture: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    fixture = overview;
    vi.mocked(useQuery).mockImplementation(() => fixture as ReturnType<typeof useQuery>);
  });

  /**
   * What was here reported tokens, model mix and provider mix — the same view
   * the per-company AI Usage screen gives, aggregated, and an answer to neither
   * question a platform owner opens the front page to ask.
   */
  it("leads with how the clients are, not with tokens", () => {
    render(<AdminDashboardPage />);

    expect(screen.getByText("2 of 4 clients healthy · 1 need attention · 1 with nobody added.")).toBeInTheDocument();
    expect(screen.queryByText(/Model Logistics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider Distribution/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Token Flux/i)).not.toBeInTheDocument();
  });

  /** A bare revenue figure hides the margin, which is the number that matters. */
  it("states revenue against what it costs to serve", () => {
    render(<AdminDashboardPage />);

    expect(screen.getByText("£400.00")).toBeInTheDocument();
    expect(screen.getByText("AI spend $12.50 · 3.1% of it")).toBeInTheDocument();
  });

  it("says how many seats are actually used", () => {
    render(<AdminDashboardPage />);

    expect(screen.getByText("of 12")).toBeInTheDocument();
    expect(screen.getByText("33% used in the last 30 days")).toBeInTheDocument();
  });

  it("names its charts and every sign-in band", () => {
    render(<AdminDashboardPage />);

    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("AI spend")).toBeInTheDocument();
    expect(screen.getByText("How often people sign in")).toBeInTheDocument();
    expect(screen.getByText("Did not sign in")).toBeInTheDocument();
    // The gap between these two lines is automation running unasked.
    expect(screen.getByText("Questions people asked")).toBeInTheDocument();
    expect(screen.getByText("All AI calls, including automation")).toBeInTheDocument();
  });

  /**
   * Unused and unhealthy are different problems, and the worst sorts first so
   * the reason to open the screen is the first thing read.
   */
  it("lists every client with its state, worst first, each openable", () => {
    render(<AdminDashboardPage />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Ronins Website")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Needs attention")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Nobody added")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: /Open/ }))
      .toHaveAttribute("href", "/admin/companies/c_attention");
  });

  it("raises what is worth doing", () => {
    render(<AdminDashboardPage />);

    expect(screen.getByText("2 invitations nobody has accepted")).toBeInTheDocument();
    expect(screen.getByText("1 client is on no plan")).toBeInTheDocument();
  });

  /** A permanent panel of zeroes is the fault this whole pass has removed. */
  it("stays quiet when there is nothing to do", () => {
    fixture = { ...overview, todo: { pendingInvitations: 0, companiesWithNoPlan: 0 } };
    render(<AdminDashboardPage />);

    expect(screen.queryByText("Worth doing")).not.toBeInTheDocument();
  });

  it("says so plainly when every client is healthy", () => {
    fixture = {
      ...overview,
      clients: { total: 3, healthy: 3, needsAttention: 0, unused: 0 },
    };
    render(<AdminDashboardPage />);

    expect(screen.getByText("All 3 clients are healthy.")).toBeInTheDocument();
  });

  it("says so when there are no clients at all", () => {
    fixture = {
      ...overview,
      clients: { total: 0, healthy: 0, needsAttention: 0, unused: 0 },
      portfolio: [],
    };
    render(<AdminDashboardPage />);

    expect(screen.getByText("No clients yet.")).toBeInTheDocument();
  });
});
