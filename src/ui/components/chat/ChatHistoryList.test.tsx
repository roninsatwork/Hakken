import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import ChatHistoryList, { THREAD_PAGE_SIZE } from "./ChatHistoryList";
import { useMutation, usePaginatedQuery } from "convex/react";
import * as nextNavigation from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";

// The screen reads the configured platform name, so copy is branded per
// deployment rather than carrying a hardcoded product name.
vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));


// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/app/assistant"),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
  })),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({ today: "Today", yesterday: "Yesterday", earlier: "Earlier", showOlder: "Show older conversations" }[key] ?? key),
}));

/**
 * The list pages from the database and the search asks the database — the
 * previous version loaded the newest 100 and filtered in the browser, so
 * conversation 101 was unfindable by scroll or by search.
 */
describe("ChatHistoryList", () => {
  // Two today and one older, so the day grouping has something to group.
  const today = new Date(2026, 7, 12, 14, 5).getTime();
  const longAgo = new Date(2026, 7, 3, 9, 0).getTime();
  const mockThreads = [
    { _id: "thread1" as Id<"threads">, title: "First Conversation", _creationTime: today, updatedAt: today },
    { _id: "thread2" as Id<"threads">, title: "Project Alpha", _creationTime: today, updatedAt: today },
    { _id: "thread3" as Id<"threads">, title: "General Inquiry", _creationTime: longAgo, updatedAt: longAgo },
  ];

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 21, 0));
  });
  afterAll(() => vi.useRealTimers());

  const loadMoreMock = vi.fn();

  function mockPage(args: {
    results?: typeof mockThreads;
    status?: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  } = {}) {
    vi.mocked(usePaginatedQuery).mockImplementation((_fn, queryArgs) => {
      const searchTerm =
        queryArgs && typeof queryArgs === "object" && "searchTerm" in queryArgs
          ? (queryArgs as { searchTerm?: string }).searchTerm
          : undefined;
      const all = args.results ?? mockThreads;
      // The mock behaves like the server: a search term narrows the results.
      const results = searchTerm
        ? all.filter((thread) => thread.title.toLowerCase().includes(searchTerm.toLowerCase()))
        : all;
      return {
        results,
        status: args.status ?? "Exhausted",
        loadMore: loadMoreMock,
        isLoading: args.status === "LoadingFirstPage" || args.status === "LoadingMore",
      } as unknown as ReturnType<typeof usePaginatedQuery>;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nextNavigation.usePathname).mockReturnValue("/app/assistant");
    mockPage();
    vi.mocked(useMutation).mockReturnValue(vi.fn().mockResolvedValue({}) as unknown as ReturnType<typeof useMutation>);
  });

  it("renders the history header and new conversation button", () => {
    render(<ChatHistoryList />);
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("New Conversation")).toBeInTheDocument(); // Tooltip text
  });

  it("renders the list of threads", () => {
    render(<ChatHistoryList />);
    expect(screen.getByText("First Conversation")).toBeInTheDocument();
    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("General Inquiry")).toBeInTheDocument();
  });

  it("groups the list by day so repeated titles can be told apart", () => {
    render(<ChatHistoryList />);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
    // No conversations from yesterday, so no empty heading for it.
    expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
    // Each row carries a stamp; today's shows a time.
    expect(screen.getAllByText("14:05").length).toBe(2);
  });

  it("sends the search term to the database query", () => {
    render(<ChatHistoryList />);

    const searchInput = screen.getByPlaceholderText("Search conversations...");
    fireEvent.change(searchInput, { target: { value: "alpha" } });

    // The term reaches the query args — the search is server-side now.
    const lastCall = vi.mocked(usePaginatedQuery).mock.calls.at(-1);
    expect(lastCall?.[1]).toEqual({ searchTerm: "alpha" });

    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.queryByText("First Conversation")).not.toBeInTheDocument();
  });

  it("keeps the search box visible when a search matches nothing", () => {
    render(<ChatHistoryList />);

    const searchInput = screen.getByPlaceholderText("Search conversations...");
    fireEvent.change(searchInput, { target: { value: "zzz-no-match" } });

    expect(screen.getByText('No chats matched "zzz-no-match"')).toBeInTheDocument();
    // Without this the empty result would hide the input that caused it.
    expect(screen.getByPlaceholderText("Search conversations...")).toBeInTheDocument();
  });

  it("displays a loading state while the first page loads", () => {
    mockPage({ results: [], status: "LoadingFirstPage" });
    const { container } = render(<ChatHistoryList />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("displays an empty state when there are no conversations", () => {
    mockPage({ results: [], status: "Exhausted" });
    render(<ChatHistoryList />);
    expect(screen.getByText("No previous conversations. Start exploring Acme Copilot.")).toBeInTheDocument();
  });

  it("offers older conversations a page at a time", () => {
    mockPage({ status: "CanLoadMore" });
    render(<ChatHistoryList />);

    const button = screen.getByText("Show older conversations");
    fireEvent.click(button);
    expect(loadMoreMock).toHaveBeenCalledWith(THREAD_PAGE_SIZE);
  });

  it("shows no load-more button once the history is exhausted", () => {
    mockPage({ status: "Exhausted" });
    render(<ChatHistoryList />);
    expect(screen.queryByText("Show older conversations")).not.toBeInTheDocument();
  });

  it("opens rename input when edit button is clicked", () => {
    render(<ChatHistoryList />);

    const renameButtons = screen.getAllByTitle("Rename conversation");
    expect(renameButtons.length).toBe(3);

    fireEvent.click(renameButtons[0]);

    const input = screen.getByDisplayValue("First Conversation");
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus(); // autoFocus is true
  });
});
