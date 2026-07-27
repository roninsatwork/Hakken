import React from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import CompanyDashboardPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

// Recharts needs a measured container, which jsdom does not give it. The chart
// contents are asserted through the data instead; what matters here is the copy
// around them and that the page renders.
vi.mock("recharts", async () => {
  const stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Bar: stub,
    BarChart: stub,
    CartesianGrid: stub,
    Cell: stub,
    ResponsiveContainer: stub,
    Tooltip: stub,
    XAxis: stub,
    YAxis: stub,
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company_1" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

const engagement = {
  daysBack: 30,
  people: { total: 3, active: 2, quiet: 1 },
  questions: { asked: 12, byPeople: 2 },
  signIns: { total: 9, onDays: 4 },
  invitations: { pending: 0, accepted: 3, revoked: 0 },
  daily: [
    { day: "2026-07-26", didNotSignIn: 3, oneSession: 0, twoSessions: 0, threeSessions: 0, fourSessions: 0, fivePlusSessions: 0, questions: 0 },
    { day: "2026-07-27", didNotSignIn: 1, oneSession: 1, twoSessions: 1, threeSessions: 0, fourSessions: 0, fivePlusSessions: 0, questions: 4 },
  ],
  everyone: [
    {
      userId: "user_quiet",
      name: "Quiet Person",
      email: "quiet@ronins.co.uk",
      isAdmin: false,
      lastSeenAt: undefined,
      signIns: 0,
      questions: 0,
      agentRuns: 0,
    },
    {
      userId: "user_stale",
      name: "Sam",
      email: "sam@ronins.co.uk",
      isAdmin: false,
      lastSeenAt: Date.now() - 20 * DAY_MS,
      signIns: 2,
      questions: 3,
      agentRuns: 0,
    },
    {
      userId: "user_active",
      name: "Company Admin",
      email: "admin@ronins.co.uk",
      isAdmin: true,
      lastSeenAt: Date.now() - 1000,
      signIns: 7,
      questions: 9,
      agentRuns: 2,
    },
  ],
};

describe("CompanyDashboardPage", () => {
  let fixture: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    fixture = engagement;
    vi.mocked(useQuery).mockImplementation(() => fixture as ReturnType<typeof useQuery>);
  });

  /**
   * What was here reported tokens, quota and provider spend under the heading
   * "Dashboard" — a billing view promising an account view.
   */
  it("answers who is using Sonae in a sentence, before any number", () => {
    render(<CompanyDashboardPage />);

    expect(screen.getByText("2 of 3 people used Sonae in the last 30 days, and 1 did not.")).toBeInTheDocument();
    expect(screen.queryByText(/Tokens Used/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider Usage/i)).not.toBeInTheDocument();
  });

  it("judges sign-ins against the days they happened on", () => {
    render(<CompanyDashboardPage />);

    // Nine sign-ins across four days is a different story from nine in one day.
    expect(screen.getByText("across 4 days")).toBeInTheDocument();
  });

  it("says how long since each person was last seen, not the date", () => {
    render(<CompanyDashboardPage />);

    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("20 days ago")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  /**
   * The order is the point. Sorted by heaviest user this is a billing
   * leaderboard; sorted by who has gone quiet it is a list of people worth a
   * call.
   */
  it("keeps the order it was given, quietest first", () => {
    render(<CompanyDashboardPage />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Quiet Person")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Company Admin")).toBeInTheDocument();
  });

  it("nudges about people invited who never arrived, and stays quiet otherwise", () => {
    render(<CompanyDashboardPage />);
    expect(screen.queryByText(/been invited and not arrived/)).not.toBeInTheDocument();

    fixture = { ...engagement, invitations: { pending: 2, accepted: 3, revoked: 0 } };
    render(<CompanyDashboardPage />);
    expect(screen.getByText("2 people have been invited and not arrived")).toBeInTheDocument();
  });

  /** A screen that measures people has to say who it cannot see. */
  it("says what it does not cover", () => {
    render(<CompanyDashboardPage />);

    expect(screen.getByText("What this does not cover")).toBeInTheDocument();
    expect(screen.getByText(/public chat widget are anonymous/)).toBeInTheDocument();
  });

  it("says so plainly when nobody has been added yet", () => {
    fixture = {
      ...engagement,
      people: { total: 0, active: 0, quiet: 0 },
      everyone: [],
    };
    render(<CompanyDashboardPage />);

    expect(screen.getByText("Nobody has been added to this company yet.")).toBeInTheDocument();
    expect(screen.getByText("Nobody here yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Invite someone/ }))
      .toHaveAttribute("href", "/admin/companies/company_1/directory/invites");
  });

  /**
   * The grey band is the point of the chart. Without the people who did not
   * sign in, one active person in a team of eight looks like full adoption.
   */
  it("charts sign-ins against the whole headcount, and names every band", () => {
    render(<CompanyDashboardPage />);

    expect(screen.getByText("How often people sign in")).toBeInTheDocument();
    expect(screen.getByText("Did not sign in")).toBeInTheDocument();
    expect(screen.getByText("5+ sessions")).toBeInTheDocument();
    expect(screen.getByText(/people who run the platform excluded/)).toBeInTheDocument();
  });

  it("charts what people are asking, day by day", () => {
    render(<CompanyDashboardPage />);

    expect(screen.getByText("What they are asking")).toBeInTheDocument();
    expect(screen.getByText(/Questions put to Sonae each day/)).toBeInTheDocument();
  });

});
