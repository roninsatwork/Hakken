import React from "react";
import { render, screen, within } from "@testing-library/react";
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
          passedRuns: 1,
          failedRuns: 1,
          passRate: 0.5,
          failedOrNotRunCases: 1,
        };
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
    render(<CompanyAiEvalsPage />);

    const title = screen.getByRole("heading", { level: 1, name: "Company Evals" });
    const header = title.closest("header");
    const sectionSelector = screen.getByRole("button", { name: "AI section: Evals" });

    expect(header).not.toBeNull();
    expect(header).toContainElement(sectionSelector);
    expect(title.compareDocumentPosition(sectionSelector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(header as HTMLElement).queryByRole("button", { name: "Run all" })).not.toBeInTheDocument();
    expect(within(header as HTMLElement).queryByRole("button", { name: "Run failed/not run" })).not.toBeInTheDocument();
    expect(within(header as HTMLElement).queryByRole("link", { name: "New eval" })).not.toBeInTheDocument();

    const activeCasesHeading = screen.getByRole("heading", { level: 2, name: "Active Eval Cases" });
    const activeCasesSection = activeCasesHeading.closest("section");

    expect(activeCasesSection).not.toBeNull();
    expect(within(activeCasesSection as HTMLElement).getByRole("button", { name: "Run failed/not run" })).toBeInTheDocument();
    expect(within(activeCasesSection as HTMLElement).getByRole("button", { name: "Run all" })).toBeInTheDocument();
    expect(within(activeCasesSection as HTMLElement).getByRole("link", { name: "New eval" })).toBeInTheDocument();
    expect(activeCasesHeading.compareDocumentPosition(screen.getByRole("button", { name: "Run all" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
