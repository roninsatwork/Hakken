import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { render as renderBase, screen, within } from "@testing-library/react";
import messages from "../../../../../../../messages/en.json";

// The screen resolves its copy through the catalogue, so it renders inside
// the same intl provider the root layout supplies.
function render(ui: React.ReactElement) {
  return renderBase(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery, usePaginatedQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentObservabilityPage from "./page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1" }),
  useRouter: () => ({ push: pushMock }),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

function analytics(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    totals: { runs: 694, costUsd: 9.72, successRate: 0.86 },
    lookbackDays: 7,
    latency: { medianMs: 4200, p95Ms: 31400, averageMs: 6600, sampleSize: 694 },
    dailySeries: [
      { dayStartMs: now - 2 * DAY_MS, total: 100, succeeded: 96, failed: 4, costUsd: 1.4 },
      { dayStartMs: now - DAY_MS, total: 138, succeeded: 100, failed: 38, costUsd: 1.9 },
    ],
    comparison: {
      current: { runs: 694, succeeded: 600, failed: 94, costUsd: 9.72, successRate: 0.86, costPerRunUsd: 0.014 },
      previous: { runs: 619, succeeded: 604, failed: 15, costUsd: 8.19, successRate: 0.976, costPerRunUsd: 0.013 },
    },
    versionChangeDays: [Date.now() - DAY_MS],
    sampleTruncated: false,
    failureGroups: [
      {
        failureKey: "the property search timed out",
        label: "The property search timed out",
        count: 42,
        firstSeenAt: now - 2 * DAY_MS,
        lastSeenAt: now - 600_000,
        runIds: [],
      },
    ],
    statusCounts: { QUEUED: 0, RUNNING: 1, PENDING_APPROVAL: 3, SUCCESS: 600, FAILED: 94, CANCELLED: 0 },
    toolStats: [
      { handlerMapping: "research.search", calls: 1180, successes: 1038, failures: 142, approvalsRequired: 0, denied: 0, cancelled: 0, notImplemented: 0 },
    ],
    ...overrides,
  };
}

const runs = [
  {
    _id: "run_1",
    objective: "Find new three-bed listings in Bristol under £400k",
    status: "FAILED",
    triggerType: "SCHEDULE",
    startedAt: Date.now() - 600_000,
    completedAt: Date.now() - 600_000 + 31_400,
    costUsd: 0.021,
    error: "The property search timed out",
  },
];

describe("AgentObservabilityPage", () => {
  let analyticsFixture: unknown;
  let runsFixture: unknown[];

  const renderPage = () => render(<AgentObservabilityPage />);

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsFixture = analytics();
    runsFixture = runs;

    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const name = getFunctionName(queryFn);
      if (name === "agentRuns:getAnalyticsForAgent") return analyticsFixture as ReturnType<typeof useQuery>;
      if (name === "aiTools:getTools") {
        return [{ handlerMapping: "research.search", name: "Property search" }] as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });

    vi.mocked(usePaginatedQuery).mockImplementation((queryFn) => {
      const name = getFunctionName(queryFn);
      if (name === "agentRuns:getForAgent") {
        return { results: runsFixture, status: "Exhausted", loadMore: vi.fn(), isLoading: false } as never;
      }
      return { results: [], status: "Exhausted", loadMore: vi.fn(), isLoading: false } as never;
    });
  });

  it("leads with the numbers somebody opens the screen for", () => {
    renderPage();

    expect(screen.getByText("Jobs run")).toBeInTheDocument();
    expect(screen.getByText("694")).toBeInTheDocument();
    expect(screen.getByText("Finished cleanly")).toBeInTheDocument();
    expect(screen.getByText("86%")).toBeInTheDocument();
  });

  it("says how a number changed against the period before it", () => {
    renderPage();

    expect(screen.getByText("12% more")).toBeInTheDocument();
    // A rate change reads in points, which is a figure the reader can check
    // against the percentage printed directly above it.
    expect(screen.getByText("11.6 pts lower")).toBeInTheDocument();
  });

  it("surfaces the slow tail rather than reporting an average", () => {
    renderPage();

    expect(screen.getByText("Usually takes")).toBeInTheDocument();
    expect(screen.getByText("4.2s")).toBeInTheDocument();
    expect(screen.getByText("but 1 in 20 takes over 31.4s")).toBeInTheDocument();
    // The mean is 6.6s and would make the agent look fine.
    expect(screen.queryByText("6.6s")).not.toBeInTheDocument();
  });

  it("says plainly that jobs are held up waiting for a person", () => {
    renderPage();

    expect(screen.getByText("Waiting on a person")).toBeInTheDocument();
    expect(screen.getByText("these cannot finish until someone decides")).toBeInTheDocument();
    expect(screen.queryByText(/PENDING_APPROVAL/)).not.toBeInTheDocument();
  });

  it("groups failures by cause and names how many jobs each cost", () => {
    renderPage();

    expect(screen.getByText("The property search timed out")).toBeInTheDocument();
    expect(screen.getByText("42 jobs")).toBeInTheDocument();
  });

  it("names tools as they are configured rather than by their handler", () => {
    renderPage();

    expect(screen.getByText("Property search")).toBeInTheDocument();
    expect(screen.queryByText("research.search")).not.toBeInTheDocument();
  });

  it("reads a job's status and trigger in ordinary words", () => {
    renderPage();

    const job = screen.getByText("Find new three-bed listings in Bristol under £400k").closest("button")!;
    expect(within(job).getByText("Failed")).toBeInTheDocument();
    expect(within(job).getByText(/Scheduled/)).toBeInTheDocument();
  });

  it("invites the first run instead of showing a wall of zeros", () => {
    analyticsFixture = analytics({
      totals: { runs: 0, costUsd: 0, successRate: 0 },
      dailySeries: [],
      failureGroups: [],
      toolStats: [],
    });
    renderPage();

    expect(screen.getByText("This agent has not run yet")).toBeInTheDocument();
    expect(screen.queryByText("Jobs run")).not.toBeInTheDocument();
  });

  it("admits when the period is too busy to measure whole", () => {
    analyticsFixture = analytics({ sampleTruncated: true });
    renderPage();

    expect(
      screen.getByText(/cover its most recent activity rather than the whole period/)
    ).toBeInTheDocument();
  });

  it("waits rather than rendering an empty screen before the numbers arrive", () => {
    analyticsFixture = undefined;
    renderPage();

    expect(screen.queryByText("Jobs run")).not.toBeInTheDocument();
    expect(screen.queryByText("This agent has not run yet")).not.toBeInTheDocument();
  });
});
