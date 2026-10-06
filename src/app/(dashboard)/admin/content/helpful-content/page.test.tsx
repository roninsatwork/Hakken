import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import LibraryAdminPage from "./page";
import { LibraryArticleEditor } from "./LibraryArticleEditor";

const { create, update, remove, readPage, write, push } = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  readPage: vi.fn(),
  write: vi.fn(),
  push: vi.fn(),
}));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({}),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const ROW = {
  _id: "article_1",
  url: "https://www.advancedwebranking.com/seo/organic-ctr",
  title: "Organic CTR study",
  publication: "Advanced Web Ranking",
  author: null,
  publishedOn: "2026-08-05",
  updatedOn: null,
  description: "How often people click.",
  topic: "TRAFFIC",
  status: "IN_KNOWLEDGE",
  language: "en",
  words: 2140,
  readAt: Date.UTC(2026, 9, 6, 9, 14),
  summaryEn: "Most clicks go to the first organic result.",
  meaningEn: null,
  createdAt: 2,
  updatedAt: 2,
};
const DRAFT = { ...ROW, _id: "article_2", url: "https://developers.google.com/search/docs/fundamentals/how-search-works", title: "How Google Search works", publication: "Google Search Central", topic: "RANKINGS", status: "DRAFT", createdAt: 1 };
const READ = {
  status: "read",
  url: "https://developers.google.com/search/docs/appearance/ai-features",
  readAt: 5,
  title: "AI features and your website",
  publication: "Google Search Central",
  publishedOn: "2026-09-18",
  description: "How AI features work.",
  language: "en",
  body: "# AI features and your website\n\nWords.",
  words: 1180,
  cut: false,
};

/**
 * Admin → Content → Helpful content (docs/plans/active/content-library-plan.md,
 * renamed by insights-helpful-content-plan.md, IH18): the list with its
 * filters, paged on the server (IH21), adding an article by reading its page,
 * and one article's page — read again and deleted only after a yes.
 */
