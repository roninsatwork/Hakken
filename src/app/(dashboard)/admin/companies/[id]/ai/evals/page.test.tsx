import React from "react";
import { screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderWithProviders as renderBase } from "@/src/test/renderWithProviders";
import messages from "../../../../../../../../messages/en.json";

// The evals screen resolves its copy through the catalogue, so the page
// renders inside the same intl provider the root layout supplies.
function renderWithProviders(ui: React.ReactElement) {
  return renderBase(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}
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
  targetSurface: "COMPANY_CHAT",
  updatedAt: 1_770_000_000_000,
  // Rolled up onto the case, so the list needs no run query at all.
  lastRunStatus: "FAILED",
  lastRunAt: 1_770_000_000_000,
};

function mockQueries(overrides: {
  summary?: Record<string, number>;
  estimate?: Record<string, unknown>;
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

    expect(screen.getByRole("heading", { level: 1, name: "Evals" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3 evals passing. 1 failing, 1 not tested yet.")).toBeInTheDocument();
    // The five counters the page used to lead with, all reading 0 on a new company.
    expect(screen.queryByText("Pass rate")).not.toBeInTheDocument();
    expect(screen.queryByText("Blockers")).not.toBeInTheDocument();
  });

  it("says no evals yet rather than showing a zero", () => {
    mockQueries({ summary: { totalCases: 0, passedRuns: 0, failedRuns: 0, needsReviewRuns: 0, notRunCases: 0 } });
    (usePaginatedQuery as unknown as HookMock).mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    });

    renderWithProviders(<CompanyAiEvalsPage />);

    // One empty state, with the way forward in it. The headline, the table's empty row
    // and the pager footer all used to say "nothing here" at once.
    expect(screen.getByText("No evals yet")).toBeInTheDocument();
    expect(screen.queryByText("No entries found")).not.toBeInTheDocument();
    expect(screen.getByText(/catches your AI saying something wrong before a customer sees it/i)).toBeInTheDocument();
    // Nothing to run, so the coloured button is the one that gets you started —
    // and "add one" alone leaves the reader inventing an eval from nothing.
    expect(screen.queryByRole("button", { name: /Run evals/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add 3 starter evals/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Write my own/ })).toBeInTheDocument();
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

    expect(screen.getByRole("columnheader", { name: "Eval" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Must pass" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Last run" })).toBeInTheDocument();

    const nameLink = screen.getByRole("link", { name: "Does not invent pricing" });
    expect(nameLink).toHaveAttribute("href", expect.stringContaining("/ai/evals/case_1"));

    // Plain words for the result, and must-pass as a yes rather than a severity.
    // Scoped to the row: the filter bar above it offers the same words as
    // buttons, which is the point of a filter.
    const row = nameLink.closest("tr") as HTMLElement;
    expect(within(row).getByText("Failing")).toBeInTheDocument();
    expect(within(row).getByText("Yes")).toBeInTheDocument();
  });

  it("names how many evals the batch will run, and what running does", () => {
    renderWithProviders(<CompanyAiEvalsPage />);

    expect(screen.queryByRole("button", { name: "Run all" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run evals/ })).toBeInTheDocument();
    expect(screen.getByText(/asks this company's AI the question, then has a second AI mark the answer/i)).toBeInTheDocument();
  });

  // A button says what it does. "Everything passing" was a status wearing a
  // control, and it was disabled — so the one place that told you the state was the
  // one place you could not read.
  it("keeps the batch button labelled as an action, never as a status", () => {
    renderWithProviders(<CompanyAiEvalsPage />);

    expect(screen.getByRole("button", { name: /Run evals/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Everything passing/ })).not.toBeInTheDocument();
  });
});
