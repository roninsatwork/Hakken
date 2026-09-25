import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries } from "@/src/test/siteViewFixtures";
import CompanyCollectionRunsPage from "./page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const run = (overrides: Record<string, unknown> = {}) => ({
  cycleId: "cycle_2",
  startedAt: Date.parse("2026-09-24T17:41:00Z"),
  websites: 12,
  requests: 149,
  reused: 33,
  costUsd: 7.85,
  aiCostUsd: 0.33,
  totalUsd: 8.18,
  previousTotalUsd: null,
  collectorRuns: 7,
  waiting: 0,
  answering: 1,
  failed: 0,
  final: false,
  ...overrides,
});

function showRuns(rows: unknown[]) {
  vi.mocked(usePaginatedQuery).mockReturnValue({ results: rows, status: "Exhausted", isLoading: false, loadMore: vi.fn() } as never);
}

/**
 * A company's collection runs: what each cost, against the one before, and
 * above them this month, the last run, a month from now and the next run.
 */
describe("Collection runs", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "seoRunReports:getCompanyRunSummary": {
        monthUsd: 8.18,
        monthRuns: 1,
        lastRun: { cycleId: "cycle_2", startedAt: Date.parse("2026-09-24T17:41:00Z"), totalUsd: 8.18 },
        estimate: { perMonthUsd: 24.55, lines: [] },
        nextRun: { at: Date.parse("2026-09-28T09:00:00Z"), cadence: "weekly" },
      },
    }));
  });

  it("shows each run's cost, and opens it in full", async () => {
    showRuns([run()]);
    renderWithProviders(<CompanyCollectionRunsPage />);

    expect(await screen.findByText("$24.55")).toBeInTheDocument();
    expect(screen.getAllByText("$8.18").length).toBeGreaterThan(0);
    expect(screen.getByText("$7.85")).toBeInTheDocument();
    expect(screen.getByText("admin.collectionRuns.status.answering")).toBeInTheDocument();

    fireEvent.click(screen.getByText("$7.85"));
    expect(push).toHaveBeenCalledWith("/admin/companies/company_1/websites/runs/cycle_2");
  });

  it("flags a run that cost a quarter more than the one before, and no other", async () => {
    showRuns([run({ previousTotalUsd: 5 }), run({ cycleId: "cycle_1", totalUsd: 5, previousTotalUsd: 4.5, answering: 0, final: true })]);
    renderWithProviders(<CompanyCollectionRunsPage />);

    expect(await screen.findAllByText("admin.collectionRuns.status.costUp")).toHaveLength(1);
    expect(screen.getByText("admin.collectionRuns.status.complete")).toBeInTheDocument();
  });

  it("says how the hourly check last went, and plainly when it is failing", async () => {
    // It was on Admin → Health alone (reliability plan V3).
    showRuns([run()]);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "seoRunReports:readHourlyCheck": {
        lastRanAt: Date.parse("2026-09-25T09:00:00Z"), ok: false, error: "Too many bytes read in a single function execution",
        lastSucceededAt: null, failuresInARow: 3, overdue: false,
      },
    }));
    renderWithProviders(<CompanyCollectionRunsPage />);

    expect(await screen.findByText("admin.collectionRuns.hourlyCheck.title")).toBeInTheDocument();
    expect(screen.getByText("admin.collectionRuns.hourlyCheck.failed")).toBeInTheDocument();
  });

  it("says the AI is still being added up for a run too new to have a report", async () => {
    showRuns([run({ aiCostUsd: null, websites: null, collectorRuns: null })]);
    renderWithProviders(<CompanyCollectionRunsPage />);

    expect(await screen.findByText("admin.collectionRuns.workingOut")).toBeInTheDocument();
  });
});
