import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AnalyticsPage from "./page";

const updateAnalyticsId = vi.fn();

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
};
type AnalyticsHealth = {
  checkedDates: string[];
  daysBack: number;
  liveToday: {
    agentTransactions: number;
    assistantMessages: number;
    date: string;
  };
  messageDimensions: {
    examples: string[];
    mismatched: number;
    missingDimensions: number;
    missingThreads: number;
    scanned: number;
    windowStartDate: string;
  };
  snapshotCoverage: {
    dates: Array<{
      companySnapshots: number;
      date: string;
      globalSnapshots: number;
      hasGlobalSnapshot: boolean;
      userSnapshots: number;
    }>;
    duplicateSnapshotGroups: Array<{
      count: number;
      date: string;
      scopeId: string;
      type: "global" | "company" | "user";
    }>;
    missingGlobalDates: string[];
    totalSnapshots: number;
  };
};

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

function buildHealth(overrides: Partial<AnalyticsHealth> = {}): AnalyticsHealth {
  return {
    ...buildHealthyHealth(),
    ...overrides,
  };
}

function buildHealthyHealth(): AnalyticsHealth {
  return {
    checkedDates: ["2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-05-31", "2026-06-01"],
    daysBack: 7,
    liveToday: {
      agentTransactions: 2,
      assistantMessages: 12,
      date: "2026-06-02",
    },
    messageDimensions: {
      examples: [],
      mismatched: 0,
      missingDimensions: 0,
      missingThreads: 0,
      scanned: 6,
      windowStartDate: "2026-05-26",
    },
    snapshotCoverage: {
      dates: [],
      duplicateSnapshotGroups: [],
      missingGlobalDates: [],
      totalSnapshots: 9,
    },
  };
}

describe("AnalyticsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockReturnValue(updateAnalyticsId as unknown as ReturnType<typeof useMutation>);
    updateAnalyticsId.mockResolvedValue(undefined);
  });

  it("shows a healthy analytics data-health summary", () => {
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("getAnalyticsId")) return "G-HAKKEN";
      if (path.includes("getAnalyticsDataHealthForAdmin")) return buildHealthyHealth();
      return undefined;
    });

    render(<AnalyticsPage />);

    expect(screen.getByText("Analytics Data Health")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.queryByText("Operator attention needed")).not.toBeInTheDocument();
  });

  it("shows operator details when snapshot or dimension health drifts", () => {
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("getAnalyticsId")) return "";
      if (path.includes("getAnalyticsDataHealthForAdmin")) {
        return buildHealth({
          messageDimensions: {
            examples: ["message_1"],
            mismatched: 1,
            missingDimensions: 2,
            missingThreads: 0,
            scanned: 6,
            windowStartDate: "2026-05-26",
          },
          snapshotCoverage: {
            dates: [],
            duplicateSnapshotGroups: [{ count: 2, date: "2026-06-01", scopeId: "global", type: "global" }],
            missingGlobalDates: ["2026-05-31"],
            totalSnapshots: 9,
          },
        });
      }
      return undefined;
    });

    render(<AnalyticsPage />);

    expect(screen.getByText("5 signals")).toBeInTheDocument();
    expect(screen.getByText("Operator attention needed")).toBeInTheDocument();
    expect(screen.getByText(/Missing snapshot dates: 2026-05-31/)).toBeInTheDocument();
    expect(screen.getByText(/Duplicate snapshot groups: 2026-06-01 global:global/)).toBeInTheDocument();
    expect(screen.getByText(/Message dimension examples: message_1/)).toBeInTheDocument();
  });

  it("loads the unchanged success feedback after saving", async () => {
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("getAnalyticsId")) return "G-HAKKEN";
      if (path.includes("getAnalyticsDataHealthForAdmin")) return buildHealthyHealth();
      return undefined;
    });

    render(<AnalyticsPage />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "G-HAKKEN-NEW" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit Configuration" }));

    await waitFor(() => expect(updateAnalyticsId).toHaveBeenCalledWith({ trackingId: "G-HAKKEN-NEW" }));
    expect(await screen.findByText("Tracking Integrated")).toBeInTheDocument();
  });
});
