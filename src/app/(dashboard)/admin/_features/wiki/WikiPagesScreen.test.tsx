import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { AccessLevelProvider } from "@/src/ui/components/screens/AccessLevel";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiPagesScreen } from "./WikiPagesScreen";

/**
 * Wiki pages (wiki-sonae-catch-up-plan-2026-11-21.md, S6): whose wiki it is,
 * New goal and Download vault beside the title, no Map view button now the map
 * has its own menu line, and a lean table, filterable by kind and tag, whose
 * rows open the page. The parts that moved to their own pages are not here.
 */

const push = vi.fn();

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(() => undefined),
  useMutation: vi.fn(() => vi.fn()),
  useAction: vi.fn(() => vi.fn()),
  useConvex: vi.fn(() => ({ query: vi.fn(), mutation: vi.fn(), action: vi.fn() })),
}));

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/ai/knowledge",
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
    kind: "POLICY",
    subjectKey: "returns",
    links: [],
    rewriteCount: 2,
    sourceCount: 3,
    usageCount: 41,
    pinnedCount: 1,
    lastRewriteSource: "HUMAN:user_1",
    lastUsedAt: null,
    tags: ["returns"],
    createdAt: Date.UTC(2026, 6, 2),
    updatedAt: Date.UTC(2026, 7, 15),
  },
  {
    pageId: "page_opening",
    title: "Opening hours",
    preview: "Showroom and phone lines, including bank holidays.",
    kind: "PRODUCT",
    subjectKey: "opening",
    links: [],
    rewriteCount: 1,
    sourceCount: 0,
    usageCount: 88,
    pinnedCount: 0,
    lastRewriteSource: "TENDING",
    lastUsedAt: null,
    tags: [],
    createdAt: Date.UTC(2026, 6, 4),
    updatedAt: Date.UTC(2026, 7, 14),
  },
];

function showPages(rows: unknown[] | undefined) {
  vi.mocked(usePaginatedQuery).mockReturnValue({
    results: rows ?? [],
    status: rows === undefined ? "LoadingFirstPage" : "Exhausted",
    isLoading: rows === undefined,
    loadMore: vi.fn(),
  } as unknown as ReturnType<typeof usePaginatedQuery>);
}

const companyId = "company_1" as Id<"companies">;
const companyBase = "/admin/companies/company_1/ai/pages";

