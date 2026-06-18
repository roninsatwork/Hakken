import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import WebhookDeliveriesPage from "./page";

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));

const companies = [
  { _id: "company_1", name: "Acme" },
  { _id: "company_2", name: "Beta" },
];

const deliveries = [
  {
    _id: "delivery_1",
    _creationTime: 1,
    companyId: "company_1",
    companyName: "Acme",
    eventType: "agent.run.completed",
    destinationUrl: "https://example.com/hooks/agent",
    status: "SUCCESS",
    sourceType: "agentRun",
    sourceId: "run_1",
    attemptCount: 1,
    maxAttempts: 5,
    lastStatusCode: 200,
    deliveredAt: Date.UTC(2026, 5, 18, 10, 2),
    createdAt: Date.UTC(2026, 5, 18, 10),
    updatedAt: Date.UTC(2026, 5, 18, 10, 2),
  },
  {
    _id: "delivery_2",
    _creationTime: 2,
    companyId: "company_1",
    companyName: "Acme",
    eventType: "agent.run.failed",
    destinationUrl: "https://example.com/hooks/failure",
    status: "RETRY_SCHEDULED",
    sourceType: "agentRun",
    sourceId: "run_2",
    attemptCount: 2,
    maxAttempts: 5,
    lastStatusCode: 503,
    lastError: "Service unavailable",
    nextAttemptAt: Date.UTC(2026, 5, 18, 10, 10),
    createdAt: Date.UTC(2026, 5, 18, 10, 5),
    updatedAt: Date.UTC(2026, 5, 18, 10, 6),
  },
];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("WebhookDeliveriesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn: unknown, args?: unknown) => {
      void args;
      const path = getConvexPath(queryFn);
      if (path.includes("companies:getCompanyOptions")) return companies as unknown as ReturnType<typeof useQuery>;
      if (path.includes("webhookDeliveries:getSummary")) {
        return {
          scope: "platform",
          lookbackDays: 7,
          total: 2,
          retrying: 1,
          failedOrAbandoned: 0,
          successRate: 1,
          statusCounts: {
            PENDING: 0,
            DELIVERING: 0,
            SUCCESS: 1,
            FAILED: 0,
            RETRY_SCHEDULED: 1,
            ABANDONED: 0,
          },
          nextActions: [
            "No terminal delivery failures in the current sample.",
            "Check retry windows and destination health for scheduled retries.",
          ],
        } as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: deliveries,
      status: "Exhausted",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
  });

  it("renders webhook delivery summary and delivery rows", () => {
    render(<WebhookDeliveriesPage />);

    expect(screen.getByText("Webhook Deliveries")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("agent.run.completed")).toBeInTheDocument();
    expect(screen.getByText("agent.run.failed")).toBeInTheDocument();
    expect(screen.getByText("Service unavailable")).toBeInTheDocument();
  });

  it("passes company and status filters to the paginated query", () => {
    render(<WebhookDeliveriesPage />);

    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "company_1" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "RETRY_SCHEDULED" } });

    expect(usePaginatedQuery).toHaveBeenLastCalledWith(
      expect.anything(),
      {
        companyId: "company_1",
        status: "RETRY_SCHEDULED",
      },
      { initialNumItems: 15 }
    );
  });
});
