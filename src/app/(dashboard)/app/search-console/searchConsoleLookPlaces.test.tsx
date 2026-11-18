import { cleanup, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { useScreenDay } from "@/src/test/realTime";
import { convexPath } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { ROW, STATUS } from "@/src/test/searchConsoleFixtures";
import SearchConsolePlacesPage from "./[siteId]/countries-and-devices/page";

/**
 * Countries and devices, as Anthony chose it on 18 November 2026 (the canvas's Way 1;
 * search-console-countries-and-devices-way-1-plan-2026-11-18.md): every figure follows the country chosen in the menu.
 * The four boxes are about it, the devices are its own under a title naming it, and the chart opens on the three busiest
 * countries after it, each with its dates before as a dashed line once asked. The countries table lists every country.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1/countries-and-devices", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/** A country's or a device's row, as the lists send it, with its clicks in the dates before. */
const place = (key: string, clicks: number, previousClicks: number | null, impressions = clicks * 100) => ({
  ...ROW, key, clicks, impressions, ctr: clicks / impressions, position: 9.5, previousClicks, change: previousClicks === null ? null : clicks - previousClicks,
  tracked: false, top: null, count: null, brand: null,
});
/** More Handles' October against September, cut to a few countries: the United Kingdom first, Mozambique kept ready beside it. */
const COUNTRIES = [
  place("gbr", 7124, 7518), place("usa", 319, 419), place("irl", 285, 332), place("aus", 108, 105), place("can", 82, 90), place("fra", 35, 35),
  place("moz", 20, 10), place("deu", 0, null, 3140),
];
const SPLIT = { preparing: false, current: true, named: 0, listed: 0, comparable: true, live: false, from: null, to: null };
const SUMMARY = { clicks: 7973, beforeTotals: { clicks: 8540, impressions: 900_000, position: 10.9 }, clickedRows: 7, clickedBefore: 9 };
const DEVICES: Record<string, unknown[]> = {
  gbr: [place("MOBILE", 4014, 4249), place("DESKTOP", 2824, 2987), place("TABLET", 286, 282)],
  moz: [place("MOBILE", 15, 6), place("DESKTOP", 5, 4)],
};
const DAYS = [{ day: "2026-08-30", clicks: 4, impressions: 250, ctr: 0.016, position: 6 }, { day: "2026-08-31", clicks: 5, impressions: 260, ctr: 0.019, position: 5.8 }];
const SERIES = { ok: true, days: DAYS, daysBefore: DAYS, totals: { clicks: 9, impressions: 510, ctr: 0.018, position: 5.9 }, previous: { clicks: 7, impressions: 480, ctr: 0.015, position: 6.1 }, previousHeld: true };

let splitAsks: Array<Record<string, unknown>> = [];
let seriesAsks: Array<Record<string, unknown>> = [];

function answer() {
  vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const name = convexPath(reference);
    if (name.endsWith("searchConsoleStatus")) return STATUS;
    if (name.endsWith("searchConsoleCountryChoices")) return { main: "gbr", ready: ["moz"] };
    if (name.endsWith("searchConsoleSplitList")) {
      const ask = args as Record<string, unknown>;
      splitAsks.push(ask);
      if (ask.dimension === "country") return { ...SPLIT, rows: COUNTRIES, summary: SUMMARY };
      return { ...SPLIT, rows: DEVICES[(ask.country as string | undefined) ?? "gbr"] ?? [], summary: null };
    }
    return undefined;
  }) as never);
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation(((reference: unknown) => {
    if (convexPath(reference).endsWith("searchConsoleKeySeries")) {
      return vi.fn((ask: Record<string, unknown>) => { seriesAsks.push(ask); return Promise.resolve(SERIES); });
    }
    return vi.fn(() => new Promise(() => undefined));
  }) as never);
}

