import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { DASHBOARD_ARTICLE_DAYS, ReadingRoomFront } from "./NewsFrontPage";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/**
 * The Reading room's front page, shared with the client Dashboard (dashboard-way-1-plan-2026-11-21.md): the Dashboard draws
 * the lead story, the last three Google updates and three stories in columns, without the dateline or the earlier stories,
 * and its columns reach back far enough for the newest articles to show in a quiet week.
 */
const at = (day: string) => Date.parse(`${day}T12:00:00Z`);
const LEAD = {
  _id: "item_update", kind: "GOOGLE_UPDATE", sourceName: "Google", title: "November 2026 core update", summary: "Google is rolling out a core update.",
  meaning: "", url: "https://status.search.google.com/1", publishedAt: at("2026-11-10"), update: { startedOn: "2026-11-10", finishedOn: null, expectedDays: 14 },
};
const older = (id: string, title: string, day: string) => ({ _id: id, kind: "GOOGLE_UPDATE", sourceName: "Google", title, summary: `${title}.`, meaning: "", url: `https://x/${id}`, publishedAt: at(day), update: null });
const FEED = [LEAD, older("u1", "September 2026 spam update", "2026-09-24"), older("u2", "August 2026 spam update", "2026-08-18"), older("u3", "June 2026 spam update", "2026-06-24"), older("u4", "May 2026 core update", "2026-05-21")];
const HELPFUL = { _id: "h1", url: "https://x/h1", title: "Is Google Issuing More Manual Action Penalties?", publication: "Search Engine Roundtable", author: null, publishedOn: "2026-10-08", language: "en", topic: "RANKINGS", words: 900, addedAt: at("2026-10-20"), summary: "More penalties from Google's own reviewers.", meaning: null };
const ARTICLE = { _id: "k1", title: "How is traffic worked out?", excerpt: "Traffic is a guess.", words: 400, topic: "TRAFFIC", publishedAt: at("2026-10-01"), updatedAt: at("2026-10-01") };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T09:00:00"));
  vi.mocked(usePaginatedQuery).mockReset().mockReturnValue({ results: FEED, status: "CanLoadMore", isLoading: false, loadMore: vi.fn() } as never);
  vi.mocked(useQuery).mockReset().mockImplementation(answerQueries({
    "news:getFrontPage": { lead: { source: "NEWS", item: LEAD }, weekCount: 0 },
    "googleUpdates:listLatestGoogleUpdates": [],
    "knowledgeArticles:listPublishedSince": [ARTICLE],
    "libraryArticles:listForReadersSince": [HELPFUL],
  }));
});

describe("the Reading room on the Dashboard", () => {
  it("shows the lead story and three stories in columns, with no dateline and no earlier stories", () => {
    render(<ReadingRoomFront dashboard articleDays={DASHBOARD_ARTICLE_DAYS} />);
    expect(screen.getByRole("heading", { name: "November 2026 core update" })).toBeInTheDocument();
    expect(screen.queryByText(/Week \d+/)).toBeNull();
    expect(screen.queryByRole("heading", { name: /earlier/i })).toBeNull();
  });

  it("puts the newest articles in the columns, ahead of older Google updates", () => {
    render(<ReadingRoomFront dashboard articleDays={DASHBOARD_ARTICLE_DAYS} />);
    const columns = screen.getByRole("region", { name: /more/i });
    expect(columns).toHaveTextContent("Is Google Issuing More Manual Action Penalties?");
    expect(columns).toHaveTextContent("How is traffic worked out?");
    expect(columns).not.toHaveTextContent("May 2026 core update");
  });
});
