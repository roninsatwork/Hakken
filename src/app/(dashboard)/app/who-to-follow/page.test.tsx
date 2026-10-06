import { fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import WhoToFollowPage from "./page";

const nav = vi.hoisted(() => ({ locale: "en", replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return { ...base, useLocale: () => nav.locale };
});
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({}),
  usePathname: () => "/app/who-to-follow",
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/hooks/useDebounce", () => ({ default: (value: unknown) => value }));

const follow = (id: string, kind: string, name: string, why: string, pickedAt: number | null = null) => ({
  _id: id, kind, name, url: `https://${kind.toLowerCase()}.test/${id}`, why, topic: null, pickedAt,
});
const PEOPLE = [
  follow("follow_1", "YOUTUBE", "Ahrefs", "Practical SEO tutorials."),
  follow("follow_2", "LINKEDIN", "Aleyda Solis", "International SEO."),
  follow("follow_3", "X", "Barry Schwartz", "Reports Google's changes the day they happen."),
  follow("follow_4", "WEBSITE", "Search Engine Land", "Daily news on search marketing."),
];
const PICKS = [follow("follow_9", "WEBSITE", "Nacho Mascort", "Long, careful pieces.", 1), follow("follow_8", "X", "Lily Ray", "Often first to spot a core update.", 2)];
const page = (rows: unknown[], total = rows.length) => ({ rows, total, page: 1, pages: Math.max(1, Math.ceil(total / 25)), size: 25, cut: null, preparing: false });

/**
 * Who to follow in Insights (docs/plans/active/insights-helpful-content-plan.md,
 * IH13 — option C): our picks first; then everyone, A to Z in two columns,
 * searched and filtered by the server one numbered page at a time (IH21); each
 * person opening their own page in a new tab.
 */
describe("Who to follow", () => {
  beforeEach(() => {
    nav.locale = "en";
    nav.replace.mockReset();
    vi.mocked(useQuery).mockReset().mockImplementation(answerQueries({
      "newsFollows:listFollowsByPage": page(PEOPLE, 214),
      "newsFollows:listPicks": PICKS,
      "newsFollows:getFollowTotals": { all: 214, byKind: { X: 90, YOUTUBE: 60, WEBSITE: 50, LINKEDIN: 14 }, byTopic: {}, byKindTopic: {} },
      "topics:listTopics": [{ key: "RANKINGS", name: "Rankings" }],
      "learnMenu:getLearnMenuCounts": { news: { all: 0, GOOGLE_UPDATE: 0, WEBSITE: 0, YOUTUBE: 0, X: 0 }, follows: 214, topics: [], articles: { all: 0, byTopic: {} }, helpful: { all: 0, byTopic: {} } },
    }));
  });

  it("shows our picks, then everyone in two columns, each opening their page in a new tab", () => {
    render(<WhoToFollowPage />);

    const picks = screen.getByRole("region", { name: "learn.follow.picks" });
    expect(within(picks).getAllByRole("article").map((pick) => within(pick).getByRole("heading").textContent)).toEqual(["Nacho Mascort", "Lily Ray"]);
    const visit = within(picks).getByRole("link", { name: /learn\.follow\.visit\.WEBSITE/ });
    expect(visit).toHaveAttribute("href", PICKS[0].url);
    expect(visit).toHaveAttribute("target", "_blank");

    const ahrefs = screen.getByRole("link", { name: "Ahrefs" });
    expect(ahrefs).toHaveAttribute("href", PEOPLE[0].url);
    expect(ahrefs).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Daily news on search marketing.")).toBeInTheDocument();
    // A to Z down the first column, then the second.
    const columns = document.querySelector('[data-part="follow-columns"]');
    expect([...(columns?.children ?? [])].map((column) => column.textContent)).toEqual([
      expect.stringMatching(/^Ahrefs.*Aleyda Solis/),
      expect.stringMatching(/^Barry Schwartz.*Search Engine Land/),
    ]);
    expect(screen.getByText("learn.follow.peopleCount")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /learn\.menu\.whoToFollow/ })).toHaveAttribute("aria-current", "page");
  });

  it("asks the server for the reader's language, a search, Where and Topic, a page at a time", () => {
    nav.locale = "it";
    render(<WhoToFollowPage />);
    // The list's own query is the one asked for a page and its rows.
    const asked = () => vi.mocked(useQuery).mock.calls.map(([, args]) => args as Record<string, unknown> | undefined).filter((args) => args && "rows" in args).at(-1);

    expect(asked()).toEqual({ language: "it", page: 1, rows: 25 });
    fireEvent.change(screen.getByPlaceholderText("learn.follow.searchPlaceholder"), { target: { value: "lily" } });
    expect(asked()).toMatchObject({ language: "it", search: "lily" });
    fireEvent.change(screen.getByRole("combobox", { name: "learn.follow.filters.where" }), { target: { value: "X" } });
    fireEvent.change(screen.getByRole("combobox", { name: "learn.follow.filters.topic" }), { target: { value: "RANKINGS" } });
    expect(asked()).toMatchObject({ search: "lily", kind: "X", topic: "RANKINGS" });
  });

  it("hides our picks when there are none, and says when no one matches", () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "newsFollows:listFollowsByPage": page([]),
      "newsFollows:listPicks": [],
      "newsFollows:getFollowTotals": { all: 214, byKind: {}, byTopic: {}, byKindTopic: {} },
      "topics:listTopics": [],
    }));
    render(<WhoToFollowPage />);
    fireEvent.change(screen.getByPlaceholderText("learn.follow.searchPlaceholder"), { target: { value: "nobody" } });

    expect(screen.queryByRole("region", { name: "learn.follow.picks" })).not.toBeInTheDocument();
    expect(screen.getByText("learn.follow.noMatch")).toBeInTheDocument();
  });
});
