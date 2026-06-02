import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import WorkflowsPage from "./page";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        "buttons.cancel": "Cancel",
        "buttons.create": "Create Workflow",
        "buttons.delete": "Delete",
        description: "Automate operations",
        "errors.create": "Failed to create",
        "errors.delete": "Failed to delete",
        "modal.deleteConfirm": `Delete ${values?.name ?? ""}`,
        "modal.deleteTitle": "Delete Workflow",
        "modal.description": "Description",
        "modal.initDesc": "Create a workflow",
        "modal.initTitle": "New Workflow",
        "modal.name": "Name",
        new: "New Workflow",
        "pagination.items": "items",
        "pagination.of": "of",
        "pagination.showing": "Showing",
        "pagination.to": "to",
        "placeholders.description": "Describe workflow",
        "placeholders.name": "Workflow name",
        "table.actions": "Actions",
        "table.active": "Active",
        "table.draft": "Draft",
        "table.empty": "No workflows",
        "table.loadMore": "Load More Workflows",
        "table.loadingMore": "Loading Workflows",
        "table.name": "Name",
        "table.showingLoaded": `Showing ${values?.count ?? 0} workflows`,
        "table.status": "Status",
        "table.trigger": "Trigger",
        "table.visualBuilder": "Visual Builder",
        searchPlaceholder: "Search workflows",
        title: "Workflows",
      };
      return labels[key] ?? key;
    };
    return t;
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

const workflows = [
  { _id: "workflow_1", _creationTime: 1, name: "Lead Router", description: "Route leads", triggerType: "manual", isActive: true },
  { _id: "workflow_2", _creationTime: 1, name: "Daily Digest", description: "Summaries", triggerType: "schedule", isActive: false },
];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("WorkflowsPage", () => {
  const createWorkflow = vi.fn();
  const deleteWorkflow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedQuery).mockImplementation((_queryFn: unknown, args: unknown) => {
      const searchTerm = typeof args === "object" && args && "searchTerm" in args ? String(args.searchTerm || "") : "";

      return {
        results: searchTerm ? workflows.filter((workflow) => workflow.name.toLowerCase().includes(searchTerm.toLowerCase())) : workflows,
        status: "Exhausted",
        loadMore: vi.fn(),
      } as unknown as ReturnType<typeof usePaginatedQuery>;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("createWorkflow")) return createWorkflow as unknown as ReturnType<typeof useMutation>;
      return deleteWorkflow as unknown as ReturnType<typeof useMutation>;
    });
    createWorkflow.mockResolvedValue("workflow_new");
    deleteWorkflow.mockResolvedValue(undefined);
  });

  it("renders, filters, and navigates workflow rows", () => {
    render(<WorkflowsPage />);

    expect(screen.getByText("Lead Router")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search workflows"), { target: { value: "digest" } });

    expect(screen.queryByText("Lead Router")).not.toBeInTheDocument();
    expect(screen.getByText("Daily Digest")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Daily Digest"));
    expect(pushMock).toHaveBeenCalledWith("/admin/workflows/workflow_2");
  });

  it("creates and deletes workflows through page actions", async () => {
    render(<WorkflowsPage />);

    fireEvent.click(screen.getByRole("button", { name: /New Workflow/i }));
    fireEvent.change(screen.getByPlaceholderText("Workflow name"), { target: { value: "New Flow" } });
    fireEvent.change(screen.getByPlaceholderText("Describe workflow"), { target: { value: "A routed workflow" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Workflow" }));

    await waitFor(() => {
      expect(createWorkflow).toHaveBeenCalledWith({ name: "New Flow", description: "A routed workflow" });
      expect(pushMock).toHaveBeenCalledWith("/admin/workflows/workflow_new");
    });

    fireEvent.click(screen.getAllByTitle("Delete")[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1) as HTMLButtonElement);

    await waitFor(() => {
      expect(deleteWorkflow).toHaveBeenCalledWith({ id: "workflow_1" });
    });
  });
});
