import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import React from "react";
import { beforeEach, describe, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { EvalsScreen } from "./EvalsScreen";

/**
 * Pins the evals list before it moves onto the shared list part.
 *
 * Worth knowing when it does move: this screen writes its own header row and
 * header cells rather than using the kit's, which is the drift the build check
 * is being tightened to catch.
 */

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(() => undefined),
  useMutation: vi.fn(() => vi.fn()),
  useAction: vi.fn(() => vi.fn()),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/companies/company123/ai/evals",
  useSearchParams: () => new URLSearchParams(),
}));

const cases = [
  {
    _id: "eval_pricing",
    name: "Never invents a price",
    prompt: "How much is the enterprise plan?",
    severity: "BLOCKER",
    lastRunAt: Date.UTC(2026, 7, 14, 9, 0),
  },
  {
    _id: "eval_hours",
    name: "Gets the opening hours right",
    prompt: "Are you open on Saturday?",
    severity: "WARNING",
    lastRunAt: undefined,
  },
];

describe("EvalsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<EvalsScreen companyId={"company123" as Id<"companies">} />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue({
          results: rows ?? [],
          status: rows === undefined ? "LoadingFirstPage" : "Exhausted",
          isLoading: rows === undefined,
          loadMore: vi.fn(),
        } as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: cases,
      sampleRowText: "Never invents a price",
      emptyText: "No evals yet",
      searchPlaceholder: "Search evals...",
    });
  });
});
