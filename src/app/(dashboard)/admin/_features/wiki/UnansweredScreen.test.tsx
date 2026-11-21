import { renderWithProviders as render, screen, fireEvent } from "@/src/test/renderWithProviders";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { UnansweredScreen } from "./UnansweredScreen";

/**
 * Pins the unanswered-questions list, before it moves onto the shared list part.
 *
 * Rendered in its platform shape — no company id — because that branch shows
 * the extra "where" column, so the header/cell counts are checked at their
 * widest.
 */

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
  useMutation: vi.fn(() => vi.fn()),
  // The counts over the platform's list (S7): two open gaps, one of them a company's.
  useQuery: vi.fn(() => ({ all: 2, platform: 1, companies: 1, capped: false })),
}));

vi.mock("next-intl", () => ({
  // renderWithProviders wraps every screen in the provider, so the mocked
  // module has to export it too — as a pass-through.
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const questions = [
  {
    unansweredId: "unanswered_saturday",
    question: "Are you open on Saturday?",
    companyId: undefined,
    companyName: undefined,
    companyCount: 3,
    askCount: 12,
    lastAskedAt: Date.UTC(2026, 7, 15, 10, 0),
  },
  {
    unansweredId: "unanswered_parking",
    question: "Is there parking at the showroom?",
    companyId: "company123",
    companyName: "Comax",
    companyCount: 0,
    askCount: 4,
    lastAskedAt: Date.UTC(2026, 7, 14, 15, 30),
  },
];

describe("UnansweredScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<UnansweredScreen />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue({
          results: rows ?? [],
          status: rows === undefined ? "LoadingFirstPage" : "Exhausted",
          isLoading: rows === undefined,
          loadMore: vi.fn(),
        } as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: questions,
      sampleRowText: /Are you open on Saturday\?/,
      emptyText: "aiUnanswered.emptyState",
      searchPlaceholder: "aiUnanswered.searchPlaceholder",
    });
  });

  // wiki-sonae-catch-up-plan-2026-11-21.md, S7: All, Platform and Companies are counts you can press.
  it("shows each choice's count and asks the list for the one pressed", () => {
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: questions, status: "Exhausted", isLoading: false, loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    render(<UnansweredScreen />);
    const group = screen.getByRole("group", { name: "aiUnanswered.filter.label" });
    expect(group).toHaveTextContent("aiUnanswered.filter.all 2");
    expect(group).toHaveTextContent("aiUnanswered.filter.companies 1");
    fireEvent.click(screen.getByRole("button", { name: /aiUnanswered\.filter\.companies/ }));
    expect(screen.getByRole("button", { name: /aiUnanswered\.filter\.companies/ })).toHaveAttribute("aria-pressed", "true");
    // The platform list's read (the company list's is skipped here) now asks for companies' gaps.
    expect(vi.mocked(usePaginatedQuery).mock.calls.some((call) => (call[1] as { scope?: string } | string)?.toString() !== "skip" && (call[1] as { scope?: string }).scope === "COMPANIES")).toBe(true);
  });
});
