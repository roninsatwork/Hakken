import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import CallsPage from "./page";

vi.mock("@/src/ui/components/layout/Header", () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/app/calls"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => {
    const t = (key: string, values?: Record<string, unknown>) =>
      key === "turns" ? `${values?.count} exchanges` : key;
    return t;
  }),
}));

/**
 * The wall display. What matters most is what it does NOT show: a room reads
 * this screen, so a caller's number appears only in its masked form.
 */
describe("CallsPage", () => {
  const queries = new Map<string, unknown>();

  beforeEach(() => {
    vi.clearAllMocks();
    queries.clear();
    vi.mocked(useQuery).mockImplementation(((reference: FunctionReference<"query">) => {
      // Told apart by their registered names — the page runs two queries.
      return getFunctionName(reference).includes("getCompanyPhoneNumber")
        ? queries.get("number")
        : queries.get("calls");
    }) as unknown as typeof useQuery);
  });

  it("leads with the dialable number, large, when one is connected", () => {
    queries.set("number", "+441234567890");
    queries.set("calls", []);

    render(<CallsPage />);

    // Spaced for reading off a wall; the compact form is what the query returns.
    expect(screen.getByText("+44 1234 567890")).toBeInTheDocument();
    expect(screen.getByText("dialUs")).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("says no number is connected rather than showing an empty headline", () => {
    queries.set("number", null);
    queries.set("calls", []);

    render(<CallsPage />);

    expect(screen.getByText("noNumber")).toBeInTheDocument();
  });

  it("shows a live badge the moment any call is in progress", () => {
    queries.set("number", "+441234567890");
    queries.set("calls", [
      {
        _id: "call-1",
        fromMasked: "***123",
        status: "IN_PROGRESS",
        startedAt: Date.now(),
        turnCount: 0,
      },
    ]);

    render(<CallsPage />);

    expect(screen.getByText("live")).toBeInTheDocument();
    expect(screen.getByText("status.IN_PROGRESS")).toBeInTheDocument();
  });

  it("lists calls masked, with their summaries, linking to the detail", () => {
    queries.set("number", "+441234567890");
    queries.set("calls", [
      {
        _id: "call-1",
        fromMasked: "***123",
        status: "COMPLETED",
        startedAt: Date.now(),
        endedAt: Date.now(),
        summary: "Asked about Sunday delivery.",
        matchedCustomerKey: "harbour-hotel",
        taskId: "task-1",
        turnCount: 4,
      },
    ]);

    render(<CallsPage />);

    expect(screen.getByText("***123")).toBeInTheDocument();
    expect(screen.getByText(/Sunday delivery/)).toBeInTheDocument();
    expect(screen.getByText(/harbour-hotel/)).toBeInTheDocument();
    // The full number appears exactly once on this page: as the company's own
    // dialable headline, never as a caller.
    expect(screen.getAllByText(/\+44/)).toHaveLength(1);
    expect(screen.getByRole("link", { name: /\*\*\*123/ })).toHaveAttribute(
      "href",
      "/app/calls/call-1"
    );
  });
});
