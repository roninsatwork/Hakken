import React from "react";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";
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

const CASE_ROW = {
  _id: "case_1",
  name: "Does not invent pricing",
  prompt: "How much does the enterprise plan cost?",
  expectedBehavior: "Say pricing is not published.",
  severity: "BLOCKER",
  category: "NO_HALLUCINATION",
  targetSurface: "COMPANY_CHAT",
  updatedAt: 1_770_000_000_000,
};

function mockQueries(overrides: {
  summary?: Record<string, number>;
  estimate?: Record<string, unknown>;
  latestRuns?: unknown[];
} = {}) {
  (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
    const functionName = getFunctionName(queryFn as never);
    if (functionName === "companyEvals:getSummary") {
      return {
        totalCases: 3,
        blockerCases: 2,
        latestRuns: 2,
        passedRuns: 1,
        failedRuns: 1,
        needsReviewRuns: 0,
        notRunCases: 1,
        failedOrNotRunCases: 2,
        passRate: 0.5,
        ...overrides.summary,
      };
    }
    if (functionName === "companyEvals:getBatchEstimate") {
      return { selectedCount: 2, providerCallCount: 4, isCapped: false, cap: 100, ...overrides.estimate };
    }
    if (functionName === "companyEvals:getLatestRunsForCompany") {
      return overrides.latestRuns ?? [{ evalCaseId: "case_1", status: "FAILED", completedAt: 1_770_000_000_000 }];
    }
    if (functionName === "companyEvals:getRunsForCase") return [];
    return undefined;
  });
}

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

    mockQueries();
    (usePaginatedQuery as unknown as HookMock).mockReturnValue({
      results: [CASE_ROW],
      status: "Exhausted",
      loadMore: vi.fn(),
    });
  });

  it("leads with one sentence rather than a row of counters", () => {
    renderWithProviders(<CompanyAiEvalsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Checks" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3 checks passing. 1 failing, 1 not tested yet.")).toBeInTheDocument();
    // The five counters the page used to lead with, all reading 0 on a new company.
    expect(screen.queryByText("Pass rate")).not.toBeInTheDocument();
    expect(screen.queryByText("Blockers")).not.toBeInTheDocument();
  });

  it("says no checks yet rather than showing a zero", () => {
    mockQueries({ summary: { totalCases: 0, passedRuns: 0, failedRuns: 0, needsReviewRuns: 0, notRunCases: 0 } });
    (usePaginatedQuery as unknown as HookMock).mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    renderWithProviders(<CompanyAiEvalsPage />);

    expect(screen.getByText("No checks yet.")).toBeInTheDocument();
    expect(screen.getByText(/add one to catch your AI saying something wrong/i)).toBeInTheDocument();
  });

  // The screen is for people who do not build software. Machine constants on screen
  // were the first of the four faults raised about the admin surfaces.
  it("shows no machine constants or jargon", () => {
    renderWithProviders(<CompanyAiEvalsPage />);

    const body = document.body.textContent ?? "";
    for (const jargon of [
      "BLOCKER",
      "NO_HALLUCINATION",
      "COMPANY_CHAT",
      "NEEDS_REVIEW",
      "ADVISORY",
      "deterministic",
      "Evidence JSON",
      "eval case",
    ]) {
      expect(body).not.toContain(jargon);
    }
  });

  it("uses the standard admin table, with a row that links to its own page", () => {
    renderWithProviders(<CompanyAiEvalsPage />);

    expect(screen.getByRole("columnheader", { name: "Check" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Must pass" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Last run" })).toBeInTheDocument();

    const nameLink = screen.getByRole("link", { name: "Does not invent pricing" });
    expect(nameLink).toHaveAttribute("href", expect.stringContaining("/ai/evals/case_1"));

    // Plain words for the result, and must-pass as a yes rather than a severity.
    expect(screen.getByText("Failing")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("names how many checks the batch will run, and what running does", () => {
    renderWithProviders(<CompanyAiEvalsPage />);

    expect(screen.queryByRole("button", { name: "Run all" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run checks/ })).toBeInTheDocument();
    expect(screen.getByText(/asks your company AI the question, then has a second AI mark the answer/i)).toBeInTheDocument();
  });

  // A button says what it does. "Everything passing" was a status wearing a
  // control, and it was disabled — so the one place that told you the state was the
  // one place you could not read.
  it("keeps the batch button labelled as an action, never as a status", () => {
    renderWithProviders(<CompanyAiEvalsPage />);

    expect(screen.getByRole("button", { name: /Run checks/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Everything passing/ })).not.toBeInTheDocument();
  });
});
