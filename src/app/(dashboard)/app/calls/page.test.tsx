import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import CallsPage from "./page";
// Preload the deferred module so presentation assertions are not sensitive to
// module-fetch latency when the full repository suite is running in parallel.
import "./CallsContent";

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

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Sonae" }),
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

  it("starts both live queries immediately while preserving the unresolved shells", () => {
    const { container } = render(<CallsPage />);

    expect(vi.mocked(useQuery)).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "recent" })).toBeInTheDocument();
    expect(container.querySelector("section")).toBeEmptyDOMElement();
  });

  it("leads with the dialable number, large, when one is connected", async () => {
    queries.set("number", "+441234567890");
    queries.set("calls", []);

    render(<CallsPage />);

    // Spaced for reading off a wall; the compact form is what the query returns.
    expect(await screen.findByText("+44 1234 567890")).toBeInTheDocument();
    expect(await screen.findByText("dialUs")).toBeInTheDocument();
    expect(await screen.findByText("idle")).toBeInTheDocument();
  });

  it("says no number is connected rather than showing an empty headline", async () => {
    queries.set("number", null);
    queries.set("calls", []);

    render(<CallsPage />);

    expect(await screen.findByText("noNumber")).toBeInTheDocument();
  });

  it("shows a live badge the moment any call is in progress", async () => {
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

    expect(await screen.findByText("live")).toBeInTheDocument();
    expect(await screen.findByText("status.IN_PROGRESS")).toBeInTheDocument();
  });

  it("lists calls masked, with their summaries, linking to the detail", async () => {
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

    expect(await screen.findByText("***123")).toBeInTheDocument();
    expect(await screen.findByText(/Sunday delivery/)).toBeInTheDocument();
    expect(await screen.findByText(/harbour-hotel/)).toBeInTheDocument();
    // The full number appears exactly once on this page: as the company's own
    // dialable headline, never as a caller.
    expect(screen.getAllByText(/\+44/)).toHaveLength(1);
    expect(screen.getByRole("link", { name: /\*\*\*123/ })).toHaveAttribute(
      "href",
      "/app/calls/call-1"
    );
  });
});
