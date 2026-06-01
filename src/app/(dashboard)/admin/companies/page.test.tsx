import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompaniesPage from "./page";

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
};

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        actions: "Actions",
        cancel: "Cancel",
        companies: "companies",
        createSubtitle: "Create a tenant",
        createTitle: "Create Company",
        deleteTenant: "Delete Tenant",
        deleteTitle: "Delete Company",
        editSubtitle: "Edit tenant",
        editTitle: "Edit Company",
        emptyState: "No companies",
        nameLabel: "Company Name",
        namePlaceholder: "Enter company name",
        newCompany: "New Company",
        of: "of",
        promptLabel: "System Prompt",
        promptOptional: "Optional",
        promptPlaceholder: "Prompt",
        provisionTenant: "Provision Tenant",
        provisionedDate: "Provisioned",
        searchPlaceholder: "Search companies",
        showing: "Showing",
        subtitle: "Tenant operations",
        tenantName: "Tenant",
        title: "Companies",
        to: "to",
        users: `${values?.count ?? 0} users`,
        warningCascade: "Cascade",
        warningDesc: "This removes data.",
      };
      return labels[key] ?? key;
    };
    t.rich = (key: string, values?: { name?: () => React.ReactNode }) => (key === "deleteConfirm" ? <>Delete {values?.name?.()}</> : key);
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

const companies = [
  { _id: "company_1", _creationTime: 1, name: "Acme", createdAt: Date.UTC(2026, 5, 1), userCount: 3 },
  { _id: "company_2", _creationTime: 1, name: "Beta", createdAt: Date.UTC(2026, 5, 2), userCount: 1 },
];
const activePlans = [{ _id: "plan_1", name: "Growth", messageLimit: 1000, priceGBP: 49, isActive: true }];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("CompaniesPage", () => {
  const createCompany = vi.fn();
  const updateCompany = vi.fn();
  const deleteCompany = vi.fn();
  const assignPlanToCompany = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("getActivePlans")) return activePlans;
      return companies;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("createCompany")) return createCompany as unknown as ReturnType<typeof useMutation>;
      if (path.includes("updateCompany")) return updateCompany as unknown as ReturnType<typeof useMutation>;
      if (path.includes("deleteCompany")) return deleteCompany as unknown as ReturnType<typeof useMutation>;
      return assignPlanToCompany as unknown as ReturnType<typeof useMutation>;
    });
    createCompany.mockResolvedValue("company_new");
    updateCompany.mockResolvedValue(undefined);
    deleteCompany.mockResolvedValue(undefined);
    assignPlanToCompany.mockResolvedValue(undefined);
  });

  it("renders loading, populated, search, and row navigation states", () => {
    vi.mocked(useQuery).mockReturnValueOnce(undefined).mockReturnValueOnce(activePlans);
    const { container, rerender } = render(<CompaniesPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    rerender(<CompaniesPage />);
    expect(screen.getByText("Acme")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search companies"), { target: { value: "beta" } });

    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Beta"));
    expect(pushMock).toHaveBeenCalledWith("/admin/companies/company_2");
  });

  it("creates, edits, and deletes companies through page actions", async () => {
    render(<CompaniesPage />);

    fireEvent.click(screen.getByRole("button", { name: /New Company/i }));
    fireEvent.change(screen.getByPlaceholderText("Enter company name"), { target: { value: "Delta" } });
    fireEvent.change(screen.getByPlaceholderText("Prompt"), { target: { value: "Be useful" } });
    fireEvent.click(screen.getByRole("button", { name: "Provision Tenant" }));

    await waitFor(() => {
      expect(createCompany).toHaveBeenCalledWith({ name: "Delta", systemPrompt: "Be useful" });
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Edit Company" })[0]);
    fireEvent.change(screen.getByDisplayValue("Acme"), { target: { value: "Acme Updated" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Company" }).at(-1) as HTMLButtonElement);

    await waitFor(() => {
      expect(updateCompany).toHaveBeenCalledWith({ id: "company_1", name: "Acme Updated", systemPrompt: "" });
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Delete Company & Wipe Data" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Tenant" }));

    await waitFor(() => {
      expect(deleteCompany).toHaveBeenCalledWith({ id: "company_1" });
    });
  });
});
