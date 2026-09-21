import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { act, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminCallDetailPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company_1", callId: "call_1" }),
}));

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Hakken" }),
}));

const params = Object.assign(Promise.resolve({ id: "company_1", callId: "call_1" }), {
  status: "fulfilled",
  value: { id: "company_1", callId: "call_1" },
});

describe("AdminCallDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the existing blank state while the call query is unresolved", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<AdminCallDetailPage params={params} />);

    expect(container.firstElementChild).toBeEmptyDOMElement();
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
      render(<AdminCallDetailPage params={params} />);
      await import("./AdminCallDetailContent");
    });

    expect(screen.getByText("+44 20 7946 0958")).toBeInTheDocument();
    expect(screen.getByText(/customer-42/)).toBeInTheDocument();
    expect(screen.getByText("Caller asked about the renewal.")).toBeInTheDocument();
    expect(screen.getByText("Can you help with my renewal?")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/companies/company_1/calls");
  });
});
