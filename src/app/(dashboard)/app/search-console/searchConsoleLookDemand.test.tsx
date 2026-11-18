import { cleanup, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { useScreenDay } from "@/src/test/realTime";
import { convexPath } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { STATUS, TRACKING } from "@/src/test/searchConsoleFixtures";
import SearchConsoleDemandPage from "./[siteId]/demand-by-service/page";
import { SearchConsoleMenu } from "./_components/SearchConsoleMenu";

/**
 * Demand by Classification, as Anthony chose it on 18 November 2026 (the canvas's Way 2;
 * search-console-demand-by-classification-way-2-plan-2026-11-18.md): every figure follows the country chosen in the
 * menu. The boxes are the country's own; its pages, by Classification, are the bands', the squares' and the table's, which
 * share out only the clicks Google ties to a page, as Keywords' table does the searches Google names.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1/demand-by-service", search: "" }));
const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: router.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/** More Handles' Classifications, by their ids. */
const CHOICES = [
  ["cupboard", "Cupboard Handles"], ["handles", "Handles"], ["blog", "Blog"], ["ironmongery", "Other Ironmongery"], ["knobs", "Door Knobs"],
  ["byBrand", "Buy By Brand"], ["locks", "Locks"], ["hinges", "Hinges"], ["brand", "Brand"], ["windows", "Window Furniture"],
  ["electrical", "Electrical"], ["lighting", "Lighting"],
].map(([id, name]) => ({ id, name, type: "PRODUCT" }));
const row = (kind: string, impressions: number, impressionsBefore: number, clicks: number, clicksBefore: number, pages: number) => ({ kind, clicks, impressions, clicksBefore, impressionsBefore, pages });
/** More Handles' United Kingdom in October against September, as Google tied its clicks to its pages: 1,946 of 7,124. */
const ROWS = [
  row("cupboard", 120229, 116245, 462, 595, 636), row("handles", 91451, 79892, 282, 305, 1148), row("blog", 66149, 58350, 327, 321, 110),
  row("ironmongery", 54635, 46937, 108, 111, 699), row("knobs", 53273, 50929, 141, 153, 258), row("byBrand", 52062, 48698, 142, 173, 195),
  row("locks", 40479, 32136, 69, 69, 642), row("hinges", 32553, 30541, 64, 67, 342), row("NOT_SORTED", 25340, 20893, 56, 39, 1401),
  row("brand", 24022, 24945, 258, 212, 16), row("windows", 20249, 16959, 31, 28, 258), row("electrical", 9576, 6431, 3, 5, 630),
  row("lighting", 1919, 2340, 3, 4, 104),
];
/** The United Kingdom's own figures, Performance's read. */
const FIGURES = {
  live: false, days: [], daysBefore: [], named: null, previousDays: 31,
  totals: { clicks: 7124, impressions: 842984, ctr: 7124 / 842984, position: 12.16 },
  previous: { clicks: 7518, impressions: 821376, ctr: 7518 / 821376, position: 11.67 },
};
/** Mozambique, kept ready beside it: its pages asked of Google. */
const MOZ_ROWS = [row("blog", 900, 700, 15, 6, 4), row("handles", 600, 640, 5, 4, 3)];
const MOZ_FIGURES = { ...FIGURES, totals: { clicks: 30, impressions: 2000, ctr: 0.015, position: 9.1 }, previous: { clicks: 14, impressions: 1500, ctr: 14 / 1500, position: 9.8 } };

let demandAsks: Array<Record<string, unknown>> = [];
let liveAsks: Array<Record<string, unknown>> = [];
/** Google's most an ask, when the live pages reached it. */
let liveCut: number | null = null;

function answer() {
  vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const name = convexPath(reference);
    const ask = args as Record<string, unknown>;
    if (name.endsWith("searchConsoleStatus")) return STATUS;
    if (name.endsWith("searchConsoleCountryChoices")) return { main: "gbr", ready: ["moz"] };
    if (name.endsWith("pageKindChoices")) return CHOICES;
    if (name.endsWith("searchConsoleTracking")) return TRACKING;
    if (name.endsWith("searchConsolePerformance")) return ask.country === "moz" ? MOZ_FIGURES : FIGURES;
    if (name.endsWith("searchConsoleDemand")) {
      demandAsks.push(ask);
      return ask.country === "moz" ? { live: true } : { live: false, from: "2026-08-01", to: "2026-08-31", comparable: true, rows: ROWS };
    }
    return undefined;
  }) as never);
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation(((reference: unknown) => {
    if (convexPath(reference).endsWith("searchConsoleLiveDemand")) {
      return vi.fn((ask: Record<string, unknown>) => { liveAsks.push(ask); return Promise.resolve({ ok: true, from: "2026-08-01", to: "2026-08-31", comparable: true, rows: MOZ_ROWS, ...(liveCut ? { cut: liveCut } : {}) }); });
    }
    return vi.fn(() => new Promise(() => undefined));
  }) as never);
}

