import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import React from "react";
import { beforeEach, describe, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { WikiDiaryScreen } from "./WikiDiaryScreen";

/**
 * Pins the wiki diary, before it moves onto the shared list part.
 *
 * Rendered in its global shape — no company id — because that is the branch
 * that reaches the second of the screen's two paged queries.
 */

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
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

const entries = [
  {
    action: "WIKI_PAGE_CREATED",
    pageId: "page_returns",
    pageTitle: "Returns and refunds",
    detail: undefined,
    byPerson: false,
    at: Date.UTC(2026, 7, 14, 9, 30),
  },
  {
    action: "WIKI_LINKS_REPAIRED",
    pageId: undefined,
    pageTitle: undefined,
    detail: "Four links repointed after a rename.",
    byPerson: true,
    at: Date.UTC(2026, 7, 15, 16, 12),
  },
];

describe("WikiDiaryScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<WikiDiaryScreen pageBasePath="/admin/ai/pages" />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue({
          results: rows ?? [],
          status: rows === undefined ? "LoadingFirstPage" : "Exhausted",
          isLoading: rows === undefined,
          loadMore: vi.fn(),
        } as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: entries,
      sampleRowText: "Returns and refunds",
      emptyText: "aiDiary.empty",
      searchPlaceholder: "aiDiary.searchPlaceholder",
    });
  });
});
