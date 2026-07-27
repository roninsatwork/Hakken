import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import WorkflowExecutionsPage from "./page";

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "footer.showing") return `Showing ${values?.count}`;
    return key;
  },
}));

const halted = {
  _id: "exec_halted",
  workflowName: "Renewal Chase",
  status: "RUNNING",
  triggerType: "MANUAL",
  startedByName: "Anthony",
  startedAt: Date.UTC(2026, 6, 27, 9, 0),
  awaitingApprovalNodeId: "approval",
};

const finished = {
  _id: "exec_done",
  workflowName: "Nightly Sync",
  status: "SUCCESS",
  triggerType: "SCHEDULE",
  startedByName: "System",
  startedAt: Date.UTC(2026, 6, 26, 2, 0),
  awaitingApprovalNodeId: undefined,
};

describe("WorkflowExecutionsPage", () => {
  let results: unknown[];

  beforeEach(() => {
    vi.clearAllMocks();
    results = [halted, finished];
    vi.mocked(usePaginatedQuery).mockImplementation(() => ({
      results,
      status: "Exhausted",
      loadMore: vi.fn(),
      isLoading: false,
    }) as unknown as ReturnType<typeof usePaginatedQuery>);
  });

  /**
   * There has been no screen for workflow runs since the log pages were deleted
   * in cc5bc9558, so pressing "run" in the builder led nowhere.
   */
  it("lists runs and links each to its detail", () => {
    render(<WorkflowExecutionsPage />);

    expect(screen.getByRole("link", { name: "Renewal Chase" }))
      .toHaveAttribute("href", "/admin/workflows/executions/exec_halted");
    expect(screen.getByRole("link", { name: "Nightly Sync" }))
      .toHaveAttribute("href", "/admin/workflows/executions/exec_done");
  });

  /**
   * The one thing on this list that needs acting on rather than reading, so it is
   * on the row rather than behind a click.
   */
  it("flags the run that is waiting on a person, and only that one", () => {
    render(<WorkflowExecutionsPage />);

    expect(screen.getAllByText("awaitingApproval")).toHaveLength(1);
  });

  it("renders an empty state when nothing has run", () => {
    results = [];
    render(<WorkflowExecutionsPage />);

    expect(screen.getAllByText("empty").length).toBeGreaterThan(0);
  });
});
