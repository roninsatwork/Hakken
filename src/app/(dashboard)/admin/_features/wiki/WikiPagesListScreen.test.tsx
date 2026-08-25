import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { WikiPagesListScreen } from "./WikiPagesListScreen";

// The screen reads the configured platform name, so copy is branded per
// deployment rather than carrying a hardcoded product name.
vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));


/**
 * Pins the wiki pages list — the busiest table in the product — before it moves
 * onto the shared list part. Rendered in its platform shape.
 */

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(() => undefined),
  useMutation: vi.fn(() => vi.fn()),
  useAction: vi.fn(() => vi.fn()),
  useConvex: vi.fn(() => ({ query: vi.fn(), mutation: vi.fn(), action: vi.fn() })),
}));

vi.mock("next-intl", () => ({
  // renderWithProviders wraps every screen in the provider, so the mocked
  // module has to export it too — as a pass-through.
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

// The quick switcher and the workspace nav this screen carries both reach for
// the router on render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/ai/pages",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const pages = [
  {
    pageId: "page_returns",
    title: "Returns and refunds",
    preview: "How long a customer has, and what they need to bring.",
    kind: "ANSWER",
    sourceCount: 3,
    usageCount: 41,
    pinnedCount: 1,
    lastRewriteSource: "BRAIN",
    createdAt: Date.UTC(2026, 6, 2),
    updatedAt: Date.UTC(2026, 7, 14),
  },
  {
    pageId: "page_opening",
    title: "Opening hours",
    preview: "Showroom and phone lines, including bank holidays.",
    kind: "ANSWER",
    sourceCount: 1,
    usageCount: 88,
    pinnedCount: 0,
    lastRewriteSource: "PERSON",
    createdAt: Date.UTC(2026, 6, 4),
    updatedAt: Date.UTC(2026, 7, 15),
  },
];

describe("WikiPagesListScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<WikiPagesListScreen basePath="/admin/ai/pages" />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue({
          results: rows ?? [],
          status: rows === undefined ? "LoadingFirstPage" : "Exhausted",
          isLoading: rows === undefined,
          loadMore: vi.fn(),
        } as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: pages,
      sampleRowText: "Returns and refunds",
      emptyText: "aiPages.globalEmptyState",
      searchPlaceholder: "aiPages.searchPlaceholder",
    });
  });

  it("keeps file upload working when its helpers load on demand", async () => {
    const generateUploadUrl = vi.fn().mockResolvedValue("https://upload.test/put");
    const saveDocument = vi.fn().mockResolvedValue("document_1");
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "knowledge:generateUploadUrl") return generateUploadUrl as never;
      if (functionName === "knowledge:saveDocument") return saveDocument as never;
      return vi.fn() as never;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ storageId: "storage_1" }) }),
    );

    render(<WikiPagesListScreen basePath="/admin/ai/pages" />);
    fireEvent.click(screen.getByRole("button", { name: "aiPages.import.tabs.file" }));
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    await act(async () => {
      fireEvent.change(fileInput!, {
        target: { files: [new File(["# Returns"], "returns.md", { type: "text/markdown" })] },
      });
    });

    await waitFor(() => expect(generateUploadUrl).toHaveBeenCalledOnce());
    expect(saveDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        storageId: "storage_1",
        title: "returns.md",
        format: "text/markdown",
      }),
    );
  });
});
