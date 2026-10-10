import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import NewsItemsAdminPage from "./page";

const { setInKnowledge } = vi.hoisted(() => ({ setInKnowledge: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({}));

const story = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  _id: id, kind: "WEBSITE", sourceName: "Glenn Gabe", followId: "glenn", titleEn: title, summaryEn: `About ${title}.`, url: `https://gsqi.com/${id}`,
  knowledge: { state: null, words: null, problem: null }, publishedAt: Date.parse("2026-10-07"), createdAt: 1, isGoogleUpdate: false, leadUntil: null, ...extra,
});
// The same objects every render, as Convex answers until something changes.
const STORIES = [
  story("kept", "What the October core update changed", { knowledge: { state: "IN", words: 3412, problem: null } }),
  story("reading", "Recovering from a helpful content drop", { knowledge: { state: "READING", words: null, problem: null } }),
  story("video", "I tested internal links for 30 days", { kind: "YOUTUBE", sourceName: "Edward Sturm", followId: "edward", knowledge: { state: "FAILED", words: null, problem: "A video has no article to keep: News keeps its summary." } }),
  story("update", "October 2026 core update", { kind: "GOOGLE_UPDATE", sourceName: "Google", followId: null, isGoogleUpdate: true }),
];
const PAGE = { results: STORIES, status: "Exhausted", isLoading: false, loadMore: vi.fn() };

/**
 * Admin → Content → News (docs/plans/active/content-people-knowledge-plan.md,
 * board 4): every story with its In knowledge tick and Words kept, narrowed
 * on the server by who it is from, its channel and whether it is in
 * Knowledge, and a person's name opening their page.
 */
describe("Admin News", () => {
  beforeEach(() => {
    setInKnowledge.mockReset().mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "newsFollows:listFollowNamesForAdmin": [{ _id: "edward", name: "Edward Sturm" }, { _id: "glenn", name: "Glenn Gabe" }],
      "news:countNewsInKnowledgeForAdmin": { count: 1, more: false },
      "news:getLeadForAdmin": null,
    }));
    vi.mocked(usePaginatedQuery).mockReset().mockImplementation((() => PAGE) as never);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => (convexPath(reference).endsWith("setNewsItemInKnowledge") ? setInKnowledge : vi.fn())) as never);
  });

  const lastArgs = () => vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1];
  const row = (title: string) => screen.getByText(title).closest("tr") as HTMLElement;

  it("shows each story's words kept, ticks what is in or being read, and says why a video can't be kept", () => {
    renderWithProviders(<NewsItemsAdminPage />);

    expect(screen.getByText("admin.newsItems.knowledgeNotice")).toBeInTheDocument();
    expect(within(row("What the October core update changed")).getByText("3,412")).toBeInTheDocument();
    expect(within(row("What the October core update changed")).getByRole("checkbox")).toBeChecked();
    expect(within(row("Recovering from a helpful content drop")).getByText("admin.knowledgeTick.reading")).toBeInTheDocument();
    expect(within(row("Recovering from a helpful content drop")).getByRole("checkbox")).toBeChecked();
    const video = row("I tested internal links for 30 days");
    expect(within(video).getByText("A video has no article to keep: News keeps its summary.")).toBeInTheDocument();
    expect(within(video).getByRole("checkbox")).not.toBeChecked();
    expect(within(row("October 2026 core update")).getByText("admin.knowledgeTick.summaryOnly")).toBeInTheDocument();
    // A person's name opens their page; Google's updates have no page.
    expect(within(video).getByRole("link", { name: "Edward Sturm" })).toHaveAttribute("href", "/admin/content/who-to-follow/edward");
    expect(within(row("October 2026 core update")).queryByRole("link", { name: "admin.newsItems.from.google" })).not.toBeInTheDocument();
  });

  it("ticks a story into Knowledge and unticks one out", async () => {
    renderWithProviders(<NewsItemsAdminPage />);

    fireEvent.click(within(row("October 2026 core update")).getByRole("checkbox"));
    await waitFor(() => expect(setInKnowledge).toHaveBeenCalledWith({ itemId: "update", keep: true }));
    fireEvent.click(within(row("What the October core update changed")).getByRole("checkbox"));
    await waitFor(() => expect(setInKnowledge).toHaveBeenCalledWith({ itemId: "kept", keep: false }));
  });

  it("narrows by who it is from, its channel and Knowledge on the server, and sorts by Published", () => {
    renderWithProviders(<NewsItemsAdminPage />);
    expect(lastArgs()).toEqual({ direction: "desc" });

    fireEvent.change(screen.getByLabelText("admin.newsItems.filters.from"), { target: { value: "GOOGLE" } });
    fireEvent.change(screen.getByLabelText("admin.newsItems.filters.channel"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("admin.newsItems.filters.knowledge"), { target: { value: "IN" } });
    fireEvent.click(screen.getByRole("button", { name: /admin\.newsItems\.columns\.published/ }));
    expect(lastArgs()).toEqual({ from: "GOOGLE", kind: "X", knowledge: "IN", direction: "asc" });
  });
});
