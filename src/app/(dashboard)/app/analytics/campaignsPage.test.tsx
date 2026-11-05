import { cleanup, fireEvent, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useAction, useMutation, useQuery } from "convex/react";

import { convexPath } from "@/src/test/siteViewFixtures";
import { ROW, STATUS, list } from "@/src/test/googleAnalyticsFixtures";
import AnalyticsCampaignsPage from "./[siteId]/campaigns/page";
import { boxedCampaigns } from "./_components/CampaignParts";
import { openHakkenSees } from "@/src/test/openHakkenSees";
import { resetSees } from "@/src/ui/components/screens/hakkenSeesStore";

/**
 * What each control on Campaigns means (docs/plans/active/campaigns-new-page-plan-2026-11-05.md, step 10; Anthony, 2026-11-05: "don't you
 * test these things"): every menu is held to the figures it should bring, not only to having moved. The day chart and the map are stood in
 * for, so a test can read the figures handed to them; every part they're drawn with has tests of its own.
 */

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/analytics/site_1/campaigns",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/ui/components/screens/DaysChart", async (real) => {
  const { ExplorerToolbar } = await import("@/src/ui/components/screens/ChartExplorer");
  return {
    ...(await real<object>()),
    DaysChart: ({ title, lines, controls }: { title: string; lines: unknown; controls: never[] }) => (
      <section aria-label="the day chart" data-lines={JSON.stringify(lines)}><h3>{title}</h3><ExplorerToolbar controls={controls} /></section>
    ),
  };
});
vi.mock("@/src/ui/components/screens/PageMap", async (real) => ({
  ...(await real<object>()),
  PageMap: ({ boxes }: { boxes: unknown }) => <div aria-label="the map" data-boxes={JSON.stringify(boxes)} />,
}));

const FIELD = "\u001f";
const row = (label: string, source: string, cameFrom: string, visits: number, visitsBefore: number, bought: number, boughtBefore: number, conversions: number, conversionsBefore: number) => ({
  ...ROW, key: `${label}${FIELD}${source}`, label, source, cameFrom, visits, visitsBefore, purchases: bought, purchasesBefore: boughtBefore, conversions, conversionsBefore, value: 0, bounceRate: 0.25, change: (visits - visitsBefore) / visitsBefore,
});
const ZOMBIES = row("Performance Max > Zombies", "google / cpc", "googleAds", 4097, 4135, 162, 161, 3542, 3807);
const BRAND = row("Brand > More Handles", "google / cpc", "googleAds", 1141, 1200, 113, 101, 1922, 1800);
const NO_NAME = row("52536031490414", "fb / paid", "facebookAd", 359, 300, 0, 2, 41, 30);
const ROWS = [ZOMBIES, BRAND, NO_NAME];
const TOTALS = { visits: 5597, visitsBefore: 5635, engaged: 4000, engagedBefore: 4100, bought: 275, boughtBefore: 264, conversions: 5505, conversionsBefore: 5637 };
const OVERVIEW = { now: { visits: 10000, purchases: 500, conversions: 11000, views: 1, engaged: 1, people: 1, value: 0 }, before: { visits: 12000, purchases: 400, conversions: 10000, views: 1, engaged: 1, people: 1, value: 0 }, changedMost: [] };
const point = (day: string, visits: number, engaged: number, conversions: number, bought: number) => ({ day, visits, engaged, conversions, bought });
const CHART = {
  live: false,
  points: [point("2026-10-01", 100, 60, 90, 8), point("2026-10-02", 200, 150, 170, 14)],
  before: { drawn: true, shift: 30, points: [point("2026-09-01", 80, 40, 70, 5), point("2026-09-02", 90, 70, 75, 6)] },
};
const ACTIONS = {
  live: false,
  events: ["add_to_cart", "purchase"],
  rows: [
    { key: ZOMBIES.key, label: ZOMBIES.label, cameFrom: "googleAds", visits: 4097, times: [2372, 162], visitsDid: [715, 162] },
    { key: BRAND.key, label: BRAND.label, cameFrom: "googleAds", visits: 1141, times: [1200, 113], visitsDid: [300, 113] },
  ],
};

type Reads = { rows?: typeof ROWS; totals?: typeof TOTALS; overview?: unknown; chart?: unknown; actions?: unknown };
let asked: Array<{ path: string; args: Record<string, unknown> }> = [];

