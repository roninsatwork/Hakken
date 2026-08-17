import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import HealthPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const emptyBucket = { count: 0, examples: [] };

const health = {
  checkedAt: Date.UTC(2026, 6, 27, 10, 20),
  budgetHealth: { agentCostBudgets: { count: 0 }, tenantMessageBudgets: { count: 0 } },
  operations: {
    agentFailures: emptyBucket,
    failedAgentTransactions: emptyBucket,
    failedToolCalls: emptyBucket,
    failedScheduledExecutions: emptyBucket,
    highCostAgents: emptyBucket,
    overdueSchedules: emptyBucket,
    pendingApprovals: emptyBucket,
    providerFailures: emptyBucket,
    schedulesMissingNextRun: emptyBucket,
    staleAgentRuns: emptyBucket,
    staleRunningScheduledExecutions: emptyBucket,
  },
};

const runs = {
  lookbackDays: 7,
  sampledRuns: 1,
  totals: { runs: 1, failedRuns: 0, activeRuns: 0, costGBP: 0.0234, successRate: 1, averageLatencyMs: 4200 },
  recentRuns: [
    {
      runId: "run_1",
      agentId: "agent_1",
      agentName: "Rightmove Agent",
      status: "SUCCESS",
      objective: "Skill setup: Document Extraction",
      startedAt: Date.UTC(2026, 6, 25, 20, 55),
      latencyMs: 4200,
      costGBP: 0.0234,
    },
  ],
};

describe("HealthPage", () => {
  let healthFixture: unknown;
  let runsFixture: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    healthFixture = health;
    runsFixture = runs;
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const name = getFunctionName(queryFn);
      if (name === "analyticsCron:getSystemHealthForAdmin") return healthFixture as ReturnType<typeof useQuery>;
      if (name === "agentRuns:getRunObservatory") return runsFixture as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
  });

  /**
   * The two screens this replaces led with counters — nine on one, six plus a
   * six-box status grid on the other — every one of which read zero on a
   * healthy platform. The answer comes first now.
   */
  it("says plainly that nothing needs attention, without a wall of zeros", () => {
    render(<HealthPage />);

    expect(screen.getByText("Nothing needs attention")).toBeInTheDocument();
    expect(screen.queryByText("Fix these first")).not.toBeInTheDocument();
  });

  it("names what needs attention, with somewhere to go about it", () => {
    healthFixture = {
      ...health,
      operations: { ...health.operations, pendingApprovals: { count: 3, examples: [] } },
    };
    render(<HealthPage />);

    expect(screen.getByText("1 thing needs attention")).toBeInTheDocument();
    expect(screen.getByText("Approvals waiting on a person")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Approvals waiting on a person/ }))
      .toHaveAttribute("href", "/admin/governance/approvals");
  });

  it("counts every separate thing that needs attention", () => {
    healthFixture = {
      ...health,
      operations: {
        ...health.operations,
        pendingApprovals: { count: 3, examples: [] },
        agentFailures: { count: 1, examples: [] },
      },
    };
    render(<HealthPage />);

    expect(screen.getByText("2 things need attention")).toBeInTheDocument();
  });

  /** The old screens printed £0.0000 — in the wrong currency — and 0ms. */
  it("shows money to the penny and time in seconds", () => {
    render(<HealthPage />);

    expect(screen.getByText(/1 run, 0 failed, \$0.02 spent, 4.2s on average/)).toBeInTheDocument();
  });

  it("lists recent runs in words, linking each to its timeline", () => {
    render(<HealthPage />);

    expect(screen.getByText("Worked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skill setup: Document Extraction" }))
      .toHaveAttribute("href", "/admin/agents/agent_1/runs/run_1");
  });

  it("says so when nothing has run, rather than showing a bare table", () => {
    runsFixture = { ...runs, totals: { ...runs.totals, runs: 0 }, recentRuns: [] };
    render(<HealthPage />);

    expect(screen.getByText("No agent has run in the last 7 days.")).toBeInTheDocument();
    // Said twice on purpose since the screen gained page numbers: once in the
    // table and once in the footer's count slot.
    expect(screen.getAllByText("Nothing has run yet").length).toBeGreaterThan(0);
  });

  /**
   * A health screen that white-screens because one field is absent is worse
   * than no health screen. It reads through to `.count` on eleven buckets.
   */
  it("survives a report that is missing sections", () => {
    healthFixture = { checkedAt: Date.UTC(2026, 6, 27) };
    render(<HealthPage />);

    expect(screen.getByText("Nothing needs attention")).toBeInTheDocument();
  });

});
