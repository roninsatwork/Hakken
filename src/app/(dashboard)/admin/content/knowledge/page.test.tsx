import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import KnowledgeAdminPage from "./page";
import { ArticleEditor } from "./ArticleEditor";

const { create, update, push } = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({}),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const ARTICLE = {
  _id: "article_1", key: "traffic", titleEn: "How is traffic worked out?", bodyEn: "An estimate.",
  status: "PUBLISHED", topic: "TRAFFIC", publishedAt: 1, leadUntil: null, updatedAt: Date.UTC(2026, 9, 1), translations: { done: 0, total: 1 },
};
const { pin, unpin, deleteOurs, deleteWeb } = vi.hoisted(() => ({ pin: vi.fn(), unpin: vi.fn(), deleteOurs: vi.fn(), deleteWeb: vi.fn() }));
const LEAD = { storyId: "news_1", title: "October 2026 core update", place: "NEWS", pinned: true, leadUntil: Date.UTC(2026, 9, 13) };
const row = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  _id: `list_${id}`, kind: "OURS", articleId: id, title, came: "WRITTEN", fromName: "", followId: null, topic: "TRAFFIC", words: 1240,
  status: "PUBLISHED", addedAt: Date.UTC(2026, 9, 1), leadUntil: null, canLead: true, translations: { done: 0, total: 1 }, ...extra,
});
const OURS = row("article_1", "How is traffic worked out?");
const TICKED = row("library_1", "What the October core update changed", { kind: "WEB", came: "NEWS", fromName: "Glenn Gabe", followId: "glenn", topic: "RANKINGS", words: 3412 });
const answer = (rows: unknown[]) => ({
  page: { rows, total: rows.length, page: 1, pages: 1, size: 15, cut: null, preparing: false },
  counts: { published: rows.length, ours: 1, web: rows.length - 1 },
  people: [{ followId: "glenn", name: "Glenn Gabe" }],
});
// The same object every render, as Convex answers until something changes.
const BOTH = answer([OURS, TICKED]);

/**
 * Admin → Content → Knowledge (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 1, revised 2026-10-01): written in English on its own page, never in a
 * pop-up, and translated by the Translator. Its list holds ours and the web's
 * together (content-people-knowledge-plan.md, phase 3, board 5), narrowed and
 * sorted on the server; each opens on its own page.
 */
