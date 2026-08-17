import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import React from "react";
import { beforeEach, describe, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { CompanyCallsScreen } from "./CompanyCallsScreen";

/** Pins the company calls list, on the same terms as the mailbox beside it. */

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
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

const calls = [
  {
    _id: "call_doors",
    fromMasked: "+44 7700 ••• 412",
    summary: "Asked whether the showroom is open on Saturday.",
    status: "COMPLETED",
    startedAt: Date.UTC(2026, 7, 14, 9, 30),
    turnCount: 6,
  },
  {
    _id: "call_quote",
    fromMasked: "+44 7700 ••• 998",
    summary: "Wanted a quote for a replacement panel.",
    status: "IN_PROGRESS",
    startedAt: Date.UTC(2026, 7, 15, 14, 2),
    turnCount: 3,
  },
];

describe("CompanyCallsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<CompanyCallsScreen companyId={"company123" as Id<"companies">} />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue({
          results: rows ?? [],
          status: rows === undefined ? "LoadingFirstPage" : "Exhausted",
          isLoading: rows === undefined,
          loadMore: vi.fn(),
        } as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: calls,
      sampleRowText: "Asked whether the showroom is open on Saturday.",
      emptyText: "aiCalls.emptyState",
      searchPlaceholder: "aiCalls.searchPlaceholder",
    });
  });
});