beforeEach(() => {
  // A fixed day, the one after the fixtures' newest: Last month is August, set against July.
  useScreenDay("2026-09-27");
  splitAsks = [];
  seriesAsks = [];
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

/** A box, by its label: its value and the line under it. */
function box(label: string) {
  // "Clicks" is a table heading and a menu choice too: the box is the one inside a figure.
  const title = screen.getAllByText(label).find((one) => one.closest("[data-part='figure']"));
  return title?.closest("[data-part='figure']") as HTMLElement;
}

describe("Countries and devices, Way 1", () => {
  it("the four boxes are about the country chosen, each against the dates before, and no line says how they are counted", async () => {
    render(<SearchConsolePlacesPage />);
    await screen.findByText("In the United Kingdom");
    expect(within(box("Clicks")).getByText("7,124")).toBeInTheDocument();
    expect(within(box("Clicks")).getByText("In the United Kingdom")).toBeInTheDocument();
    expect(within(box("Clicks")).getByText("▼ 5% fewer than July")).toBeInTheDocument();
    // 7,124 of 7,973 clicks is 89 in 100; 7,518 of 8,540 was 88.
    expect(within(box("Out of every 100 clicks")).getByText("89")).toBeInTheDocument();
    expect(within(box("Out of every 100 clicks")).getByText("▲ 1 more than July")).toBeInTheDocument();
    expect(within(box("From other countries")).getByText("849")).toBeInTheDocument();
    expect(within(box("From other countries")).getByText("▼ 17% fewer than July")).toBeInTheDocument();
    expect(within(box("Countries with a click")).getByText("7 of 8")).toBeInTheDocument();
    expect(within(box("Countries with a click")).getByText("▼ 2 fewer than July")).toBeInTheDocument();
    expect(screen.queryByText(/count every country/i)).not.toBeInTheDocument();
    // Every country, whatever the country chosen; the devices in the country chosen.
    expect(splitAsks.filter((ask) => ask.dimension === "country").every((ask) => !("country" in ask))).toBe(true);
    expect(splitAsks.filter((ask) => ask.dimension === "device").at(-1)).not.toHaveProperty("country");
    expect(screen.getByText("Devices in the United Kingdom")).toBeInTheDocument();
  });

  it("another home country chosen: the boxes and the devices follow it, and the countries table still lists every country", async () => {
    nav.search = "country=moz";
    render(<SearchConsolePlacesPage />);
    await screen.findByText("In Mozambique");
    expect(within(box("Clicks")).getByText("20")).toBeInTheDocument();
    expect(within(box("Clicks")).getByText("▲ 100% more than July")).toBeInTheDocument();
    expect(within(box("From other countries")).getByText("7,953")).toBeInTheDocument();
    expect(screen.getByText("Devices in Mozambique")).toBeInTheDocument();
    expect(splitAsks.filter((ask) => ask.dimension === "device").at(-1)).toMatchObject({ country: "moz" });
    expect(screen.getByText("United Kingdom")).toBeInTheDocument();
    // The chart opens on the three busiest after the one chosen: here the United Kingdom is among them.
    await waitFor(() => expect(seriesAsks.map((ask) => ask.key)).toEqual(["gbr", "usa", "irl"]));
  });

  it("the chart opens with the three busiest countries after the one chosen ticked, each asked of Google once, its own days", async () => {
    render(<SearchConsolePlacesPage />);
    await screen.findByText("Clicks each day");
    const ticked = screen.getAllByRole("checkbox").filter((one) => (one as HTMLInputElement).checked);
    expect(ticked).toEqual(["United States", "Ireland", "Australia"].map((name) => screen.getByRole("checkbox", { name: `Draw ${name} on the chart` })));
    await waitFor(() => expect(seriesAsks).toHaveLength(3));
    expect(seriesAsks.map((ask) => [ask.dimension, ask.key, ask.country])).toEqual([["country", "usa", undefined], ["country", "irl", undefined], ["country", "aus", undefined]]);
    expect(await screen.findByText("The three countries you've ticked in the table, in August.")).toBeInTheDocument();
    expect(screen.getByText("3 of 5 on the chart")).toBeInTheDocument();
  });

  it("Compare with lays each ticked country's dates before under it, dashed", async () => {
    // The menu keeps its choice in the address, as every chart's does.
    nav.search = "against=before";
    render(<SearchConsolePlacesPage />);
    expect(await screen.findByText("The three countries you've ticked in the table, in August. The dashed lines are July, lined up by date.")).toBeInTheDocument();
  });

  it("each table is lean: the name and five figures, the tick box besides; a move that didn't move says so", async () => {
    render(<SearchConsolePlacesPage />);
    await screen.findByText("United States");
    const [countries, devices] = screen.getAllByRole("table");
    const headings = (table: HTMLElement) => within(table).getAllByRole("columnheader").map((cell) => cell.textContent?.trim()).filter(Boolean);
    // The tick box's column is named only for whoever is listening.
    expect(headings(countries)).toEqual(["On the chart", "Country", "Clicks", "Up or down", "Shown", "CTR", "Position"]);
    expect(headings(devices)).toEqual(["Device", "Clicks", "Up or down", "Shown", "CTR", "Position"]);
    expect(within(countries).getByText("The same")).toBeInTheDocument();
    expect(within(devices).getByText("▼ 235")).toBeInTheDocument();
  });

  it("holds to its approved look", async () => {
    const { container } = render(<SearchConsolePlacesPage />);
    await screen.findByText("Clicks each day");
    await screen.findByText("Mobile");
    await expectApprovedLook(container, "search-console-countries-and-devices-way-1", "Way1", "Search Console → Countries and devices");
  });
});
