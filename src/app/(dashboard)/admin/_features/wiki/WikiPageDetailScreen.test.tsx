import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiPageDetailScreen } from "./WikiPageDetailScreen";

/**
 * One wiki page in tabs (wiki-sonae-catch-up-plan-2026-11-21.md, S5): the header with Edit page, four tabs with their
 * counts, the words with pinned facts, a side column of facts, tags and related pages, History with Put back behind a
 * yes or no, and a Knowledge article's page offering none of the changes.
 */

const push = vi.fn();
let search = new URLSearchParams();

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));

vi.mock("convex/react", () => ({
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
  usePathname: () => "/admin/ai/knowledge/page_1",
  useSearchParams: () => search,
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function Prose({ content }: { content: string }) {
      return <div data-testid="prose">{content}</div>;
    },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const pageId = "page_1" as Id<"wikiPages">;

const detail = {
  pageId,
  kind: "POLICY",
  title: "Signing in and passwords",
  subjectKey: "signing-in",
  content: "Everyone signs in with their work email.",
  pinnedCorrections: [{ text: "A sign-in link lasts 15 minutes.", pinnedAt: Date.UTC(2026, 10, 2) }],
  sources: [{ kind: "DOCUMENT", ref: "doc_1", label: "Security policy.pdf", addedAt: Date.UTC(2026, 9, 1) }],
  revisions: [
    { revisionId: "rev_1", content: "Older words.", source: "HUMAN:user_1", createdAt: Date.UTC(2026, 10, 1) },
    { revisionId: "rev_2", content: "Oldest words.", source: "CHECKUP:links", createdAt: Date.UTC(2026, 9, 1) },
  ],
  tags: [{ tag: "security", byHuman: true }],
  resolvedLinks: [{ key: "PRODUCT:invites", slug: "Inviting people", pageId: "page_2", title: "Inviting people", excerpt: "" }],
  backlinks: [{ pageId: "page_3", title: "Teams", subjectKey: "teams", kind: "PRODUCT", quote: "…see [[signing-in]]…" }],
  lastVerifiedAt: Date.UTC(2026, 10, 11),
  openQuestionCount: 2,
  lastRewriteSource: "TENDING",
  updatedAt: Date.UTC(2026, 10, 12),
  createdAt: Date.UTC(2026, 9, 1),
  usageCount: 86,
  lastUsedAt: Date.UTC(2026, 10, 12),
  isKnowledgeArticle: false,
};

function showDetail(value: unknown) {
  vi.mocked(useQuery).mockImplementation(((fn: unknown) =>
    getFunctionName(fn as never) === "wikiPages:getPageDetailForGlobal" ? value : undefined) as never);
}

function useMutations(named: Record<string, ReturnType<typeof vi.fn>>) {
  vi.mocked(useMutation).mockImplementation(((fn: unknown) => named[getFunctionName(fn as never)] ?? vi.fn()) as never);
}

const renderPage = () => render(<WikiPageDetailScreen pageId={pageId} basePath="/admin/ai/knowledge" />);

describe("WikiPageDetailScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = new URLSearchParams();
    vi.mocked(useMutation).mockImplementation(() => vi.fn() as never);
  });

  it("draws the header, the four tabs with counts, and the page tab first", () => {
    showDetail(detail);
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Signing in and passwords" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "aiPages.detail.page.back" }).getAttribute("href")).toBe("/admin/ai/knowledge");
    expect(screen.getByRole("link", { name: "aiPages.detail.page.tabs.page" }).getAttribute("aria-current")).toBe("page");
    const sources = screen.getByRole("link", { name: "aiPages.detail.page.tabs.sources 1" });
    expect(sources.getAttribute("href")).toBe("/admin/ai/knowledge/page_1?tab=sources");
    expect(sources.getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "aiPages.detail.history.title 2" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "aiPages.detail.page.tabs.links 1" })).toBeTruthy();
    // The open questions are a status label that leads back to the wiki, where they're settled.
    expect(screen.getByText("aiPages.detail.health.openQuestions").closest("a")?.getAttribute("href")).toBe("/admin/ai/knowledge");
    expect(screen.getByRole("button", { name: "aiPages.detail.read.edit" })).toBeTruthy();
  });

  it("holds the words and the pinned facts, with the facts, tags and related pages beside them", () => {
    showDetail(detail);
    renderPage();
    expect(screen.getByTestId("prose").textContent).toBe("Everyone signs in with their work email.");
    expect(screen.getByText("A sign-in link lasts 15 minutes.")).toBeTruthy();
    expect(screen.getByLabelText("aiPages.detail.read.foldPin")).toBeTruthy();
    expect(screen.getByRole("button", { name: "aiPages.detail.pinned.remove" })).toBeTruthy();
    const aside = screen.getByRole("complementary");
    expect(within(aside).getByText("aiPages.kindFilter.label")).toBeTruthy();
    expect(within(aside).getByText("aiPages.detail.page.facts.verified")).toBeTruthy();
    expect(within(aside).getByText("aiPages.detail.page.facts.lastUsed")).toBeTruthy();
    expect(within(aside).getByRole("heading", { name: "aiPages.detail.tags.label" })).toBeTruthy();
    expect(within(aside).getByText("security")).toBeTruthy();
    expect(within(aside).getByRole("link", { name: "Inviting people" }).getAttribute("href")).toBe("/admin/ai/knowledge/page_2");
  });

  it("adds and removes a tag through the check-up's tag doors", async () => {
    const addTag = vi.fn().mockResolvedValue(null);
    const removeTag = vi.fn().mockResolvedValue(null);
    useMutations({ "wikiCheckupPages:addTagForGlobal": addTag, "wikiCheckupPages:removeTagForGlobal": removeTag });
    showDetail(detail);
    renderPage();
    fireEvent.change(screen.getByLabelText("aiPages.detail.tags.addLabel"), { target: { value: "passwords" } });
    fireEvent.click(screen.getByRole("button", { name: "aiPages.detail.tags.add" }));
    await waitFor(() => expect(addTag).toHaveBeenCalledWith({ pageId, tag: "passwords" }));
    fireEvent.click(screen.getByRole("button", { name: "aiPages.detail.tags.remove" }));
    await waitFor(() => expect(removeTag).toHaveBeenCalledWith({ pageId, tag: "security" }));
  });

  it("opens the words in a box with Save the page and Discard", () => {
    showDetail(detail);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "aiPages.detail.read.edit" }));
    expect(screen.getByLabelText("aiPages.detail.body.title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "aiPages.detail.body.save" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "aiPages.detail.body.discard" }));
    expect(screen.getByTestId("prose")).toBeTruthy();
  });

  it("shows an earlier version, then puts it back only after a yes", async () => {
    search = new URLSearchParams("tab=history");
    const restore = vi.fn().mockResolvedValue(null);
    useMutations({ "wikiCheckupPages:restoreRevisionForGlobal": restore });
    showDetail(detail);
    renderPage();
    expect(screen.queryByTestId("prose")).toBeNull();
    expect(screen.getByRole("link", { name: "aiPages.detail.history.title 2" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Older words.")).toBeTruthy();
    expect(screen.getByText("aiPages.sources.human")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "aiPages.detail.history.showRow" })[0]);
    expect(screen.getByRole("heading", { name: "aiPages.detail.history.shown" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "aiPages.detail.history.restoreRow" })[0]);
    expect(restore).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "aiPages.detail.history.restore" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith({ revisionId: "rev_1" }));
  });

  it("lists where it came from on its own tab", () => {
    search = new URLSearchParams("tab=sources");
    showDetail(detail);
    renderPage();
    expect(screen.getByText("Security policy.pdf")).toBeTruthy();
    expect(screen.queryByTestId("prose")).toBeNull();
  });

  it("lists the pages that link here on the Links tab", () => {
    search = new URLSearchParams("tab=links");
    showDetail(detail);
    renderPage();
    expect(screen.getByRole("heading", { name: "aiPages.detail.page.linksHere" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "teams" }).getAttribute("href")).toBe("/admin/ai/knowledge/page_3");
  });

  it("offers no edit, pin, tag or Put back on a Knowledge article's page, and says where to change it", () => {
    showDetail({ ...detail, isKnowledgeArticle: true });
    renderPage();
    expect(screen.getByText("aiPages.detail.page.knowledgeArticle")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "aiPages.detail.read.edit" })).toBeNull();
    expect(screen.queryByLabelText("aiPages.detail.read.foldPin")).toBeNull();
    expect(screen.queryByRole("button", { name: "aiPages.detail.pinned.remove" })).toBeNull();
    expect(screen.queryByLabelText("aiPages.detail.tags.addLabel")).toBeNull();
    expect(screen.queryByRole("button", { name: "aiPages.detail.tags.remove" })).toBeNull();
    expect(screen.getByText("security")).toBeTruthy();
  });

  it("offers no Put back on a Knowledge article's history", () => {
    search = new URLSearchParams("tab=history");
    showDetail({ ...detail, isKnowledgeArticle: true });
    renderPage();
    expect(screen.getByText("Older words.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "aiPages.detail.history.restoreRow" })).toBeNull();
  });

  it("says plainly when the page does not exist", () => {
    showDetail(null);
    renderPage();
    expect(screen.getByRole("heading", { name: "aiPages.detail.notFound" })).toBeTruthy();
  });
});
