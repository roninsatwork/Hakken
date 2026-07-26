import React from "react";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompanyAiEvalsPage from "./page";

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
  mockReturnValue: (value: unknown) => void;
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company123" }),
  usePathname: () => "/admin/companies/company123/ai/evals",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("CompanyAiEvalsPage layout guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const functionName = getFunctionName(queryFn as never);
      if (functionName === "companyEvals:getSummary") {
        return {
          totalCases: 2,
          blockerCases: 0,
          latestRuns: 2,
          passedRuns: 1,
          failedRuns: 1,
          passRate: 0.5,
          failedOrNotRunCases: 1,
        };
      }
      if (functionName === "companyEvals:getBatchEstimate") {
        return { selectedCount: 2, providerCallCount: 4, isCapped: false, cap: 100 };
      }
      if (functionName === "companyEvals:getLatestRunsForCompany") return [];
      if (functionName === "companyEvals:getRunsForCase") return [];
      return undefined;
    });

    (usePaginatedQuery as unknown as HookMock).mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    (useMutation as unknown as HookMock).mockReturnValue(vi.fn().mockResolvedValue({
      selected: 0,
      passed: 0,
      failed: 0,
      needsReview: 0,
    }));
  });

  it("keeps page navigation in the header and eval actions with the active cases table", () => {
    renderWithProviders(<CompanyAiEvalsPage />);

    const title = screen.getByRole("heading", { level: 1, name: "Company Evals" });
    const header = title.closest("header");

    expect(header).not.toBeNull();
    expect(screen.queryByRole("button", { name: /AI section/i })).not.toBeInTheDocument();
    expect(within(header as HTMLElement).queryByRole("link", { name: "New eval" })).not.toBeInTheDocument();

    const activeCasesHeading = screen.getByRole("heading", { level: 2, name: "Active Eval Cases" });
    const activeCasesSection = activeCasesHeading.closest("section");

    expect(activeCasesSection).not.toBeNull();
    expect(within(activeCasesSection as HTMLElement).getByRole("link", { name: "New eval" })).toBeInTheDocument();
  });

  // Running is real provider work now: the assistant answers, then a different
  // model marks it. The batch button says how many it will run rather than
  // offering an unbounded "Run all", and the old fabricated batch is gone.
  it("names how many evals the batch will run, and says what running does", () => {
    renderWithProviders(<CompanyAiEvalsPage />);

    expect(screen.queryByRole("button", { name: "Run all" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run failed/not run" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run 2 unproven/ })).toBeInTheDocument();
    expect(screen.getByText(/asks your company AI the question, then has a second model mark the answer/i)).toBeInTheDocument();
  });

  // Nothing to run must not read as an invitation to run nothing.
  it("disables the batch button when every eval already passes", () => {
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const functionName = getFunctionName(queryFn as never);
      if (functionName === "companyEvals:getSummary") {
        return { totalCases: 2, blockerCases: 2, latestRuns: 2, passedRuns: 2, failedRuns: 0, passRate: 1, failedOrNotRunCases: 0 };
      }
      if (functionName === "companyEvals:getBatchEstimate") {
        return { selectedCount: 0, providerCallCount: 0, isCapped: false, cap: 100 };
      }
      if (functionName === "companyEvals:getLatestRunsForCompany") return [];
      if (functionName === "companyEvals:getRunsForCase") return [];
      return undefined;
    });

    renderWithProviders(<CompanyAiEvalsPage />);

    expect(screen.getByRole("button", { name: /All evals passing/ })).toBeDisabled();
  });

  // A pass rate of 0% and a pass rate of "nothing has run" are the same number
  // and opposite facts. An empty account used to read as total failure.
  it("shows no pass rate until something has run", () => {
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const functionName = getFunctionName(queryFn as never);
      if (functionName === "companyEvals:getSummary") {
        return {
          totalCases: 2,
          blockerCases: 0,
          latestRuns: 0,
          passedRuns: 0,
          failedRuns: 0,
          passRate: 0,
          failedOrNotRunCases: 2,
        };
      }
      if (functionName === "companyEvals:getBatchEstimate") {
        return { selectedCount: 2, providerCallCount: 4, isCapped: false, cap: 100 };
      }
      if (functionName === "companyEvals:getLatestRunsForCompany") return [];
      if (functionName === "companyEvals:getRunsForCase") return [];
      return undefined;
    });

    renderWithProviders(<CompanyAiEvalsPage />);

    const passRateLabel = screen.getByText("Pass rate");
    expect(passRateLabel.parentElement?.textContent).toContain("—");
    expect(passRateLabel.parentElement?.textContent).not.toContain("0%");
  });
});
