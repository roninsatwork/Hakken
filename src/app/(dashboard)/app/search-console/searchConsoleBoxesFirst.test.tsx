import { cleanup, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { useScreenDay } from "@/src/test/realTime";
import { convexPath } from "@/src/test/siteViewFixtures";
import { STATUS, TRACKING } from "@/src/test/searchConsoleFixtures";
import { savingNow } from "@/src/lib/leaveWarning";
import SearchConsoleDemandPage from "./[siteId]/demand-by-service/page";
import SearchConsolePagesPage from "./[siteId]/pages/page";

/**
 * Each part of Pages and Demand by Classification shows as soon as its own figures are in (speed fixes, 18 November
 * 2026): the four boxes are Performance's read, about 50 ms, and never wait for Google's answer to the list, which can
 * take seconds. The parts drawn from Google's answer wait where they are.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1/pages", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/** The United Kingdom's own figures, Performance's read. */
const FIGURES = {
  live: false, days: [], daysBefore: [], named: null, previousDays: 31,
  totals: { clicks: 7124, impressions: 842984, ctr: 7124 / 842984, position: 12.16 },
  previous: { clicks: 7518, impressions: 821376, ctr: 7518 / 821376, position: 11.67 },
};

/** The live asks sent, by name: none ever answers, as Google still thinking. */
let asked: string[] = [];

function answer() {
  vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const name = convexPath(reference);
    if (name.endsWith("searchConsoleStatus")) return STATUS;
    if (name.endsWith("searchConsoleCountryChoices")) return { main: "gbr", ready: [] };
    if (name.endsWith("pageKindChoices")) return null;
    if (name.endsWith("searchConsoleTracking")) return TRACKING;
    if (name.endsWith("searchConsolePerformance")) return FIGURES;
    // The main country's pages aren't kept for these dates yet: both screens ask Google.
    if (name.endsWith("searchConsoleDemand")) return { live: true };
    if (name.endsWith("searchConsoleListPage")) {
      return { rows: [], total: 0, page: 1, pages: 0, size: 25, cut: null, preparing: false, current: true, named: null, listed: 0, comparable: false, live: true, from: null, to: null, summary: null };
    }
    return undefined;
  }) as never);
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation(((reference: unknown) => {
    const name = convexPath(reference);
    return vi.fn(() => {
      asked.push(name);
      return new Promise(() => undefined);
    });
  }) as never);
}

beforeEach(() => {
  // A fixed day, the one after the fixtures' newest: Last month is August, set against July.
  useScreenDay("2026-09-27");
  asked = [];
  nav.search = "";
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

describe("the boxes show before Google answers", () => {
  it("Pages: the four boxes are in while its list is still asked of Google, and the table waits where it is", async () => {
    nav.pathname = "/app/search-console/site_1/pages";
    render(<SearchConsolePagesPage />);
    expect(await screen.findByText("7,124")).toBeInTheDocument();
    expect(within(box("Clicks")).getByText("▼ 5% fewer than July")).toBeInTheDocument();
    expect(asked.some((name) => name.endsWith("searchConsoleLiveList"))).toBe(true);
    // The table is there, waiting: its rows come with Google's answer.
    expect(screen.getByRole("table")).toBeInTheDocument();
    // Leaving now asks nothing: the page is only reading from Google.
    expect(savingNow({ inflightMutations: 0, inflightActions: asked.length })).toBe(false);
  });

  it("Demand by Classification: the four boxes are in while its pages are still asked of Google", async () => {
    nav.pathname = "/app/search-console/site_1/demand-by-service";
    render(<SearchConsoleDemandPage />);
    expect(await screen.findByText("7,124")).toBeInTheDocument();
    expect(within(box("Average position")).getByText("▼ 0.5 places worse than July")).toBeInTheDocument();
    expect(asked.some((name) => name.endsWith("searchConsoleLiveDemand"))).toBe(true);
  });
});