function open(search = "", reads: Reads = {}) {
  nav.search = search;
  const rows = reads.rows ?? ROWS;
  // The same ask has the same answer, as Convex keeps it: the screens hold on to it from one draw to the next.
  const kept = new Map<string, unknown>();
  vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const path = convexPath(reference);
    asked.push({ path, args: args as Record<string, unknown> });
    if (path.endsWith("googleAnalyticsStatus")) return STATUS;
    if (path.endsWith("analyticsOverview")) return reads.overview ?? OVERVIEW;
    if (path.endsWith("analyticsCampaignChart")) return reads.chart ?? CHART;
    if (path.endsWith("analyticsCampaignActions")) return reads.actions ?? ACTIONS;
    if (path.endsWith("analyticsListPage")) {
      const { sort, list: which } = args as { sort?: string; list?: string };
      const figure = (one: (typeof ROWS)[number]) => (sort === "bought" ? one.purchases : sort === "conversions" ? one.conversions : one.visits);
      const sorted = [...rows].sort((left, right) => figure(right) - figure(left));
      const ask = JSON.stringify(args);
      if (!kept.has(ask)) kept.set(ask, list(sorted, { untagged: 4403, total: rows.length, cameFromChoices: [{ cameFrom: "googleAds", visits: 5238 }, { cameFrom: "facebookAd", visits: 359 }], ...(which === "campaign" ? { campaignTotals: reads.totals ?? TOTALS } : {}) }));
      return kept.get(ask);
    }
    return undefined;
  }) as never);
  return render(<AnalyticsCampaignsPage />);
}

/** The figures handed to the day chart, by each line's name. */
function linesDrawn() {
  const lines = JSON.parse(screen.getByLabelText("the day chart").getAttribute("data-lines")!) as Array<{ key: string; points: Array<{ day: string; value: number }> }>;
  return Object.fromEntries(lines.map((line) => [line.key, line.points.map((one) => one.value)]));
}
const boxesDrawn = () => JSON.parse(screen.getByLabelText("the map").getAttribute("data-boxes")!) as Array<{ name: string; now: number; before: number | null; figure: string }>;
const figure = (label: string) => screen.getByText(label).parentElement!.parentElement!.textContent;

beforeEach(() => {
  useScreenDay("2026-11-05");
  asked = [];
  nav.replace.mockReset();
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the four boxes", () => {
  it("say what campaigns brought and their share of the whole website, against the dates before", () => {
    open();
    expect(figure("Visits from campaigns")).toContain("5,597");
    expect(figure("Share of all your visits")).toContain("56.0%");
    expect(figure("Share of all your visits")).toContain("47.0%");
    expect(figure("Bought from campaigns")).toContain("275");
    expect(figure("Share of everything bought")).toContain("55.0%");
    expect(figure("Share of everything bought")).toContain("66.0%");
  });

  it("speak in conversions for a website that has never sold anything, and the table has no Bought", () => {
    open("", { overview: { ...OVERVIEW, now: { ...OVERVIEW.now, purchases: 0 }, before: { ...OVERVIEW.before, purchases: 0 } } });
    expect(screen.queryByText("Bought from campaigns")).toBeNull();
    expect(figure("Conversions from campaigns")).toContain("5,505");
    expect(figure("Share of all your conversions")).toContain("50.0%");
    expect(within(screen.getByRole("table")).queryByText("Bought")).toBeNull();
  });
});

describe("the day chart", () => {
  it("Show changes what's drawn: visits, bought, conversions, or those who left straight away", () => {
    const { unmount } = open();
    expect(linesDrawn()).toEqual({ now: [100, 200], before: [80, 90] });
    expect(screen.getByText("Visits from campaigns each day")).toBeTruthy();
    unmount();
    const second = open("show=bought");
    expect(linesDrawn()).toEqual({ now: [8, 14], before: [5, 6] });
    expect(screen.getByText("Bought from campaigns each day")).toBeTruthy();
    second.unmount();
    const third = open("show=conversions");
    expect(linesDrawn()).toEqual({ now: [90, 170], before: [70, 75] });
    third.unmount();
    open("show=left");
    expect(linesDrawn()).toEqual({ now: [40, 50], before: [40, 20] });
    expect(screen.getByText("People who left straight away, each day")).toBeTruthy();
  });

  it("the dates before are laid on the same days, and Compare with takes them away", () => {
    open();
    const before = () => (JSON.parse(screen.getByLabelText("the day chart").getAttribute("data-lines")!) as Array<{ key: string; points: Array<{ day: string }> }>).find((line) => line.key === "before");
    expect(before()!.points.map((one) => one.day)).toEqual(["2026-10-01", "2026-10-02"]);
    fireEvent.change(within(screen.getByLabelText("the day chart")).getByLabelText("Compare with"), { target: { value: "none" } });
    expect(linesDrawn()).toEqual({ now: [100, 200] });
  });

  it("offers no comparison when the dates before aren't held day by day", () => {
    open("", { chart: { ...CHART, before: { ...CHART.before, drawn: false } } });
    expect(linesDrawn()).toEqual({ now: [100, 200] });
    expect(within(screen.getByLabelText("the day chart")).queryByLabelText("Compare with")).toBeNull();
  });

  it("a website that sells nothing is never left on Bought, even from an old link", () => {
    open("show=bought", { overview: { ...OVERVIEW, now: { ...OVERVIEW.now, purchases: 0 }, before: { ...OVERVIEW.before, purchases: 0 } } });
    expect(linesDrawn().now).toEqual([100, 200]);
    const menu = within(screen.getByLabelText("the day chart")).getByLabelText("Show");
    expect(within(menu).queryByText("Bought")).toBeNull();
  });
});

