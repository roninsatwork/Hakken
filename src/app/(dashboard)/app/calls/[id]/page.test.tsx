import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { act, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CallDetailPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());

vi.mock("@/src/ui/components/layout/Header", () => ({
  default: () => <header>Header</header>,
}));

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Sonae" }),
}));

const params = Object.assign(Promise.resolve({ id: "call_1" }), {
  status: "fulfilled",
  value: { id: "call_1" },
});

describe("CallDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the shared header and blank content while the call query is unresolved", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<CallDetailPage params={params} />);

    expect(screen.getByRole("banner")).toHaveTextContent("Header");
    expect(container.lastElementChild).toBeEmptyDOMElement();
  });

  it("renders the unchanged call details after the query resolves", async () => {
    vi.mocked(useQuery).mockReturnValue({
      fromNumber: "+44 20 7946 0958",
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_060_000,
      status: "COMPLETED",
      matchedCustomerKey: "customer-42",
      taskId: "task-1",
      summary: "Caller asked about the renewal.",
      turns: [
        { role: "CALLER", text: "Can you help with my renewal?" },
        { role: "AGENT", text: "Of course." },
      ],
    } as unknown as ReturnType<typeof useQuery>);

    await act(async () => {
      render(<CallDetailPage params={params} />);
      await import("./CallDetailContent");
    });

    expect(screen.getByText("+44 20 7946 0958")).toBeInTheDocument();
    expect(screen.getByText(/customer-42/)).toBeInTheDocument();
    expect(screen.getByText("Caller asked about the renewal.")).toBeInTheDocument();
    expect(screen.getByText("Can you help with my renewal?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All calls" })).toHaveAttribute("href", "/app/calls");
  });
});