describe("Admin Helpful content", () => {
  beforeEach(() => {
    push.mockReset();
    create.mockReset().mockResolvedValue("article_3");
    update.mockReset().mockResolvedValue(null);
    remove.mockReset().mockResolvedValue(null);
    readPage.mockReset().mockResolvedValue(READ);
    write.mockReset().mockResolvedValue({ status: "written", summary: "How Google's AI features choose websites.", meaning: "Be indexable and quotable." });
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "libraryArticles:listAdminPublications": ["Advanced Web Ranking", "Google Search Central"],
      "libraryArticles:getArticle": { ...ROW, body: "# Organic CTR study\n\nWords.", translations: { done: 1, total: 1 } },
      "topics:listTopicChoices": [{ key: "TRAFFIC", nameEn: "Traffic" }, { key: "RANKINGS", nameEn: "Rankings" }],
    }));
    // The server searches, filters and pages (insights-helpful-content-plan.md, IH21): a draft filter answers with the drafts.
    vi.mocked(usePaginatedQuery).mockReset().mockImplementation(((_query: unknown, args: { status?: string }) => ({
      results: args?.status === "DRAFT" ? [DRAFT] : [ROW, DRAFT],
      status: "Exhausted",
      isLoading: false,
      loadMore: vi.fn(),
    })) as never);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      return name.endsWith("createArticle") ? create : name.endsWith("updateArticle") ? update : name.endsWith("deleteArticle") ? remove : vi.fn();
    }) as never);
    vi.mocked(useAction).mockImplementation(((reference: unknown) => (convexPath(reference).endsWith("writeForReaders") ? write : readPage)) as never);
  });

  it("lists every article with its details, filters by status, and opens or deletes one", async () => {
    renderWithProviders(<LibraryAdminPage />);

    expect(screen.getByText("Organic CTR study")).toBeInTheDocument();
    expect(screen.getByText("advancedwebranking.com/seo/organic-ctr")).toBeInTheDocument();
    expect(screen.getByText("How Google Search works")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("admin.libraryArticles.filters.status"), { target: { value: "DRAFT" } });
    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toEqual({ status: "DRAFT" });
    expect(screen.queryByText("Organic CTR study")).not.toBeInTheDocument();
    expect(screen.getByText("How Google Search works")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "admin.libraryArticles.edit" }));
    expect(push).toHaveBeenCalledWith("/admin/content/helpful-content/article_2");

    fireEvent.click(screen.getByRole("button", { name: "admin.libraryArticles.delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "common.actions.delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ articleId: "article_2" }));
  });

  it("adds an article: reads its page, fills the details, marks what the page did not say, and saves", async () => {
    renderWithProviders(<LibraryArticleEditor />);

    // Nothing but the address until the page is read.
    expect(screen.queryByLabelText(/admin\.libraryArticles\.titleLabel/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/admin\.libraryArticles\.addressLabel/), { target: { value: "https://developers.google.com/search/docs/appearance/ai-features/" } });
    fireEvent.click(screen.getByRole("button", { name: /admin\.libraryArticles\.read$/ }));

    await waitFor(() => expect(screen.getByLabelText(/admin\.libraryArticles\.titleLabel/)).toHaveValue("AI features and your website"));
    expect(readPage).toHaveBeenCalledWith({ url: "https://developers.google.com/search/docs/appearance/ai-features/" });
    // Hakken writes what readers see straight after a new page is read (insights-helpful-content-plan.md, IH2).
    await waitFor(() => expect(screen.getByLabelText(/admin\.libraryArticles\.summaryLabel/)).toHaveValue("How Google's AI features choose websites."));
    expect(write).toHaveBeenCalledWith({ title: READ.title, publication: READ.publication, body: READ.body });
    expect(screen.getByText("admin.libraryArticles.readNoticeLanguage")).toBeInTheDocument();
    expect(screen.getByText("admin.libraryArticles.notOnPage")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/admin\.libraryArticles\.authorLabel/), { target: { value: "Google" } });
    expect(screen.queryByText("admin.libraryArticles.notOnPage")).not.toBeInTheDocument();

    fireEvent.submit(screen.getByLabelText(/admin\.libraryArticles\.titleLabel/).closest("form") as HTMLFormElement);
    await waitFor(() => expect(create).toHaveBeenCalledWith({
      url: READ.url,
      title: READ.title,
      publication: READ.publication,
      author: "Google",
      publishedOn: "2026-09-18",
      updatedOn: "",
      description: READ.description,
      topic: undefined,
      status: "IN_KNOWLEDGE",
      language: "en",
      body: READ.body,
      readAt: 5,
      summaryEn: "How Google's AI features choose websites.",
      meaningEn: "Be indexable and quotable.",
    }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content/helpful-content"));
  });

  it("says plainly when a page cannot be read, and lets its words be pasted", async () => {
    readPage.mockResolvedValue({ status: "unread", why: "few_words", words: 7, publication: "Financial Times" });
    renderWithProviders(<LibraryArticleEditor />);

    fireEvent.change(screen.getByLabelText(/admin\.libraryArticles\.addressLabel/), { target: { value: "https://www.ft.com/content/abc" } });
    fireEvent.click(screen.getByRole("button", { name: /admin\.libraryArticles\.read$/ }));

    expect(await screen.findByText("admin.libraryArticles.unread.few_words")).toBeInTheDocument();
    expect(screen.getByLabelText(/admin\.libraryArticles\.publicationLabel/)).toHaveValue("Financial Times");
    expect(screen.getByLabelText(/admin\.libraryArticles\.bodyLabel/)).toHaveValue("");
  });

  it("names the article that already has an address instead of reading it again", async () => {
    readPage.mockResolvedValue({ status: "duplicate", articleId: "article_1", title: "Organic CTR study" });
    renderWithProviders(<LibraryArticleEditor />);

    fireEvent.change(screen.getByLabelText(/admin\.libraryArticles\.addressLabel/), { target: { value: ROW.url } });
    fireEvent.click(screen.getByRole("button", { name: /admin\.libraryArticles\.read$/ }));

    expect(await screen.findByText("admin.libraryArticles.duplicate")).toBeInTheDocument();
    expect(screen.queryByLabelText(/admin\.libraryArticles\.titleLabel/)).not.toBeInTheDocument();
  });

  it("an article's page reads again only after a yes, and leaves for the list once deleted", async () => {
    renderWithProviders(<LibraryArticleEditor articleId={"article_1" as never} />);

    expect(screen.getByDisplayValue("Organic CTR study")).toBeInTheDocument();
    expect(screen.getByText("admin.libraryArticles.inKnowledge")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /admin\.libraryArticles\.readAgain/ }));
    expect(readPage).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "admin.libraryArticles.readAgain" }));
    await waitFor(() => expect(readPage).toHaveBeenCalledWith({ url: ROW.url, articleId: "article_1" }));
    await waitFor(() => expect(screen.getByLabelText(/admin\.libraryArticles\.titleLabel/)).toHaveValue("AI features and your website"));
    // Read, not saved: nothing is stored until Save changes — and a saved article keeps its summary until Write again.
    expect(update).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/admin\.libraryArticles\.summaryLabel/)).toHaveValue(ROW.summaryEn);

    fireEvent.click(screen.getByRole("button", { name: "admin.libraryArticles.delete" }));
    // The read-again pop-up may still be fading out; the delete one is the one that asks to delete.
    const asking = await screen.findAllByRole("dialog");
    const deleting = asking.find((dialog) => within(dialog).queryByRole("button", { name: "common.actions.delete" }));
    fireEvent.click(within(deleting as HTMLElement).getByRole("button", { name: "common.actions.delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ articleId: "article_1" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content/helpful-content"));
  });
});
