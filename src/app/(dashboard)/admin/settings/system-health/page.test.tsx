import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SystemHealthPage from "./page";

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    analyticsCron: {
      getSystemHealthForAdmin: "analyticsCron:getSystemHealthForAdmin",
    },
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

function buildHealth(overrides: Record<string, unknown> = {}) {
  return {
    analytics: {
      liveToday: {
        agentTransactions: 2,
        assistantMessages: 12,
        date: "2026-06-09",
      },
      messageDimensions: {
        mismatched: 0,
        missingDimensions: 0,
        missingThreads: 0,
        scanned: 42,
      },
      snapshotCoverage: {
        duplicateSnapshotGroups: [],
        missingGlobalDates: [],
        totalSnapshots: 9,
      },
    },
    alertRules: [
      {
        count: 0,
        details: [],
        key: "stuckRuns",
        label: "Stuck runs",
        nextAction: "Open the run timeline.",
        status: "ok",
        threshold: "Queued or running longer than 60 minutes",
      },
    ],
    budgetHealth: {
      agentCostBudgets: { count: 0, examples: [] },
      tenantMessageBudgets: { count: 0, examples: [] },
    },
    checkedAt: Date.parse("2026-06-09T10:00:00.000Z"),
    checkedDate: "2026-06-09",
    daysBack: 7,
    operations: {
      agentFailures: { count: 0, examples: [] },
      failedAgentTransactions: { count: 0, examples: [] },
      failedToolCalls: { count: 0, examples: [] },
      failedScheduledExecutions: { count: 0, examples: [] },
      highCostAgents: { count: 0, examples: [] },
      overdueSchedules: { count: 0, examples: [] },
      pendingApprovals: { count: 0, examples: [] },
      providerFailures: { count: 0, examples: [] },
      schedulesMissingNextRun: { count: 0, examples: [] },
      staleAgentRuns: { count: 0, examples: [] },
      staleRunningScheduledExecutions: { count: 0, examples: [] },
    },
    overdueScheduleThresholdMinutes: 15,
    pendingApprovalThresholdMinutes: 30,
    scope: { type: "platform" },
    highCostAgentThresholdGBP: 5,
    staleRunningThresholdMinutes: 60,
    windowStartDate: "2026-06-02",
    ...overrides,
  };
}

describe("SystemHealthPage", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it("shows a loading state while health is loading", () => {
    useQueryMock.mockReturnValue(undefined);

    render(<SystemHealthPage />);

    expect(screen.getByText("System Health")).toBeInTheDocument();
    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText("Loading recent agent failure checks.")).toBeInTheDocument();
  });

  it("shows a healthy summary when there are no signals", () => {
    useQueryMock.mockReturnValue(buildHealth());

    render(<SystemHealthPage />);

    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("No operator action needed")).toBeInTheDocument();
    expect(screen.getByText("Agent errors")).toBeInTheDocument();
    expect(screen.getByText("Scheduled runs")).toBeInTheDocument();
    expect(screen.getByText("Budget controls")).toBeInTheDocument();
    expect(screen.getByText("Alert rules")).toBeInTheDocument();
    expect(screen.getByText("Export report")).toBeInTheDocument();
    expect(screen.queryByText("Operator attention needed")).not.toBeInTheDocument();
  });

  it("shows operational signals and runbooks when attention is needed", () => {
    useQueryMock.mockReturnValue(buildHealth({
      operations: {
        agentFailures: {
          count: 1,
          examples: [{
            id: "log_1",
            label: "ERROR",
            occurredAt: Date.parse("2026-06-09T09:00:00.000Z"),
            summary: "Provider unavailable",
            targetName: "Ops Agent",
            targetType: "agent",
          }],
        },
        failedAgentTransactions: { count: 0, examples: [] },
        failedToolCalls: { count: 0, examples: [] },
        failedScheduledExecutions: { count: 0, examples: [] },
        highCostAgents: { count: 0, examples: [] },
        overdueSchedules: {
          count: 1,
          examples: [{
            id: "schedule_1",
            label: "Daily schedule",
            summary: "Never run",
            targetName: "Daily Workflow",
            targetType: "schedule",
          }],
        },
        pendingApprovals: { count: 0, examples: [] },
        providerFailures: { count: 0, examples: [] },
        schedulesMissingNextRun: { count: 0, examples: [] },
        staleAgentRuns: { count: 0, examples: [] },
        staleRunningScheduledExecutions: { count: 0, examples: [] },
      },
      budgetHealth: {
        agentCostBudgets: {
          count: 1,
          examples: [{
            id: "run_1",
            limit: 1,
            percentUsed: 95,
            summary: "£0.95 of £1.00 run budget",
            targetName: "Ops Agent",
            targetType: "agent",
            used: 0.95,
          }],
        },
        tenantMessageBudgets: { count: 0, examples: [] },
      },
    }));

    render(<SystemHealthPage />);

    expect(screen.getByText("3 signals")).toBeInTheDocument();
    expect(screen.getByText("Operator attention needed")).toBeInTheDocument();
    expect(screen.getByText("Agent execution errors")).toBeInTheDocument();
    expect(screen.getByText("Overdue active schedules")).toBeInTheDocument();
    expect(screen.getByText("Agent cost budget pressure")).toBeInTheDocument();
    expect(screen.getAllByText(/Ops Agent/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Daily Workflow/)).toBeInTheDocument();
  });

  it("shows company-scoped health reports", () => {
    useQueryMock.mockReturnValue(buildHealth({
      scope: { type: "company", companyId: "company_1", companyName: "Acme" },
    }));

    render(<SystemHealthPage />);

    expect(screen.getByText("Scope: Acme")).toBeInTheDocument();
  });
});
