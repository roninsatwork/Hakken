import { cleanup, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { useScreenDay } from "@/src/test/realTime";
import { convexPath } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { STATUS } from "@/src/test/searchConsoleFixtures";
import SearchConsoleIndexingPage from "./[siteId]/indexing/page";
import SearchConsoleIndexingReasonPage from "./[siteId]/indexing/[reason]/page";

/**
 * Search Console → Indexing, V1, as Anthony chose it on 18 November 2026 (search-console-indexing-v1-plan-2026-11-18.md):
 * the summary's four boxes, its line on how far the checks have got, its chart and its lean table of Google's reasons,
 * and a reason's own page, with the boxes for its kind and its Examples. Problems only; Google's terms name things and
 * every sentence around them is in everyday words. More Handles' checks of 18 November, cut down.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1/indexing", search: "", reason: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1", reason: nav.reason }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const OWN_STATUS = { ...STATUS, connection: { ...STATUS.connection, newestDay: "2026-11-16", oldestDay: "2025-07-01" } };
const CHECKS = { day: "2026-11-18", checked: 1238, indexed: 1036, notIndexed: 202, known: 21715 };
const SUMMARY = {
  on: true,
  checks: CHECKS,
  reasons: [
    { reason: "URL is unknown to Google", pages: 189, inSitemap: 0, crawled: null },
    { reason: "Page with redirect", pages: 10, inSitemap: 0, crawled: "2026-11-12" },
    { reason: "Not found (404)", pages: 2, inSitemap: 0, crawled: "2026-10-09" },
    { reason: "Excluded by ‘noindex’ tag", pages: 1, inSitemap: 0, crawled: "2026-09-29" },
  ],
  weekBefore: null,
  days: [
    { day: "2026-11-17", reasons: [{ reason: "URL is unknown to Google", pages: 120 }, { reason: "Page with redirect", pages: 6 }] },
    { day: "2026-11-18", reasons: [{ reason: "URL is unknown to Google", pages: 189 }, { reason: "Page with redirect", pages: 10 }, { reason: "Not found (404)", pages: 2 }, { reason: "Excluded by ‘noindex’ tag", pages: 1 }] },
  ],
  figures: {
    from: "2026-10-01", to: "2026-10-31", clicks: 8714, impressions: 1_000_000,
    byReason: [{ reason: "URL is unknown to Google", clicks: 31, impressions: 900 }, { reason: "Page with redirect", clicks: 5, impressions: 300 }, { reason: "Not found (404)", clicks: 0, impressions: 12 }, { reason: "Excluded by ‘noindex’ tag", clicks: 0, impressions: 0 }],
    clickedPages: [{ page: "/hafele-amelia-cabinet-knob.html", address: "https://www.morehandles.co.uk/hafele-amelia-cabinet-knob.html", title: "Hafele Amelia Cabinet Knob | More Handles", reason: "URL is unknown to Google", clicks: 4, impressions: 36 }],
  },
  live: false,
  report: "https://search.google.com/search-console/index?resource_id=sc-domain%3Amorehandles.co.uk",
};
const page = (path: string, over: Record<string, unknown> = {}) => ({
  page: path, reason: "URL is unknown to Google", address: `https://www.morehandles.co.uk${path}`, title: null, crawled: null, googleCanonical: null, inSitemap: false, linkedOwn: false, mainIndexed: false, ...over,
});
const REASONS: Record<string, unknown> = {
  "URL is unknown to Google": {
    reason: "URL is unknown to Google", checks: CHECKS, live: false,
    pages: [page("/hafele-amelia-cabinet-knob.html?idp=62980", { title: "Hafele Amelia Cabinet Knob | More Handles" }), page("/eclipse-lever.html"), page("/zoo-handle.html?idp=1")],
    figures: { from: "2026-10-01", to: "2026-10-31", clicks: 8714, impressions: 1_000_000, byPage: [{ page: "/hafele-amelia-cabinet-knob.html?idp=62980", clicks: 4, impressions: 36 }, { page: "/eclipse-lever.html", clicks: 1, impressions: 50 }] },
  },
  "Page with redirect": {
    reason: "Page with redirect", checks: CHECKS, live: false,
    pages: [
      page("http://www.morehandles.co.uk/", { reason: "Page with redirect", address: "http://www.morehandles.co.uk/", crawled: "2026-11-12", googleCanonical: "https://www.morehandles.co.uk/", mainIndexed: true }),
      page("/kirkpatrick-surface-bolt.html", { reason: "Page with redirect", crawled: "2026-10-30", googleCanonical: "https://www.morehandles.co.uk/kirkpatrick-rustic-surface-bolt.html" }),
    ],
    figures: { from: "2026-10-01", to: "2026-10-31", clicks: 8714, impressions: 1_000_000, byPage: [] },
  },
  "Crawled - currently not indexed": { reason: "Crawled - currently not indexed", checks: CHECKS, live: false, pages: [], figures: null },
};
const DAYS = {
  ok: true, from: "2026-09-18", to: "2026-11-16", kept: 60,
  days: [{ day: "2026-11-15", clicks: 1, impressions: 40 }, { day: "2026-11-16", clicks: 0, impressions: 22 }],
  pages: [{ page: "/hafele-amelia-cabinet-knob.html?idp=62980", lastShown: "2026-11-16", days: 41 }, { page: "/eclipse-lever.html", lastShown: "2026-10-20", days: 3 }, { page: "/zoo-handle.html?idp=1", lastShown: null, days: 0 }],
};

let summary: unknown = SUMMARY;
let actionAsks: string[] = [];
/** Google's most an ask, when the live pages reached it. */
let liveCut: number | null = null;

function answer() {
  vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const name = convexPath(reference);
    if (name.endsWith("searchConsoleStatus")) return OWN_STATUS;
    if (name.endsWith("searchConsoleCountryChoices")) return { main: "gbr", ready: [] };
    if (name.endsWith("searchConsoleIndexing")) return summary;
    if (name.endsWith("searchConsoleIndexingReason")) return REASONS[(args as { reason: string }).reason] ?? { reason: (args as { reason: string }).reason, checks: CHECKS, live: false, pages: [], figures: null };
    return undefined;
  }) as never);
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation(((reference: unknown) => {
    const name = convexPath(reference);
    return vi.fn(() => {
      actionAsks.push(name);
      if (name.endsWith("searchConsoleIndexingDays")) return Promise.resolve(DAYS);
      if (name.endsWith("searchConsoleLiveIndexing")) return Promise.resolve({ ok: true, figures: SUMMARY.figures, byPage: [], ...(liveCut ? { cut: liveCut } : {}) });
      return new Promise(() => undefined);
    });
  }) as never);
}

