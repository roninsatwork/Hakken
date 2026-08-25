import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderWithProviders as renderBase, screen } from "@/src/test/renderWithProviders";
import messages from "../../../../../../../../messages/en.json";

// The screen resolves its copy through the catalogue, so it renders inside
// the same intl provider the root layout supplies.
function render(ui: React.ReactElement) {
  return renderBase(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import AgentCheckDetailPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1", fixtureId: "fixture_1" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const check = {
  fixtureId: "fixture_1",
  agentId: "agent_1",
  objective: "Summarise this month's overdue invoices.",
  expectedFinalOutputRubric: "Lists each invoice with the customer and amount. Never invents a figure.",
  tags: ["critical"],
  updatedAt: Date.UTC(2026, 6, 20),
  status: "ACTIVE",
};

const gradedRun = {
  runId: "run_2",
  status: "FAILED",
  gradingMode: "MODEL_GRADED",
  startedAt: Date.UTC(2026, 6, 26),
  completedAt: Date.UTC(2026, 6, 26, 0, 1),
  modelId: "a-chat-model",
  inputTokens: 400,
  outputTokens: 90,
  finalOutput: "Model-graded smoke eval failed. It invented an invoice for £4,000 that was not in the data.",
  error: undefined,
  failures: [],
  missingToolMappings: [],
};

describe("AgentCheckDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockReturnValue(vi.fn() as unknown as ReturnType<typeof useMutation>);
  });

  // The output and the reason it was marked down were reachable only from a stream of
  // every run the agent had ever had, clamped to two lines.
  it("shows the full output and why it was marked down", async () => {
    vi.mocked(useQuery).mockReturnValue({ check, history: [gradedRun] } as unknown as ReturnType<typeof useQuery>);

    render(<AgentCheckDetailPage />);

    expect(await screen.findByRole("heading", { level: 1, name: /Summarise this month's overdue invoices/ })).toBeInTheDocument();
    expect(screen.getByText("Failing")).toBeInTheDocument();
    expect(screen.getByText(/It invented an invoice for £4,000/)).toBeInTheDocument();
    expect(screen.getByText(/Lists each invoice with the customer and amount/)).toBeInTheDocument();
    expect(screen.getByText("Must pass before going live")).toBeInTheDocument();
  });

  // A setup run calls no model, so the page must not let its output read as evidence
  // that the agent works.
  it("says plainly when the last run was only a setup check", async () => {
    vi.mocked(useQuery).mockReturnValue({
      check,
      history: [{ ...gradedRun, gradingMode: "CONTRACT_ONLY", status: "SUCCESS" }],
    } as unknown as ReturnType<typeof useQuery>);

    render(<AgentCheckDetailPage />);

    expect(await screen.findByText("Setup only")).toBeInTheDocument();
    expect(screen.getByText(/asks it nothing, so it is not evidence the agent works/)).toBeInTheDocument();
    expect(screen.queryByText("Passing")).not.toBeInTheDocument();
  });

  it("tells you it has never run rather than showing an empty panel", async () => {
    vi.mocked(useQuery).mockReturnValue({ check, history: [] } as unknown as ReturnType<typeof useQuery>);

    render(<AgentCheckDetailPage />);

    expect(await screen.findByText("Not run yet")).toBeInTheDocument();
    expect(screen.getByText(/This check has never been run/)).toBeInTheDocument();
  });

  it("keeps the existing full-screen spinner while the detail query is loading", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<AgentCheckDetailPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
