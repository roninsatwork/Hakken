import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import React from "react";
import { beforeEach, describe, vi } from "vitest";
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
}));

vi.mock("next-intl", () => ({
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
});
