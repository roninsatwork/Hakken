import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import SchedulesPage from "./page";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const labels: Record<string, string> = {
      "actions.delete": "Delete",
      "actions.forceRun": "Force Run",
      description: "Scheduled automation",
      "errors.default": "Something went wrong",
      "modals.delete.cancel": "Cancel",
      "modals.delete.confirm": `Delete ${values?.name ?? ""}`,
      "modals.delete.submit": "Delete",
      "modals.delete.submitting": "Deleting...",
      "modals.delete.title": "Delete Schedule",
      "modals.error.deleteFailed": "Delete failed",
      "modals.error.dismiss": "Dismiss",
      "modals.error.executionFailed": "Execution failed",
      "modals.error.statusFailed": "Status failed",
      "modals.execution.body": "Schedule started",
      "modals.execution.title": "Execution queued",
      newSchedule: "New Schedule",
      "pagination.items": "items",
      "pagination.of": "of",
      "pagination.showing": "Showing",
      "pagination.to": "to",
      searchPlaceholder: "Search schedules",
      "status.armed": "Armed",
      "status.paused": "Paused",
      "table.actions": "Actions",
      "table.details": "Details",
      "table.interval": "Interval",
      "table.noSchedules": "No schedules",
      "table.status": "Status",
      "table.workflow": "Workflow",
      title: "Schedules",
    };
    return labels[key] ?? key;
  },
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ children, ...props }, ref) =>
          React.createElement(tag, { ...props, ref }, children)
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    }
  ),
}));

const schedules = [
  { _id: "schedule_1", _creationTime: 1, name: "Morning Digest", workflowName: "Daily Digest", targetName: "Daily Digest", workflowId: "workflow_1", intervalStr: "Daily", isActive: true },
  { _id: "schedule_2", _creationTime: 1, name: "Lead Followup", workflowName: "Lead Router", targetName: "Lead Router", workflowId: "workflow_2", intervalStr: "Hourly", isActive: false },
];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("SchedulesPage", () => {
  const deleteSchedule = vi.fn();
  const toggleSchedule = vi.fn();
  const manualRunSchedule = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue(schedules);
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("deleteSchedule")) return deleteSchedule as unknown as ReturnType<typeof useMutation>;
      if (path.includes("toggleSchedule")) return toggleSchedule as unknown as ReturnType<typeof useMutation>;
      return manualRunSchedule as unknown as ReturnType<typeof useMutation>;
    });
    deleteSchedule.mockResolvedValue(undefined);
    toggleSchedule.mockResolvedValue(undefined);
    manualRunSchedule.mockResolvedValue(undefined);
  });

  it("renders, filters, and navigates schedule rows", () => {
    render(<SchedulesPage />);

    expect(screen.getByText("Morning Digest")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search schedules"), { target: { value: "followup" } });

    expect(screen.queryByText("Morning Digest")).not.toBeInTheDocument();
    expect(screen.getByText("Lead Followup")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Lead Followup"));
    expect(pushMock).toHaveBeenCalledWith("/admin/workflows/schedules/schedule_2");
  });

  it("opens the new route and wires toggle, manual run, and delete actions", async () => {
    render(<SchedulesPage />);

    fireEvent.click(screen.getByRole("button", { name: /New Schedule/i }));
    expect(pushMock).toHaveBeenCalledWith("/admin/workflows/schedules/new");

    fireEvent.click(screen.getByRole("button", { name: /Armed/i }));
    await waitFor(() => expect(toggleSchedule).toHaveBeenCalledWith({ scheduleId: "schedule_1", isActive: false }));

    fireEvent.click(screen.getAllByTitle("Force Run")[0]);
    await waitFor(() => expect(manualRunSchedule).toHaveBeenCalledWith({ workflowId: "workflow_1", agentId: undefined }));
    expect(screen.getByText("Execution queued")).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle("Delete")[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1) as HTMLButtonElement);
    await waitFor(() => expect(deleteSchedule).toHaveBeenCalledWith({ scheduleId: "schedule_1" }));
  });
});