beforeEach(() => {
  // A fixed day, the one after the fixtures' newest: Last month is August, set against July.
  useScreenDay("2026-09-27");
  demandAsks = [];
  liveAsks = [];
  liveCut = null;
  nav.search = "";
  router.push.mockReset();
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
  answer();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A box, by its label: the words name a menu's choice and a table's heading too. */
const box = (label: string) => screen.getAllByText(label).map((one) => one.closest("[data-part='figure']")).find(Boolean) as HTMLElement;
/** The table's row for a part, by its name. */
const rowOf = (name: string) => within(screen.getByRole("table")).getByText(name).closest("tr") as HTMLElement;
const cells = (name: string) => within(rowOf(name)).getAllByRole("cell").map((cell) => cell.textContent?.trim());

describe("Demand by Classification, Way 2", () => {
  it("is named Classifications (Demand by Classification until 18 November 2026), its four boxes the country's own, each against the dates before by its name", async () => {
    render(<SearchConsoleDemandPage />);
    expect(await screen.findByRole("heading", { name: "Classifications" })).toBeInTheDocument();
    expect(screen.getByText("How often Google showed each of your Classifications, and the clicks they got.")).toBeInTheDocument();
    expect(within(box("Clicks")).getByText("7,124")).toBeInTheDocument();
    expect(within(box("Clicks")).getByText("▼ 5% fewer than July")).toBeInTheDocument();
    expect(within(box("Impressions")).getByText("▲ 3% more than July")).toBeInTheDocument();
    expect(within(box("Click-through rate")).getByText("▼ 0.1 points lower than July")).toBeInTheDocument();
    expect(within(box("Average position")).getByText("12.2")).toBeInTheDocument();
    expect(within(box("Average position")).getByText("▼ 0.5 places worse than July")).toBeInTheDocument();
    // The main country's kept pages: read for the dates on screen, nothing asked of Google.
    expect(demandAsks.at(-1)).toEqual({ siteId: "site_1", from: "2026-08-01", to: "2026-08-31", period: "lastMonth" });
    expect(liveAsks).toEqual([]);
    // No sentence on the page says how the figures are counted.
    expect(screen.queryByText(/every country|keeps private/i)).not.toBeInTheDocument();
  });

  it("the boxes are the country's own; the bands, squares and table share out only the clicks Google ties to a page, with no part for the rest", async () => {
    render(<SearchConsoleDemandPage />);
    const table = await screen.findByRole("table");
    // Google tied 1,946 of the country's 7,124 clicks to a page: the Classifications add up to those, and nothing stands for the rest.
    const clicks = within(table).getAllByRole("row").slice(1).map((one) => Number(within(one).getAllByRole("cell")[3].textContent?.replace(/,/g, "")));
    expect(clicks.reduce((sum, value) => sum + value, 0)).toBe(1946);
    expect(within(box("Clicks")).getByText("7,124")).toBeInTheDocument();
    expect(screen.queryByText(/private/i)).not.toBeInTheDocument();
    // The squares never say "All your clicks" over a figure smaller than the box.
    expect(screen.getByText("The clicks on your pages in August. That's 1,946 clicks. Each square is 1 in every 100.")).toBeInTheDocument();
    expect(screen.queryByText(/All your clicks/)).not.toBeInTheDocument();
    expect(screen.getAllByText("What Google shows, and what gets clicked").length).toBeGreaterThan(0);
  });

  it("the table is lean: Category and five figures, one line a row, opening Pages for each Classification", async () => {
    render(<SearchConsoleDemandPage />);
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent?.trim())).toEqual(["Category", "Shown", "Up or down", "Clicks", "Up or down", "Pages"]);
    expect(within(table).getByText("Category")).toHaveAttribute("title", "Classification");
    expect(screen.getByText("13 classifications")).toBeInTheDocument();
    // The most impressions first, a move that didn't move said so.
    expect(cells("Cupboard Handles")).toEqual(["Cupboard Handles", "120,229", "▲ 3,984", "462", "▼ 133", "636"]);
    expect(cells("Locks")[4]).toBe("The same");
    expect(within(rowOf("Cupboard Handles")).getByRole("link", { name: "Cupboard Handles" })).toHaveAttribute("href", "/app/search-console/site_1/pages?kind=cupboard");
    expect(within(rowOf("Unclassified")).getByRole("link", { name: "Unclassified" })).toHaveAttribute("title", "Pages not in a Classification yet");
  });

  it("another home country chosen: its pages asked of Google, the dates and the dates before, and every figure its own", async () => {
    nav.search = "country=moz";
    render(<SearchConsoleDemandPage />);
    await waitFor(() => expect(liveAsks).toEqual([{ siteId: "site_1", from: "2026-08-01", to: "2026-08-31", period: "lastMonth", country: "moz" }]));
    expect(await screen.findByText("2 classifications")).toBeInTheDocument();
    expect(within(box("Clicks")).getByText("30")).toBeInTheDocument();
    expect(cells("Blog")).toEqual(["Blog", "900", "▲ 200", "15", "▲ 9", "4"]);
  });

  it("pages asked of Google that stopped at Google's most say so once, beside the table's count; a whole list says nothing", async () => {
    nav.search = "country=moz";
    const { unmount } = render(<SearchConsoleDemandPage />);
    expect(await screen.findByText("2 classifications")).toBeInTheDocument();
    expect(screen.queryByText(/Google gives at most/)).not.toBeInTheDocument();
    unmount();
    liveCut = 50_000;
    render(<SearchConsoleDemandPage />);
    expect(await screen.findByText("Google gives at most 50,000 pages in August. Some pages with few clicks aren't counted here.")).toBeInTheDocument();
    expect(screen.getAllByText(/Google gives at most/)).toHaveLength(1);
  });

  it("is named Classifications in the section's menu", async () => {
    render(<SearchConsoleMenu siteId="site_1" />);
    expect((await screen.findAllByText("Classifications")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Demand by Classification")).not.toBeInTheDocument();
    expect(screen.queryByText("Demand by service")).not.toBeInTheDocument();
  });

  it("holds to its approved look", async () => {
    const { container } = render(<SearchConsoleDemandPage />);
    await screen.findByRole("table");
    await screen.findAllByText("Cupboard Handles");
    await expectApprovedLook(container, "search-console-demand-by-classification-way-2", "Way2", "Search Console → Demand by Classification");
  });
});
