import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import AgentApprovalsPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "count.pending") return `${values?.count}${values?.suffix} waiting`;
    if (key === "confirm.body") return `The agent asked to run ${values?.tool}.`;
    if (key === "footer.showing") return `Showing ${values?.count}`;
    // The shared table footer's own defaults (ui.table), which this screen
    // leans on rather than supplying labels of its own.
    if (key === "showingRange") return `Showing ${values?.start}-${values?.end} of ${values?.total}`;
    if (key === "pageOf") return `Page ${values?.page} of ${values?.totalPages}`;
    if (key === "previous") return "Previous";
    if (key === "next") return "Next";
    if (key === "noEntries") return "No entries found";
    return key;
  },
}));

const runMock = vi.fn(async (operation: () => Promise<unknown>) => {
  await operation();
  return { ok: true };
});

vi.mock("@/src/hooks/useAdminAction", () => ({
  useAdminAction: () => ({
    run: runMock,
    isBusy: () => false,
    error: null,
    clearError: vi.fn(),
  }),
}));

const approvalEntry = {
  approval: {
    _id: "approval_1",
    runId: "run_1",
    agentId: "agent_1",
    status: "PENDING",
    message: "Approval required before sending the renewal email.",
    previewJson: JSON.stringify({ tool: "email_send", arguments: { to: "customer@example.com" } }),
    requestedAt: Date.UTC(2026, 6, 20, 9, 30),
  },
  run: { _id: "run_1", agentId: "agent_1", objective: "Chase the overdue renewal" },
  toolCall: {
    _id: "call_1",
    normalizedToolName: "email_send",
    sideEffectLevel: "DESTRUCTIVE",
  },
  agent: { _id: "agent_1", name: "Renewals Agent" },
};

describe("AgentApprovalsPage", () => {
  const mutationMock = vi.fn();
  const loadMoreMock = vi.fn();
  let paginated: { results: unknown[]; status: string };
  let count: unknown;

  const renderPage = () => render(<AgentApprovalsPage />);

  beforeEach(() => {
    vi.clearAllMocks();
    paginated = { results: [approvalEntry], status: "Exhausted" };
    count = { count: 1, atLimit: false };

    vi.mocked(usePaginatedQuery).mockImplementation(() => ({
      results: paginated.results,
      status: paginated.status,
      loadMore: loadMoreMock,
      isLoading: false,
    }) as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useQuery).mockImplementation(() => count as ReturnType<typeof useQuery>);
    vi.mocked(useMutation).mockReturnValue(mutationMock as unknown as ReturnType<typeof useMutation>);
    mutationMock.mockResolvedValue(undefined);
  });

  it("shows the tool, its risk, the agent and the run", () => {
    renderPage();

    expect(screen.getByText("email_send")).toBeInTheDocument();
    // The difference between a lookup and a deletion, on the row rather than
    // buried in the payload.
    expect(screen.getByText("sideEffect.DESTRUCTIVE")).toBeInTheDocument();
    expect(screen.getByText("Renewals Agent")).toBeInTheDocument();
    expect(screen.getByText("Chase the overdue renewal")).toBeInTheDocument();
  });

  /**
   * The old header read `approvals.length`, so it under-reported the moment there
   * was more than one page of them.
   */
  it("counts every waiting approval, not the ones loaded", () => {
    count = { count: 42, atLimit: false };
    renderPage();

    expect(screen.getByText("42 waiting")).toBeInTheDocument();
    // The footer counts what has been fetched, and says so; the header counts
    // them all. The two disagreeing is the point of this test, so the footer's
    // wording is asserted rather than ignored — it now reads as a page range,
    // since the screen moved onto the numbered footer.
    expect(screen.getByText("Showing 1-1 of 1")).toBeInTheDocument();
  });

  it("marks the count as approximate when counting stopped at the limit", () => {
    count = { count: 99, atLimit: true };
    renderPage();

    expect(screen.getByText("99+ waiting")).toBeInTheDocument();
  });

  /**
   * The reviewer needs the run timeline to judge the call. The old screen linked
   * only to the agent, and the run was not reachable from here at all.
   */
  it("links to the run timeline as well as the agent", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "links.openRun" }))
      .toHaveAttribute("href", "/admin/agents/agent_1/runs");
    expect(screen.getByRole("link", { name: "links.openAgent" }))
      .toHaveAttribute("href", "/admin/agents/agent_1");
  });

  it("keeps the payload out of the way until it is asked for", () => {
    renderPage();

    expect(screen.queryByText(/customer@example.com/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { expanded: false }));

    // Folded away, not summarised away: this is what the decision is made on.
    expect(screen.getByText(/customer@example.com/)).toBeInTheDocument();
    expect(screen.getByText("Approval required before sending the renewal email."))
      .toBeInTheDocument();
  });

  it("approves without a confirmation step", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));

    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalledWith(expect.objectContaining({
        approvalId: "approval_1",
        decision: "APPROVED",
      }));
    });
  });

  /**
   * The guard. Rejecting ends the run and cannot be undone, and on the old screen
   * it was a single unguarded click.
   */
  it("does not reject until the confirmation is confirmed", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "actions.reject" }));

    expect(mutationMock).not.toHaveBeenCalled();
    expect(await screen.findByText("The agent asked to run email_send.")).toBeInTheDocument();
    expect(screen.getByText("confirm.warningTitle")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "confirm.confirm" }));

    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalledWith(expect.objectContaining({
        approvalId: "approval_1",
        decision: "REJECTED",
      }));
    });
  });

  it("tells an empty queue apart from an empty search", () => {
    paginated = { results: [], status: "Exhausted" };
    renderPage();

    expect(screen.getByText("empty.none")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("searchPlaceholder"), {
      target: { value: "nothing matches this" },
    });

    // "Nothing waiting" would be a lie while a search is filtering the queue.
    expect(screen.getByText("empty.noMatches")).toBeInTheDocument();
  });

  it("passes the search term to the server rather than filtering the loaded page", () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("searchPlaceholder"), {
      target: { value: "  renewals  " },
    });

    // Trimmed, and sent as an argument: filtering in the browser would search one
    // page of an unknown number and report no matches with matches still unpaged.
    const lastCall = vi.mocked(usePaginatedQuery).mock.calls.at(-1);
    expect(lastCall?.[1]).toEqual({ searchTerm: "renewals" });
  });

  it("sends no search term when the box is empty", () => {
    renderPage();

    const lastCall = vi.mocked(usePaginatedQuery).mock.calls.at(-1);
    expect(lastCall?.[1]).toEqual({ searchTerm: undefined });
  });
});
