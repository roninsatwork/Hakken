import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useQuery } from "convex/react";
import WorkflowExecutionDetailPage from "./page";

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "exec_1" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "detail.confirm.body") return `The workflow is waiting at ${values?.node}.`;
    if (key === "detail.description") return `${values?.status} · started ${values?.started}`;
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

const execution = {
  _id: "exec_1",
  workflowName: "Renewal Chase",
  status: "RUNNING",
  startedAt: Date.UTC(2026, 6, 27, 9, 0),
  steps: [
    {
      _id: "step_done",
      nodeId: "fetch",
      status: "SUCCESS",
      output: JSON.stringify({ rows: 3 }),
      startedAt: Date.UTC(2026, 6, 27, 9, 0),
    },
    {
      _id: "step_halted",
      nodeId: "approval",
      status: "PENDING_APPROVAL",
      output: JSON.stringify({
        _system: { halt: true },
        message: "Send the renewal email?",
        previewData: "customer@example.com",
      }),
      startedAt: Date.UTC(2026, 6, 27, 9, 1),
    },
  ],
};

describe("WorkflowExecutionDetailPage", () => {
  const actionMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue(execution as ReturnType<typeof useQuery>);
    vi.mocked(useAction).mockReturnValue(actionMock as unknown as ReturnType<typeof useAction>);
    actionMock.mockResolvedValue(undefined);
  });

  /**
   * A Human Approval node can be dragged into the builder, configured, saved and
   * run. Until this screen there was nowhere to answer it, so the run simply
   * stopped for ever.
   */
  it("shows what the halted step is asking, and its preview", () => {
    render(<WorkflowExecutionDetailPage />);

    expect(screen.getByText("Send the renewal email?")).toBeInTheDocument();
    expect(screen.getByText("customer@example.com")).toBeInTheDocument();
  });

  it("offers a decision only on the step that is waiting", () => {
    render(<WorkflowExecutionDetailPage />);

    expect(screen.getAllByRole("button", { name: /detail.approve/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /detail.reject/ })).toHaveLength(1);
  });

  it("approves the halted node", async () => {
    render(<WorkflowExecutionDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: /detail.approve/ }));

    await waitFor(() => {
      expect(actionMock).toHaveBeenCalledWith(expect.objectContaining({
        executionId: "exec_1",
        nodeId: "approval",
        action: "APPROVED",
      }));
    });
  });

  /** Rejecting stops the whole run, so it is not a single unguarded click. */
  it("does not reject until the confirmation is confirmed", async () => {
    render(<WorkflowExecutionDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: /detail.reject/ }));

    expect(actionMock).not.toHaveBeenCalled();
    expect(screen.getByText("The workflow is waiting at approval.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "detail.confirm.confirm" }));

    await waitFor(() => {
      expect(actionMock).toHaveBeenCalledWith(expect.objectContaining({
        nodeId: "approval",
        action: "REJECTED",
      }));
    });
  });
});