describe("the map", () => {
  it("Count changes the read's order and every box's figures, with its own dates before", () => {
    const { unmount } = open();
    expect(boxesDrawn().map((box) => [box.name, box.now, box.before])).toEqual([["Performance Max > Zombies", 4097, 4135], ["Brand > More Handles", 1141, 1200], ["Facebook ad with no name", 359, 300]]);
    unmount();
    const second = open("count=bought");
    expect(asked.some((one) => one.path.endsWith("analyticsListPage") && one.args.sort === "bought" && one.args.rows === 40)).toBe(true);
    // Nothing bought is no box.
    expect(boxesDrawn().map((box) => [box.name, box.now, box.before])).toEqual([["Performance Max > Zombies", 162, 161], ["Brand > More Handles", 113, 101]]);
    expect(screen.getByText(/leaves out one smaller campaign/)).toBeTruthy();
    second.unmount();
    open("count=conversions");
    expect(boxesDrawn().map((box) => [box.name, box.now, box.before])).toEqual([["Performance Max > Zombies", 3542, 3807], ["Brand > More Handles", 1922, 1800], ["Facebook ad with no name", 41, 30]]);
  });

  it("a box too small to see is left out, and the most it could have had is said", () => {
    // One in 500 of 5,019 is 10.04: 10 is too small, and 11 has a box.
    expect(boxedCampaigns([{ n: 5000 }, { n: 11 }, { n: 10 }, { n: 0 }], (one) => one.n, 5021).map((one) => one.n)).toEqual([5000, 11]);
    expect(boxedCampaigns([{ n: 3 }, { n: 2 }, { n: 1 }], (one) => one.n, 6, 2).map((one) => one.n)).toEqual([3, 2]);
  });
});

describe("what people did after they arrived", () => {
  /** The card itself: from its title up to the first thing holding its squares. */
  const squares = () => {
    let at = screen.getByText("What people did after they arrived") as HTMLElement;
    while (!at.querySelector('[data-part="conversions-map"]') && at.parentElement) at = at.parentElement;
    return at;
  };

  it("Count leads each square with the times, those for every 100 visits, or the conversion rate", () => {
    const first = open();
    expect(squares().textContent).toContain("2,372");
    expect(squares().textContent).toContain("58 per 100");
    first.unmount();
    const second = open("squares=per100");
    expect(squares().textContent).toContain("58");
    expect(squares().textContent).toContain("2,372 times");
    second.unmount();
    open("squares=rate");
    // 715 of Zombies' 4,097 visits added to the basket. It counts each visit once, so it can't pass 100%.
    expect(squares().textContent).toContain("17.5%");
    expect(squares().textContent).toContain("715 visits");
    expect(squares().textContent).toContain("26.3%");
    expect(squares().textContent).not.toContain("2,372");
  });

  it("the menu offers the three, and choosing one is kept in the address", () => {
    open();
    const menu = within(squares()).getByLabelText("Count");
    expect(within(menu).getAllByRole("option").map((option) => option.textContent)).toEqual(["Number of times", "For every 100 visits", "Conversion rate %"]);
    fireEvent.change(menu, { target: { value: "rate" } });
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(String(nav.replace.mock.calls[0][0])).toContain("squares=rate");
  });

  it("saved figures with only the times offer no rate, rather than passing the times off as one", () => {
    open("squares=rate", { actions: { ...ACTIONS, rows: ACTIONS.rows.map((one) => ({ ...one, visitsDid: [null, null] })) } });
    expect(squares().textContent).toContain("2,372");
    expect(squares().textContent).not.toMatch(/\d%/);
    const menu = within(squares()).getByLabelText("Count");
    expect(within(menu).getAllByRole("option").map((option) => option.textContent)).toEqual(["Number of times", "For every 100 visits"]);
  });
});

