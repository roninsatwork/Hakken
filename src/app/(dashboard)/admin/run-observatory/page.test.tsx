import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import RunObservatoryPage from "./page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const observatory = {
  scope: "platform",
  lookbackDays: 7,
  sampledRuns: 3,
  sampledToolCalls: 2,
  totals: {
    runs: 3,
    successfulRuns: 1,
    failedRuns: 1,
    activeRuns: 1,
    costGBP: 0.34,
    inputTokens: 150,
    outputTokens: 40,
    successRate: 0.5,
    averageLatencyMs: 1250,
  },
  statusCounts: {
    QUEUED: 0,
    RUNNING: 1,
    PENDING_APPROVAL: 0,
    SUCCESS: 1,
    FAILED: 1,
    CANCELLED: 0,
  },
  triggerCounts: {
    CHAT: 1,
    WORKFLOW: 2,
  },
  modelStats: [{
    modelId: "model-support",
    providerKey: "openai",
    runs: 2,
    failures: 1,
    costGBP: 0.22,
  }],
  agentStats: [{
    agentId: "agent_1",
    agentName: "Support Agent",
    runs: 2,
    failures: 1,
    costGBP: 0.22,
    lastRunAt: Date.UTC(2026, 5, 18, 9, 0),
  }],
  toolStats: [{
    handlerMapping: "billing.exception.update",
    calls: 1,
    failures: 1,
    approvalsRequired: 0,
    denied: 0,
    writeOrExternal: 1,
  }],
  failureReasons: [{
    reason: "Tool validation failed",
    count: 1,
  }],
  recentRuns: [{
    runId: "run_1",
    agentId: "agent_1",
    agentName: "Support Agent",
    status: "FAILED",
    triggerType: "WORKFLOW",
    objective: "Prepare billing exception",
    startedAt: Date.UTC(2026, 5, 18, 9, 0),
    completedAt: Date.UTC(2026, 5, 18, 9, 0, 1),
    latencyMs: 1000,
    costGBP: 0.12,
    modelId: "model-support",
    error: "Tool validation failed",
    nextAction: "Open the run timeline, inspect failed steps, and convert the failure into an eval fixture if it should never repeat.",
  }],
};

describe("RunObservatoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agentRuns:getRunObservatory") {
        return observatory as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
  });

  it("renders observatory metrics, breakdowns, and run links", () => {
    render(<RunObservatoryPage />);

    expect(screen.getByText("Run Observatory")).toBeInTheDocument();
    expect(screen.getByText("Cross-agent execution health, failure evidence, cost, model, and tool signals for recent agent runs.")).toBeInTheDocument();
    expect(screen.getByText("Success rate")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Recent Run Evidence")).toBeInTheDocument();
    expect(screen.getByText("Prepare billing exception")).toBeInTheDocument();
    expect(screen.getAllByText("Tool validation failed").length).toBeGreaterThan(0);
    expect(screen.getByText("Agents Needing Attention")).toBeInTheDocument();
    expect(screen.getAllByText("Support Agent").length).toBeGreaterThan(0);
    expect(screen.getByText("Tool Risk")).toBeInTheDocument();
    expect(screen.getByText("billing.exception.update")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open timeline" })).toHaveAttribute(
      "href",
      "/admin/agents/agent_1/runs?runId=run_1"
    );
  });
});