beforeEach(() => {
  useScreenDay("2026-11-18");
  summary = SUMMARY;
  actionAsks = [];
  liveCut = null;
  nav.pathname = "/app/search-console/site_1/indexing";
  nav.search = "";
  nav.reason = "";
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
  answer();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const box = (label: string) => screen.getByText(label, { selector: "[data-part='figure'] *" }).closest("[data-part='figure']") as HTMLElement;
const headings = (table: HTMLElement) => within(table).getAllByRole("columnheader").map((cell) => cell.textContent?.trim()).filter(Boolean);

describe("Indexing, the summary", () => {
  it("four boxes from the website's own reasons, Google's words for the biggest, and the clicks against all of them", async () => {
    render(<SearchConsoleIndexingPage />);
    await screen.findByText("Not indexed");
    expect(within(box("Not indexed")).getByText("202")).toBeInTheDocument();
    expect(within(box("Not indexed")).getByText("Google gave 4 reasons. They're in the table below.")).toBeInTheDocument();
    expect(within(box("Indexed")).getByText("1,036")).toBeInTheDocument();
    expect(within(box("Indexed")).getByText("Google can show these in search.")).toBeInTheDocument();
    const biggest = screen.getAllByText("URL is unknown to Google").find((one) => one.closest("[data-part='figure']"))!.closest("[data-part='figure']") as HTMLElement;
    expect(within(biggest).getByText("The biggest reason. That's 189 of the 202 pages not indexed.")).toBeInTheDocument();
    expect(within(box("Clicks on pages not indexed")).getByText("36")).toBeInTheDocument();
    expect(within(box("Clicks on pages not indexed")).getByText("About 1 in 240 of the clicks on your pages in October.")).toBeInTheDocument();
  });

  it("one line on how far the checks have got, and Google's own report", async () => {
    render(<SearchConsoleIndexingPage />);
    expect(await screen.findByText("1,238 of your 21,715 pages are checked so far. The rest are done by about 1 December.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Full report in Search Console" })).toHaveAttribute("href", SUMMARY.report);
  });

  // Anthony, 18 November 2026: "its the graph for the table below over time", as Google's own Page indexing chart.
  it("the chart: the table's reasons day by day, since the checks began, whatever the dates chosen", async () => {
    render(<SearchConsoleIndexingPage />);
    expect(await screen.findByText("Pages not indexed each day")).toBeInTheDocument();
    // Pages are still being checked here, so the hint says the line rises as more are (fix 5, 21 November 2026): More
    // Handles' line went from 4 to 195 in two days while 2,277 of 14,563 pages were checked.
    expect(screen.getByText("The reasons in the table below, day by day, since the checks began on 17 November. The line rises as more of your pages are checked.")).toBeInTheDocument();
    expect(screen.getByText("Every reason")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show yet.")).not.toBeInTheDocument();
  });

  it("the table is lean: Reason, Source, Pages, Clicks, Shown and Crawled, the most pages first, each opening its reason's page", async () => {
    render(<SearchConsoleIndexingPage />);
    await screen.findByText("Why pages aren't indexed");
    const table = screen.getByRole("table");
    expect(headings(table)).toEqual(["Reason", "Source", "Pages", "Clicks", "Shown", "Crawled"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["URL is unknown to Google", "Page with redirect", "Not found (404)", "Excluded by ‘noindex’ tag"]);
    expect(within(rows[0]).getByText("Google systems")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Website")).toBeInTheDocument();
    expect(within(rows[2]).getByRole("link")).toHaveAttribute("href", expect.stringContaining("/app/search-console/site_1/indexing/not-found-404"));
    // The plain line on hover, never in a sentence of its own.
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("title", "Google has no record of these pages.");
  });

  it("before any check: how far is none, and when the first checks happen", async () => {
    summary = { ...SUMMARY, checks: null, reasons: [], days: [], figures: null };
    render(<SearchConsoleIndexingPage />);
    expect(await screen.findByText("Google hasn't been asked about your pages yet. The first checks start tonight, with the nightly update.")).toBeInTheDocument();
    // No 0 that reads as "no problems" before a single page is checked.
    expect(within(box("Not indexed")).getByText("Not checked with Google yet.")).toBeInTheDocument();
    expect(within(box("Not indexed")).queryByText("Google showed no problems with the pages checked so far.")).not.toBeInTheDocument();
    expect(within(box("Indexed")).getByText("–")).toBeInTheDocument();
    expect(screen.getByText("No reasons to show yet.")).toBeInTheDocument();
    cleanup();
    summary = { ...SUMMARY, on: false, checks: null, reasons: [], days: [], figures: null };
    render(<SearchConsoleIndexingPage />);
    expect(await screen.findByText("Google hasn't been asked about your pages yet. The first checks start once they're turned on for this website.")).toBeInTheDocument();
  });

  it("dates or a country not kept: the clicks are asked of Google", async () => {
    summary = { ...SUMMARY, figures: null, live: true };
    render(<SearchConsoleIndexingPage />);
    expect(await screen.findByText("About 1 in 240 of the clicks on your pages in October.")).toBeInTheDocument();
    expect(actionAsks.filter((name) => name.endsWith("searchConsoleLiveIndexing")).length).toBeGreaterThanOrEqual(1);
  });

  // Review fixes, 18 November 2026: the pages asked of Google stopped at its most say so once, under the table's title.
  it("pages asked of Google that stopped at Google's most say so once, under the table's title", async () => {
    summary = { ...SUMMARY, figures: null, live: true };
    liveCut = 50_000;
    render(<SearchConsoleIndexingPage />);
    expect(await screen.findByText("Google gives at most 50,000 pages in October. Some pages with few clicks aren't counted here.")).toBeInTheDocument();
    expect(screen.getAllByText(/Google gives at most/)).toHaveLength(1);
  });

  it("holds to its approved look", async () => {
    const { container } = render(<SearchConsoleIndexingPage />);
    await screen.findByText("Pages not indexed each day");
    await expectApprovedLook(container, "search-console-indexing-v1", "V1Summary", "Search Console → Indexing");
  });
});

describe("a reason's own page", () => {
  const open = (slug: string) => {
    nav.reason = slug;
    nav.pathname = `/app/search-console/site_1/indexing/${slug}`;
    return render(<SearchConsoleIndexingReasonPage />);
  };

  it("URL is unknown to Google: its words as the title, its plain line, and an unknown reason's boxes", async () => {
    open("unknown-to-google");
    expect(await screen.findByRole("heading", { name: "URL is unknown to Google" })).toBeInTheDocument();
    expect(screen.getByText("Google has no record of these pages.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Indexing" })).toHaveAttribute("href", expect.stringContaining("/app/search-console/site_1/indexing"));
    expect(within(box("Pages")).getByText("Out of the 1,238 pages checked so far.")).toBeInTheDocument();
    await waitFor(() => expect(within(box("Still shown in November")).getByText("1")).toBeInTheDocument());
    expect(within(box("Still shown in November")).getByText("The other 2 were not shown in November.")).toBeInTheDocument();
    expect(within(box("Clicks")).getByText("5")).toBeInTheDocument();
    expect(within(box("In your sitemap")).getByText(/^Your sitemap (asks Google to show them|doesn't list any of them)\.$/)).toBeInTheDocument();
    expect(await screen.findByText("Impressions each day")).toBeInTheDocument();
    expect(screen.getByText("How often Google showed these pages each day. Each day is kept from 18 September.")).toBeInTheDocument();
  });

  it("its Examples are lean, with the columns that tell its pages apart, the most impressions first", async () => {
    open("unknown-to-google");
    await screen.findByText("Examples");
    const table = screen.getByRole("table");
    expect(headings(table)).toEqual(["Page", "Last shown", "Days", "Clicks", "Shown"]);
    await waitFor(() => expect(within(table).getByText("41 of 60")).toBeInTheDocument());
    const first = within(table).getAllByRole("row")[1];
    expect(within(first).getByRole("link")).toHaveTextContent("/eclipse-lever.html");
    // A page by its title where no other page shares it.
    expect(within(table).getByText("Hafele Amelia Cabinet Knob")).toBeInTheDocument();
  });

  it("Page with redirect: a duplicate's boxes, and the page Google shows in each one's place", async () => {
    open("page-with-redirect");
    await screen.findByText("These old links send people on to another page. Google shows that page instead.");
    expect(within(box("Google picked another page")).getByText("2")).toBeInTheDocument();
    expect(within(box("Go to a page in Google")).getByText("The other one goes to a page not checked yet.")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(headings(table)).toEqual(["Page", "Main page", "Crawled", "Clicks", "Shown"]);
    expect(within(table).getByText("Home page")).toBeInTheDocument();
  });

  it("a reason with no pages yet says so in one line, with no boxes or chart", async () => {
    open("crawled-not-indexed");
    expect(await screen.findByText("None of the 1,238 pages checked so far has this answer.")).toBeInTheDocument();
    expect(screen.queryByText("Pages")).not.toBeInTheDocument();
    expect(screen.queryByText("Impressions each day")).not.toBeInTheDocument();
    expect(actionAsks.some((name) => name.endsWith("searchConsoleIndexingDays"))).toBe(false);
  });

  it("holds to its approved look", async () => {
    const { container } = open("unknown-to-google");
    await screen.findByText("Impressions each day");
    await expectApprovedLook(container, "search-console-indexing-v1", "V1Detail", "Search Console → Indexing → a reason");
  });
});
