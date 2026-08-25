import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useAction, useQuery } from "convex/react";
import type { Doc } from "@/convex/_generated/dataModel";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PropertiesLogsPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());

vi.mock("@/src/ui/components/layout/Header", () => ({
  default: () => <header>Header</header>,
}));

const run = (overrides: Partial<Doc<"apifyRuns">> = {}) => ({
  _id: "run_document_123",
  _creationTime: 1_700_000_000_000,
  runId: "apify-run-123",
  status: "COMPLETED",
  startedAt: 1_700_000_000_000,
  completedAt: 1_700_000_030_000,
  propertiesScraped: 42,
  ...overrides,
}) as Doc<"apifyRuns">;

describe("PropertiesLogsPage", () => {
  const syncRun = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    syncRun.mockResolvedValue(undefined);
    vi.mocked(useAction).mockReturnValue(syncRun as unknown as ReturnType<typeof useAction>);
  });

  it("keeps the query, header, and exact empty presentation immediate while unresolved", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    render(<PropertiesLogsPage />);

    expect(useQuery).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("banner")).toHaveTextContent("Header");
    expect(screen.getByRole("heading", { name: "Extraction Logs" })).toBeInTheDocument();
    expect(screen.getByText("No extraction jobs have been dispatched yet.")).toBeInTheDocument();
  });

  it("renders the unchanged populated run details after the query answers", async () => {
    vi.mocked(useQuery).mockReturnValue([run()] as unknown as ReturnType<typeof useQuery>);

    await act(async () => {
      render(<PropertiesLogsPage />);
      await import("./PropertiesRunRows");
    });

    expect(screen.getByText("apify-run-123")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/Dispatched:/)).toBeInTheDocument();
    expect(screen.getByText(/Finished:/)).toBeInTheDocument();
  });

  it("keeps immediate and 30-second pending-run synchronization plus the manual control", async () => {
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    vi.mocked(useQuery).mockReturnValue([
      run({ status: "PENDING", completedAt: undefined, propertiesScraped: undefined }),
    ] as unknown as ReturnType<typeof useQuery>);

    await act(async () => {
      render(<PropertiesLogsPage />);
      await import("./PropertiesRunRows");
    });

    await waitFor(() => expect(syncRun).toHaveBeenCalledWith({ runId: "apify-run-123" }));
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);

    fireEvent.click(screen.getByRole("button", { name: "Sync Status" }));
    await waitFor(() => expect(syncRun).toHaveBeenCalledTimes(2));
    intervalSpy.mockRestore();
  });
});