describe("Came from", () => {
  it("holds the whole page to one place: the boxes, the chart, the map, the squares and the table all ask for it", () => {
    open("cameFrom=googleAds");
    const of = (name: string) => asked.filter((one) => one.path.endsWith(name));
    expect(of("analyticsListPage").length).toBeGreaterThanOrEqual(3);
    expect(of("analyticsListPage").every((one) => one.args.cameFrom === "googleAds")).toBe(true);
    expect(of("analyticsCampaignChart").every((one) => one.args.cameFrom === "googleAds")).toBe(true);
    expect(of("analyticsCampaignActions").every((one) => one.args.cameFrom === "googleAds")).toBe(true);
    // The whole website's own figures stay the whole website's, for the share.
    expect(of("analyticsOverview").every((one) => !("cameFrom" in one.args))).toBe(true);
  });

  it("asks for everywhere when nothing's chosen, and its menu lists the places in plain words", () => {
    open();
    expect(asked.filter((one) => one.path.endsWith("analyticsListPage")).every((one) => !("cameFrom" in one.args))).toBe(true);
    const menu = screen.getByLabelText("Came from");
    expect(within(menu).getAllByRole("option").map((option) => option.textContent)).toEqual(["Everywhere", "Google Ads", "Facebook ad"]);
  });
});

describe("the table", () => {
  it("says each campaign's name and where its link was in plain words, its visits against the dates before, what it sold and its conversions", () => {
    open();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Facebook ad with no name")).toBeTruthy();
    expect(within(table).getAllByText("Google Ads")).toHaveLength(2);
    const zombies = within(table).getByText("Performance Max > Zombies").closest("tr")!;
    for (const words of ["4,097", "4,135", "162", "3,542"]) expect(zombies.textContent).toContain(words);
  });

  it("Ad keywords reads the other list, with nothing about where a link was, and says how many visits had no keyword", () => {
    open("view=adKeyword");
    const lists = asked.filter((one) => one.path.endsWith("analyticsListPage")).map((one) => one.args.list);
    expect(lists).toContain("adKeyword");
    expect(within(screen.getByRole("table")).queryByText("Came from")).toBeNull();
    expect(screen.queryByLabelText("Came from")).toBeNull();
    expect(screen.getByText(/4,403/)).toBeTruthy();
  });
});

describe("the eye", () => {
  const askSees = vi.fn(async () => ({ key: "k", status: "RESEARCHING" as const }));
  const none = { visits: 0, visitsBefore: 0, engaged: 0, engagedBefore: 0, bought: 0, boughtBefore: 0, conversions: 0, conversionsBefore: 0 };
  beforeEach(() => {
    resetSees();
    askSees.mockClear();
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => (convexPath(reference).endsWith("askSees") ? askSees : vi.fn())) as never);
  });

  it("asks the team to write when there are campaigns to write about", async () => {
    open();
    await openHakkenSees();
    await waitFor(() => expect(askSees).toHaveBeenCalledTimes(1));
    const asked = askSees.mock.calls[0] as unknown as [{ data: { rows: Array<Record<string, unknown>> } }];
    // Only what the page shows: never time on the website, people or page views, however much the list holds.
    expect(asked[0].data.rows[0]).toMatchObject({ label: "Performance Max > Zombies", source: "Google Ads", visits: 4097 });
    expect(asked[0].data.rows[0]).not.toHaveProperty("views");
    expect(asked[0].data.rows[0]).not.toHaveProperty("timePerVisit");
    expect(asked[0].data.rows[0]).not.toHaveProperty("people");
  });

  it("with no campaign in these dates, says so at once and asks nobody to write", async () => {
    open("", { rows: [], totals: none, chart: { live: false, points: [], before: null }, actions: { live: false, events: [], rows: [] } });
    await openHakkenSees();
    expect(screen.getAllByText(/All campaign visits/).length).toBeGreaterThan(0);
    expect(askSees).not.toHaveBeenCalled();
  });
});

describe("how many campaigns a website has", () => {
  it("one: everything draws", () => {
    open("", { rows: [ZOMBIES], totals: { ...TOTALS, visits: 4097 }, actions: { ...ACTIONS, rows: [ACTIONS.rows[0]] } });
    expect(boxesDrawn()).toHaveLength(1);
    expect(linesDrawn().now).toEqual([100, 200]);
    expect(screen.getByText("What people did after they arrived")).toBeTruthy();
  });

  it("none: four boxes at nought and one line in place of the charts, with no how-to", () => {
    const none = { visits: 0, visitsBefore: 0, engaged: 0, engagedBefore: 0, bought: 0, boughtBefore: 0, conversions: 0, conversionsBefore: 0 };
    open("", { rows: [], totals: none, chart: { live: false, points: [], before: null }, actions: { live: false, events: [], rows: [] } });
    expect(figure("Visits from campaigns")).toContain("0");
    expect(figure("Share of all your visits")).toContain("0.0%");
    expect(figure("Visits from campaigns")).toMatch(/None in .* either/);
    expect(screen.queryByLabelText("the day chart")).toBeNull();
    expect(screen.queryByLabelText("the map")).toBeNull();
    expect(screen.queryByText("What people did after they arrived")).toBeNull();
    expect(screen.getAllByText(/No visits came from a campaign in/).length).toBeGreaterThan(0);
  });
});