describe("Admin Knowledge articles", () => {
  beforeEach(() => {
    push.mockReset();
    create.mockReset().mockResolvedValue("article_2");
    update.mockReset().mockResolvedValue(null);
    pin.mockReset().mockResolvedValue(null);
    unpin.mockReset().mockResolvedValue(null);
    deleteOurs.mockReset().mockResolvedValue(null);
    deleteWeb.mockReset().mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "knowledgeArticles:getArticle": ARTICLE,
      "knowledgeList:listKnowledgeForAdmin": BOTH,
      "news:getLeadForAdmin": LEAD,
      "topics:listTopicChoices": [{ key: "TRAFFIC", nameEn: "Traffic" }, { key: "RANKINGS", nameEn: "Rankings" }],
    }));
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("unpinLeadStory")) return unpin;
      if (name.endsWith("pinLeadStory")) return pin;
      if (name === "knowledgeArticles:deleteArticle") return deleteOurs;
      if (name === "libraryArticles:deleteArticle") return deleteWeb;
      return name.endsWith("createArticle") ? create : name.endsWith("updateArticle") ? update : vi.fn();
    }) as never);
  });

  const lastListArgs = () => vi.mocked(useQuery).mock.calls.filter(([reference]) => convexPath(reference).endsWith("listKnowledgeForAdmin")).at(-1)?.[1];

  it("lists ours and the web's together, saying who each is from, how it came and how far its translations have got", () => {
    renderWithProviders(<KnowledgeAdminPage />);

    const ours = screen.getByText("How is traffic worked out?").closest("tr") as HTMLElement;
    expect(within(ours).getByText("admin.knowledgeArticles.from.ours")).toBeInTheDocument();
    expect(within(ours).getByText("admin.knowledgeArticles.came.WRITTEN")).toBeInTheDocument();
    expect(within(ours).getByText("admin.contentEditor.translations.waiting")).toBeInTheDocument();
    const ticked = screen.getByText("What the October core update changed").closest("tr") as HTMLElement;
    expect(within(ticked).getByText("Glenn Gabe")).toBeInTheDocument();
    expect(within(ticked).getByText("admin.knowledgeArticles.came.NEWS")).toBeInTheDocument();
    expect(within(ticked).getByText("3,412")).toBeInTheDocument();
    expect(screen.getByText("admin.knowledgeArticles.counts")).toBeInTheDocument();

    // Ours opens the writer; the web's opens its reader.
    fireEvent.click(within(ours).getByRole("button", { name: "admin.knowledgeArticles.edit" }));
    expect(push).toHaveBeenCalledWith("/admin/content/knowledge/article_1");
    fireEvent.click(screen.getByText("What the October core update changed"));
    expect(push).toHaveBeenCalledWith("/admin/content/knowledge/web/library_1");
    fireEvent.click(screen.getByRole("button", { name: /admin\.knowledgeArticles\.create/ }));
    expect(push).toHaveBeenCalledWith("/admin/content/knowledge/new");
    fireEvent.click(screen.getByRole("button", { name: /admin\.knowledgeArticles\.addFromLink/ }));
    expect(push).toHaveBeenCalledWith("/admin/content/knowledge/from-link");
  });

  it("narrows by who it is from, topic and status, and sorts by any heading, on the server", () => {
    renderWithProviders(<KnowledgeAdminPage />);
    expect(lastListArgs()).toMatchObject({ sort: "added", direction: "desc", page: 1, rows: 15 });

    fireEvent.change(screen.getByLabelText("admin.knowledgeArticles.filters.from"), { target: { value: "glenn" } });
    fireEvent.change(screen.getByLabelText("admin.knowledgeArticles.filters.status"), { target: { value: "DRAFT" } });
    fireEvent.click(screen.getByRole("button", { name: /admin\.knowledgeArticles\.columns\.words/ }));
    expect(lastListArgs()).toMatchObject({ from: "glenn", status: "DRAFT", sort: "words", direction: "desc", page: 1 });
  });

  it("deletes ours as ours and the web's as the web's, after a yes", async () => {
    renderWithProviders(<KnowledgeAdminPage />);

    const ticked = screen.getByText("What the October core update changed").closest("tr") as HTMLElement;
    fireEvent.click(within(ticked).getByRole("button", { name: "admin.knowledgeArticles.delete" }));
    expect(screen.getByText("admin.knowledgeArticles.deleteWarningNews")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "common.actions.delete" }));
    await waitFor(() => expect(deleteWeb).toHaveBeenCalledWith({ articleId: "library_1" }));
    expect(deleteOurs).not.toHaveBeenCalled();
  });

  it("writes a new article in English alone, as a draft, and goes back to the list", async () => {
    renderWithProviders(<ArticleEditor />);

    expect(screen.queryByText(/Italian|bodyItLabel|titleItLabel/)).not.toBeInTheDocument();
    const title = screen.getByLabelText(/admin\.knowledgeArticles\.titleLabel/);
    fireEvent.change(title, { target: { value: "Why rankings move" } });
    fireEvent.submit(title.closest("form") as HTMLFormElement);

    await waitFor(() => expect(create).toHaveBeenCalledWith({ titleEn: "Why rankings move", bodyEn: "", status: "DRAFT" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content/knowledge"));
  });

  it("opens an article with its words and translation status, and saves a change", async () => {
    renderWithProviders(<ArticleEditor articleId={"article_1" as never} />);

    const body = screen.getByDisplayValue("An estimate.");
    expect(screen.getByText("admin.contentEditor.translations.waiting")).toBeInTheDocument();
    fireEvent.change(body, { target: { value: "An estimate, worked out." } });
    fireEvent.submit(body.closest("form") as HTMLFormElement);

    await waitFor(() => expect(update).toHaveBeenCalledWith({ articleId: "article_1", titleEn: ARTICLE.titleEn, bodyEn: "An estimate, worked out.", status: "PUBLISHED", topic: "TRAFFIC" }));
  });

  // One lead story, pinned from News or Knowledge (IH11, boards 11 and 12).
  it("says what leads the News front page and where it was pinned, and pins a published article from its row or its page", async () => {
    const { unmount } = renderWithProviders(<KnowledgeAdminPage />);

    expect(screen.getByText("admin.leadStory.pinned")).toBeInTheDocument();
    fireEvent.click(within(screen.getByText("How is traffic worked out?").closest("tr") as HTMLElement).getByRole("button", { name: "admin.leadStory.pinRow" }));
    await waitFor(() => expect(pin).toHaveBeenCalledWith({ storyId: "article_1" }));
    unmount();

    renderWithProviders(<ArticleEditor articleId={"article_1" as never} />);
    expect(screen.getByText("admin.leadStory.pinned")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /admin\.leadStory\.pin$/ }));
    await waitFor(() => expect(pin).toHaveBeenCalledTimes(2));
  });

  it("shows where an article leads, offers to stop it, and never offers the pin on a draft", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "knowledgeList:listKnowledgeForAdmin": answer([{ ...OURS, leadUntil: Date.UTC(2026, 9, 13) }, row("article_2", "Not yet", { status: "DRAFT", canLead: false })]),
      "news:getLeadForAdmin": { ...LEAD, storyId: "article_1", place: "KNOWLEDGE" },
      "topics:listTopicChoices": [],
    }));
    renderWithProviders(<KnowledgeAdminPage />);

    // Its row says so, so the notice above the list does not.
    expect(screen.queryByText("admin.leadStory.pinned")).not.toBeInTheDocument();
    const leading = screen.getByText("How is traffic worked out?").closest("tr") as HTMLElement;
    expect(within(leading).getByText("admin.leadStory.leadUntil")).toBeInTheDocument();
    fireEvent.click(within(leading).getByRole("button", { name: "admin.leadStory.unpin" }));
    await waitFor(() => expect(unpin).toHaveBeenCalledWith({ storyId: "article_1" }));
    const draft = screen.getByText("Not yet").closest("tr") as HTMLElement;
    expect(within(draft).queryByRole("button", { name: "admin.leadStory.pinRow" })).not.toBeInTheDocument();
  });
});
