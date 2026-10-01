import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import NewsPage from "./page";

const nav = vi.hoisted(() => ({ locale: "en" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return { ...base, useLocale: () => nav.locale };
});
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

const ITEMS = [
  {
    _id: "item_1", kind: "GOOGLE_UPDATE", sourceName: "Google", title: "March 2025 core update", summary: "Google re-ranked results.",
    meaning: "", url: "https://status.search.google.com/1", publishedAt: Date.UTC(2025, 2, 13),
  },
  {
    _id: "item_2", kind: "WEBSITE", sourceName: "Search Engine Land", title: "AI answers take more clicks", summary: "A new study.",
    meaning: "Check your page-one searches for an AI answer.", url: "https://searchengineland.com/2", publishedAt: Date.UTC(2025, 2, 10),
  },
];

/** News (docs/plans/active/knowledge-news-and-digest-plan.md, phase 3): every signed-in user's, newest first, in their language. */
describe("News", () => {
  beforeEach(() => {
    nav.locale = "en";
    vi.mocked(usePaginatedQuery).mockReset().mockReturnValue({ results: ITEMS, status: "CanLoadMore", isLoading: false, loadMore: vi.fn() } as never);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "newsFollows:listFollows": [{ _id: "follow_1", kind: "X", name: "Lily Ray", url: "https://x.com/lilyraynyc", why: "Clear takes on every core update." }],
    }));
  });

  it("shows each item with its source, what it means for the reader, and the way to the original", () => {
    render(<NewsPage />);

    expect(screen.getByText("March 2025 core update")).toBeInTheDocument();
    expect(screen.getByText("Check your page-one searches for an AI answer.")).toBeInTheDocument();
    // A Google update says what it is and does not pretend to have a meaning it was not given.
    expect(screen.getAllByText("news.meaning")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /news\.readOriginal/ })[1]).toHaveAttribute("href", "https://searchengineland.com/2");
    expect(screen.getByText("Lily Ray")).toBeInTheDocument();
    expect(screen.getByText("Clear takes on every core update.")).toBeInTheDocument();
  });

  it("asks for the reader's language, and for one kind when filtered", () => {
    nav.locale = "it";
    render(<NewsPage />);

    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toEqual({ language: "it" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "GOOGLE_UPDATE" } });
    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toEqual({ kind: "GOOGLE_UPDATE", language: "it" });
  });
});
