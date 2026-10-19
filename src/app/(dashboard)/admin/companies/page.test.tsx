import React from "react";
import { render as renderBare, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompaniesPage from "./page";

import { ToastProvider } from "@/src/context/ToastContext";

// The screen reports failures through the house action runner, which reads
// the toast context the root layout always supplies.
const render = (ui: Parameters<typeof renderBare>[0]) => renderBare(ui, { wrapper: ToastProvider });

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
};

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en-GB",
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        actions: "Actions",
        cancel: "Cancel",
        companies: "companies",
        deleteAndWipe: "Delete Company & Wipe Data",
        deleteTenant: "Delete Tenant",
        deleteTitle: "Delete Company",
        editTitle: "Edit Company",
        emptyState: "No companies",
        newCompany: "New Company",
        of: "of",
        collection: "Collection",
        collectionOff: "Off",
        collectionOn: "On",
        lastCollection: "Last collection",
        neverCollected: "Never",
        nextCollection: "Next collection",
        notScheduled: "Not scheduled",
        "status.COLLECTING": "Waiting for answers",
        "status.DONE": "Done",
        searchPlaceholder: "Search companies",
        showing: "Showing",
        showingLoaded: `Showing ${values?.count ?? 0} companies`,
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

const DAILY = JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "01:00", timezone: "Europe/Madrid" });

const companies = [
  {
    _id: "company_1", _creationTime: 1, name: "Acme", createdAt: Date.UTC(2026, 5, 1), userCount: 3,
    collection: {
      isActive: true, intervalStr: DAILY,
      last: { startedAt: Date.UTC(2026, 8, 23, 12, 58), status: "DONE" },
      nextAt: Date.UTC(2026, 8, 26, 2, 0), nextWhy: null,
    },
  },
  {
    _id: "company_2", _creationTime: 1, name: "Beta", createdAt: Date.UTC(2026, 5, 2), userCount: 1,
    collection: { isActive: false, intervalStr: null, last: null, nextAt: null, nextWhy: "OFF" },
  },
];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("CompaniesPage", () => {
  const deleteCompany = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useQuery as unknown as HookMock).mockImplementation(() => undefined);
    vi.mocked(usePaginatedQuery).mockImplementation(() => ({
      results: companies,
      status: "Exhausted",
      loadMore: vi.fn(),
    }) as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      if (getConvexPath(mutationFn).includes("deleteCompany")) return deleteCompany as unknown as ReturnType<typeof useMutation>;
      return vi.fn() as unknown as ReturnType<typeof useMutation>;
    });
    deleteCompany.mockResolvedValue(undefined);
  });

  it("renders loading, populated, search, and row navigation states", () => {
    vi.mocked(usePaginatedQuery).mockReturnValueOnce({
      results: [],
      status: "LoadingFirstPage",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    const { container, rerender } = render(<CompaniesPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    vi.mocked(usePaginatedQuery).mockImplementation((_queryFn: unknown, args: unknown) => {
      const searchTerm = typeof args === "object" && args && "searchTerm" in args ? String(args.searchTerm || "") : "";
      return {
        results: searchTerm ? companies.filter((company) => company.name.toLowerCase().includes(searchTerm.toLowerCase())) : companies,
        status: "Exhausted",
        loadMore: vi.fn(),
      } as unknown as ReturnType<typeof usePaginatedQuery>;
    });

    rerender(<CompaniesPage />);
    expect(screen.getByText("Acme")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search companies"), { target: { value: "beta" } });

    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Beta"));
    expect(pushMock).toHaveBeenCalledWith("/admin/companies/company_2");
  });

  it("shows each company's collection: its switch and schedule, its last collection and its next", () => {
    vi.mocked(usePaginatedQuery).mockImplementation(() => ({
      results: [
        ...companies,
        {
          _id: "company_3", _creationTime: 1, name: "Gamma", createdAt: Date.UTC(2026, 5, 3), userCount: 0,
          // Switched on, but the Planner or the Collector has no schedule to send it.
          collection: {
            isActive: true, intervalStr: DAILY,
            last: { startedAt: Date.UTC(2026, 8, 25, 12, 28), status: "COLLECTING" },
            nextAt: null, nextWhy: "NOT_SCHEDULED",
          },
        },
      ],
      status: "Exhausted",
      loadMore: vi.fn(),
    }) as unknown as ReturnType<typeof usePaginatedQuery>);
    render(<CompaniesPage />);

    for (const header of ["Collection", "Last collection", "Next collection"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    // The date a company was added is no longer shown.
    expect(screen.queryByRole("columnheader", { name: "Provisioned" })).not.toBeInTheDocument();

    const acme = screen.getByText("Acme").closest("tr")!;
    expect(acme).toHaveTextContent("On");
    expect(acme).toHaveTextContent("scheduleSummary.daily");
    expect(acme).toHaveTextContent("Done");

    const beta = screen.getByText("Beta").closest("tr")!;
    expect(beta).toHaveTextContent("Off");
    expect(beta).toHaveTextContent("Never");
    expect(beta).not.toHaveTextContent("scheduleSummary");

    const gamma = screen.getByText("Gamma").closest("tr")!;
    expect(gamma).toHaveTextContent("Waiting for answers");
    expect(gamma).toHaveTextContent("Not scheduled");
  });


  it("Add Company opens its own page, never a pop-up (add-company-page-plan.md, AC1)", () => {
    render(<CompaniesPage />);

    fireEvent.click(screen.getByRole("button", { name: /New Company/i }));

    expect(pushMock).toHaveBeenCalledWith("/admin/companies/new");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /name/i })).not.toBeInTheDocument();
  });

  it("the pencil opens the company's Overview tab, which edits its name and plan (AC5)", () => {
    render(<CompaniesPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit Company" })[0]);

    expect(pushMock).toHaveBeenCalledWith("/admin/companies/company_1/overview");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes a company only after a yes", async () => {
    render(<CompaniesPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete Company & Wipe Data" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Tenant" }));

    await waitFor(() => {
      expect(deleteCompany).toHaveBeenCalledWith({ id: "company_1" });
    });
  });
});
