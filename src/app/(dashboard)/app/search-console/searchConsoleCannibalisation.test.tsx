import { cleanup, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useAction, useMutation, useQuery } from "convex/react";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import { ROW, STATUS, SUMMARY, list } from "@/src/test/searchConsoleFixtures";
import SearchConsoleCompetingPage from "./[siteId]/pages-competing/page";

/**
 * Keyword cannibalisation as Anthony chose it on 20 November 2026 (Way 3; search-console-keyword-cannibalisation-way-3-plan-2026-11-20.md):
 * the keywords on Insights' rule, four boxes, the ticked keyword's pages each day with a menu of the pages it competed
 * with, and a table with a tick a row and each keyword's Swaps.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1/pages-competing", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: (url: string) => { nav.search = url.split("?")[1] ?? ""; }, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const KNOBS = { ...ROW, key: "door knobs", impressions: 1382, clicks: 4, position: 14.3, count: 2, swaps: 8, top: "https://acme-shop.test/door-knobs/", topShare: 0.73, next: "https://acme-shop.test/front-door-knobs/", nextShare: 0.23 };
const HINGES = { ...ROW, key: "door hinges", impressions: 900, clicks: 2, position: 9.1, count: 3, swaps: 2, top: "https://acme-shop.test/hinges/", topShare: 0.6, next: "https://acme-shop.test/kitchen-hinges/", nextShare: 0.3 };
const BOXES = { ...SUMMARY, rows: 2, of: 40, clicks: 6, impressions: 2282, pagesInvolved: 5, pagesShown: 31 };

/** Door knobs' pages each day: two that count, and one under 1 in 10 of its impressions. */
const DAYS = {
  ok: true,
  swaps: 1,
  days: 2,
  pages: [
    { page: "https://acme-shop.test/door-knobs/", title: "Door Knobs", clicks: 3, impressions: 60, position: 12, counted: true, days: [{ day: "2026-09-25", clicks: 1, impressions: 20, position: 13 }, { day: "2026-09-26", clicks: 2, impressions: 40, position: 11.5 }] },
    { page: "https://acme-shop.test/front-door-knobs/", title: "Front Door Knobs", clicks: 0, impressions: 30, position: 15, counted: true, days: [{ day: "2026-09-25", clicks: 0, impressions: 25, position: 15 }, { day: "2026-09-26", clicks: 0, impressions: 5, position: 16 }] },
    { page: "https://acme-shop.test/luxury-knobs/", title: "Luxury Knobs", clicks: 0, impressions: 2, position: 30, counted: false, days: [{ day: "2026-09-26", clicks: 0, impressions: 2, position: 30 }] },
  ],
};

const asked = vi.fn();
function answer() {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "searchConsoleConnect:searchConsoleStatus": STATUS,
    "searchConsoleLists:searchConsoleListPage": { ...list([KNOBS, HINGES]), summary: BOXES },
  }));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation(((reference: unknown) => (args: unknown) => {
    if (convexPath(reference).endsWith("searchConsoleKeywordPagesByDay")) {
      asked(args);
      return Promise.resolve(DAYS);
    }
    return new Promise(() => undefined);
  }) as never);
}

const listAsked = () => vi.mocked(useQuery).mock.calls.filter(([reference]) => convexPath(reference).endsWith("searchConsoleListPage")).at(-1)?.[1] as Record<string, unknown> | undefined;

beforeEach(() => {
  useScreenDay("2026-09-27");
  nav.search = "";
  asked.mockReset();
  vi.mocked(useQuery).mockReset();
  answer();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Keyword cannibalisation", () => {
  it("lists the keywords on the rule, the most shown first, and says the four boxes in plain words", async () => {
    render(<SearchConsoleCompetingPage />);
    await screen.findByText("door hinges");
    expect(listAsked()).toMatchObject({ dimension: "query", view: "competing", sort: "impressions", direction: "desc" });
    const boxes = within(document.querySelector('[data-part="figures"]') as HTMLElement);
    for (const label of ["Keywords two pages share", "Pages competing", "Times Google showed them", "Clicks they got"]) expect(boxes.getByText(label)).toBeInTheDocument();
    expect(boxes.getByText("Out of 31 pages Google showed")).toBeInTheDocument();
    expect(boxes.getByText("Your home page and searches for your name are left out")).toBeInTheDocument();
  });

  it("draws the table's first keyword until another is ticked, and asks Google for its pages each day", async () => {
    render(<SearchConsoleCompetingPage />);
    await screen.findByText("Which page Google showed for door knobs each day");
    expect(asked).toHaveBeenCalledWith(expect.objectContaining({ key: "door knobs", searchType: "web" }));
    expect(await screen.findByText(/That happened on one day in/)).toBeInTheDocument();
    // The Pages menu opens on the two pages that count, never the one under 1 in 10.
    const menu = screen.getAllByRole("button").find((button) => button.textContent?.startsWith("Pages:"));
    expect(menu?.textContent).not.toContain("Luxury Knobs");
    expect(menu?.textContent).toMatch(/Door Knobs|2 of 3/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Draw door hinges on the chart" }));
    expect(nav.search).toContain("keyword=door+hinges");
  });

  it("keeps the table lean: a tick, the keyword and five figures, Swaps among them", async () => {
    render(<SearchConsoleCompetingPage />);
    await screen.findByText("door hinges");
    const headings = [...document.querySelectorAll("thead th")].map((cell) => cell.textContent?.trim() ?? "");
    expect(headings.filter(Boolean).map((text) => text.replace(/[↑↓⇅]/g, "").trim())).toEqual(["On the chart", "Keyword", "Pages", "Swaps", "Shown", "Clicks", "Position"]);
    expect(screen.getByTitle("Days Google swapped the page it showed most")).toBeInTheDocument();
  });
});