describe("WikiPagesScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation(() => undefined);
    vi.mocked(useMutation).mockImplementation(() => vi.fn() as never);
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<WikiPagesScreen basePath="/admin/ai/knowledge" />),
      withRows: showPages,
      sampleRows: pages,
      sampleRowText: "Returns and refunds",
      emptyText: "aiPages.globalEmptyState",
      searchPlaceholder: "aiPages.searchPlaceholder",
    });
  });

  it("says whose wiki it is, offers New goal and Download vault, and has no Map view button", () => {
    showPages(pages);
    render(<WikiPagesScreen basePath="/admin/ai/knowledge" />);

    expect(screen.getByRole("heading", { name: "aiPages.globalTitle" })).toBeInTheDocument();
    expect(screen.getByText("aiPages.scopeGlobal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "aiPages.goal.button" })).toHaveAttribute("href", "/admin/ai/knowledge/new-goal");
    expect(screen.getByRole("button", { name: "aiPages.export.button" })).toBeInTheDocument();
    expect(screen.queryByText("aiPages.map.open")).not.toBeInTheDocument();
    // New goal is a page now, never a pop-up with fields.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The platform's wiki has no Clear wiki.
    expect(screen.queryByRole("button", { name: "aiPages.clear.button" })).not.toBeInTheDocument();
  });

  it("leaves what moved to its own page off the list", () => {
    showPages(pages);
    render(<WikiPagesScreen basePath="/admin/ai/knowledge" />);

    for (const gone of ["aiPages.import.tabs.website", "aiPages.ask.title", "aiPages.week.title", "aiPages.reviews.hint", "aiPages.questions.hint"]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });

  it("draws one line a row, the name and five more columns, and the row opens the page", () => {
    showPages(pages);
    render(<WikiPagesScreen basePath="/admin/ai/knowledge" />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    const row = screen.getByText("Opening hours").closest("tr")!;
    expect(within(row).getByText("aiPages.kinds.PRODUCT")).toBeInTheDocument();
    expect(within(row).getByText(/aiPages\.sources\.tending · /)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Opening hours" })).toHaveAttribute("href", "/admin/ai/knowledge/page_opening");
    fireEvent.click(within(row).getByText("aiPages.kinds.PRODUCT"));
    expect(push).toHaveBeenCalledWith("/admin/ai/knowledge/page_opening");
  });

  it("orders the page in hand by most used when Used is pressed, and back again", () => {
    showPages(pages);
    render(<WikiPagesScreen basePath="/admin/ai/knowledge" />);
    const names = () => screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.includes("/page_")).map((link) => link.textContent);

    expect(names()).toEqual(["Returns and refunds", "Opening hours"]);
    fireEvent.click(screen.getByRole("button", { name: /aiPages\.columns\.used/ }));
    expect(names()).toEqual(["Opening hours", "Returns and refunds"]);
    fireEvent.click(screen.getByRole("button", { name: /aiPages\.columns\.used/ }));
    expect(names()).toEqual(["Returns and refunds", "Opening hours"]);
  });

  it("shows the Tag filter only when the wiki has tags, and asks for the tag's pages", () => {
    showPages(pages);
    const { unmount } = render(<WikiPagesScreen basePath="/admin/ai/knowledge" />);
    expect(screen.queryByRole("button", { name: /aiPages\.tagFilter\.label/ })).not.toBeInTheDocument();
    unmount();

    vi.mocked(useQuery).mockImplementation(((fn: unknown) =>
      getFunctionName(fn as never) === "wikiCheckupPages:listTagsForGlobal" ? [{ tag: "billing", count: 2 }] : undefined) as never);
    render(<WikiPagesScreen basePath="/admin/ai/knowledge" />);
    fireEvent.click(screen.getByRole("button", { name: /aiPages\.tagFilter\.label/ }));
    const option = screen.getByRole("option", { name: /billing/ });
    fireEvent.mouseDown(option);
    fireEvent.click(option);

    const lastArgs = vi.mocked(usePaginatedQuery).mock.calls.filter(([, args]) => args !== "skip").at(-1)?.[1];
    expect(lastArgs).toEqual(expect.objectContaining({ tag: "billing" }));
  });

  it("asks before deleting a page from its row", async () => {
    showPages(pages);
    const deletePage = vi.fn().mockResolvedValue(null);
    vi.mocked(useMutation).mockImplementation(((fn: unknown) =>
      getFunctionName(fn as never) === "wikiPages:deletePageForGlobal" ? deletePage : vi.fn()) as never);
    render(<WikiPagesScreen basePath="/admin/ai/knowledge" />);

    fireEvent.click(within(screen.getByText("Opening hours").closest("tr")!).getByRole("button", { name: "aiPages.delete.button" }));
    expect(deletePage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "aiPages.delete.action" }));
    await waitFor(() => expect(deletePage).toHaveBeenCalledWith({ pageId: "page_opening" }));
  });

  it("is a company's own wiki inside the company: its words, its pages and Clear wiki last", () => {
    showPages(pages);
    render(<WikiPagesScreen companyId={companyId} basePath={companyBase} />);

    expect(screen.getByRole("heading", { name: "aiPages.title" })).toBeInTheDocument();
    expect(screen.getByText("aiPages.scopeCompany")).toBeInTheDocument();
    const asked = vi.mocked(usePaginatedQuery).mock.calls.filter(([, args]) => args !== "skip").map(([fn]) => getFunctionName(fn as never));
    expect(new Set(asked)).toEqual(new Set(["wikiPages:listPagesForCompany"]));
    const clear = screen.getByRole("button", { name: "aiPages.clear.button" });
    const download = screen.getByRole("button", { name: "aiPages.export.button" });
    expect(download.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "aiPages.goal.button" })).toHaveAttribute("href", `${companyBase}/new-goal`);
  });

  it("offers no New goal, Clear wiki or Delete to someone who can only read", () => {
    showPages(pages);
    render(
      <AccessLevelProvider role="READ_ONLY">
        <WikiPagesScreen companyId={companyId} basePath={companyBase} />
      </AccessLevelProvider>,
    );

    expect(screen.queryByRole("button", { name: "aiPages.clear.button" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "aiPages.goal.button" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "aiPages.delete.button" })).not.toBeInTheDocument();
  });

  it("asks before clearing a company's wiki, then empties it however many presses the server needs", async () => {
    showPages(pages);
    const clearWiki = vi.fn().mockResolvedValueOnce({ remaining: 120 }).mockResolvedValueOnce({ remaining: 0 });
    vi.mocked(useMutation).mockImplementation(((fn: unknown) =>
      getFunctionName(fn as never) === "wikiPages:clearWikiForCompany" ? clearWiki : vi.fn()) as never);
    render(<WikiPagesScreen companyId={companyId} basePath={companyBase} />);

    fireEvent.click(screen.getByRole("button", { name: "aiPages.clear.button" }));
    expect(screen.getByText("aiPages.clear.confirm")).toBeInTheDocument();
    expect(clearWiki).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "aiPages.clear.action" }));
    await waitFor(() => expect(clearWiki).toHaveBeenCalledTimes(2));
    expect(clearWiki).toHaveBeenCalledWith({ companyId });
  });
});
