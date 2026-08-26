import React from "react";
import { render as renderBare, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import SubscriptionPlansPage from "./page";

import { ToastProvider } from "@/src/context/ToastContext";

// The screen reports failures through the house action runner, which reads
// the toast context the root layout always supplies.
const render = (ui: Parameters<typeof renderBare>[0]) => renderBare(ui, { wrapper: ToastProvider });

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        activeLabel: "Active",
        cancel: "Cancel",
        createSubtitle: "Create plan",
        createTitle: "Create Plan",
        deleteTitle: "Delete Plan",
        "table.deletePlan": "Delete plan",
        "table.editPlan": "Edit plan",
        deleteWarning: "Deleting a plan can affect tenants.",
        descLabel: "Description",
        descPlaceholder: "Describe the plan",
        editSubtitle: "Edit plan",
        editTitle: "Edit Plan",
        emptyState: "No plans",
        "errors.deleteFailed": "Delete failed",
        "errors.saveFailed": "Save failed",
        "infoDesc": "Plan limits are enforced by usage checks.",
        "infoTitle": "Billing plans",
        loadMore: "Load more plans",
        loadingMore: "Loading plans...",
        limitLabel: "Message Limit",
        limitPlaceholder: "1000",
        nameLabel: "Plan Name",
        namePlaceholder: "Enter plan name",
        newPlan: "New Plan",
        priceLabel: "Price",
        pricePlaceholder: "49",
        "pagination.entries": "entries",
        "pagination.of": "of",
        "pagination.showing": "Showing",
        "pagination.to": "to",
        savePlan: "Save Plan",
        searchPlaceholder: "Search plans",
        showingLoaded: `Showing ${values?.count ?? 0} plans`,
        subtitle: "Manage subscriptions",
        "table.actions": "Actions",
        "table.limit": "Limit",
        "table.name": "Name",
        "table.price": "Price",
        "table.status": "Status",
        title: "Plans",
        unlimited: "Unlimited",
      };
      return labels[key] ?? key;
    };
    // Mirrors next-intl: a function argument is a TAG renderer, called with the
    // text between the tags. A plain value is substituted. The previous mock
    // called `name` as a function whatever the message said, which is how a
    // dialog rendering "delete the plan ?" with the name missing passed here.
    t.rich = (key: string, values?: Record<string, unknown>) =>
      key === "deleteConfirm" ? (
        <>
          Delete{" "}
          {typeof values?.highlight === "function"
            ? (values.highlight as (chunks: React.ReactNode) => React.ReactNode)(
                String(values?.name ?? ""),
              )
            : String(values?.name ?? "")}
        </>
      ) : (
        key
      );
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

const plans = [
  { _id: "plan_1", _creationTime: 1, name: "Growth", description: "Growing teams", messageLimit: 1000, priceGBP: 49, isActive: true },
  { _id: "plan_2", _creationTime: 1, name: "Enterprise", description: "Unlimited scale", messageLimit: -1, priceGBP: 199, isActive: false },
];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("SubscriptionPlansPage", () => {
  const createPlan = vi.fn();
  const updatePlan = vi.fn();
  const deletePlan = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedQuery).mockImplementation((_queryFn: unknown, args: unknown) => {
      const searchTerm = typeof args === "object" && args && "searchTerm" in args ? String(args.searchTerm || "") : "";

      return {
        results: searchTerm ? plans.filter((plan) => plan.name.toLowerCase().includes(searchTerm.toLowerCase())) : plans,
        status: "Exhausted",
        loadMore: vi.fn(),
      } as unknown as ReturnType<typeof usePaginatedQuery>;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("createPlan")) return createPlan as unknown as ReturnType<typeof useMutation>;
      if (path.includes("updatePlan")) return updatePlan as unknown as ReturnType<typeof useMutation>;
      return deletePlan as unknown as ReturnType<typeof useMutation>;
    });
    createPlan.mockResolvedValue(undefined);
    updatePlan.mockResolvedValue(undefined);
    deletePlan.mockResolvedValue(undefined);
  });

  it("renders loading, populated, search, and empty states", () => {
    vi.mocked(usePaginatedQuery).mockReturnValueOnce({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    const { container, rerender } = render(<SubscriptionPlansPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    rerender(<SubscriptionPlansPage />);
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search plans"), { target: { value: "enterprise" } });

    expect(screen.queryByText("Growth")).not.toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search plans"), { target: { value: "missing" } });
    expect(screen.getAllByText("No plans").length).toBeGreaterThan(0);
  });

  it("creates, edits, and deletes plans through modal actions", async () => {
    render(<SubscriptionPlansPage />);

    fireEvent.click(screen.getByRole("button", { name: /New Plan/i }));
    fireEvent.change(await screen.findByPlaceholderText("Enter plan name"), { target: { value: "Starter" } });
    fireEvent.change(screen.getByPlaceholderText("Describe the plan"), { target: { value: "Small teams" } });
    fireEvent.change(screen.getByPlaceholderText("1000"), { target: { value: "250" } });
    fireEvent.change(screen.getByPlaceholderText("49"), { target: { value: "19" } });
    fireEvent.click(screen.getAllByRole("button", { name: "New Plan" }).at(-1) as HTMLButtonElement);

    await waitFor(() => {
      expect(createPlan).toHaveBeenCalledWith({
        name: "Starter",
        description: "Small teams",
        messageLimit: 250,
        priceGBP: 19,
        isActive: true,
        grantedModules: [],
      });
    });

    // Both row buttons carry their own name now. This step used to reach the
    // edit button sideways — find the one titled "Delete Plan", then take the
    // first button in its parent — because neither had an accessible name of
    // its own.
    fireEvent.click(screen.getAllByRole("button", { name: "Edit plan" })[0]);
    fireEvent.change(screen.getByDisplayValue("Growth"), { target: { value: "Growth Plus" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Plan" }));

    await waitFor(() => {
      expect(updatePlan).toHaveBeenCalledWith(expect.objectContaining({ id: "plan_1", name: "Growth Plus" }));
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Delete plan" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "actions.delete" }));

    await waitFor(() => {
      expect(deletePlan).toHaveBeenCalledWith({ id: "plan_1" });
    });
  });

  it("loads the delete confirmation when it is the first dialog used", async () => {
    render(<SubscriptionPlansPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete plan" })[0]);

    expect(await screen.findByRole("button", { name: "actions.delete" })).toBeInTheDocument();
    expect(screen.getAllByText("Growth")).toHaveLength(2);
  });
});
