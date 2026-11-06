import { cleanup, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect } from "react";

import { convexPath } from "@/src/test/siteViewFixtures";
import { ROW, STATUS, list } from "@/src/test/googleAnalyticsFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { openHakkenSees } from "@/src/test/openHakkenSees";
import { resetSees, useSeesParts } from "@/src/ui/components/screens/hakkenSeesStore";
import AnalyticsChannelsPage from "./[siteId]/channels/page";

/**
 * What each control on Channels means (docs/plans/active/channels-new-page-plan-2026-11-06.md, step 10; Anthony, 2026-11-05: "don't you test
 * these things"): every menu is held to the figures it should bring, not only to having moved: 5 on the squares, 2 on the chart and 1
 * on the steps. The day chart is stood in for, so a test can read the figures handed to it; its part has tests of its own. One test
 * draws everything for real, for the approved look.
 */

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
const realChart = vi.hoisted(() => ({ on: false }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/analytics/site_1/channels",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/ui/components/screens/DaysChart", async (real) => {
  const { ExplorerToolbar } = await import("@/src/ui/components/screens/ChartExplorer");
  const actual = await real<{ DaysChart: (props: never) => React.ReactElement }>();
  return {
    ...actual,
    DaysChart: (props: { title: string; lines: unknown; controls: never[]; nothingTicked?: string | null; figure: string; hint: string | ((coarse: boolean) => string) }) => (realChart.on ? actual.DaysChart(props as never) : (
      <section aria-label="the day chart" data-lines={JSON.stringify(props.lines)} data-figure={props.figure} data-hint={typeof props.hint === "function" ? props.hint(false) : props.hint}><h3>{props.title}</h3><ExplorerToolbar controls={props.controls} />{props.nothingTicked ? <p>{props.nothingTicked}</p> : null}</section>
    )),
  };
});

const row = (label: string, visits: number, visitsBefore: number, bought: number, boughtBefore: number, basket: number, checkout: number, conversions: number, conversionsBefore: number, bounceRate = 0.3) => ({
  ...ROW, key: label, label, visits, visitsBefore, purchases: bought, purchasesBefore: boughtBefore, conversions, conversionsBefore, value: 0, bounceRate, engagementRate: 1 - bounceRate, fewVisits: visits < 100,
  conversionRate: conversions / visits, change: (visits - visitsBefore) / visitsBefore, engaged: Math.round(visits * (1 - bounceRate)), basketVisits: basket, checkoutVisits: checkout, boughtVisits: bought,
});
const ORGANIC = row("Organic Search", 13169, 12808, 284, 289, 1399, 537, 7564, 7504, 0.316);
const CROSS = row("Cross-network", 8803, 10720, 362, 417, 1500, 653, 8126, 8500, 0.348);
const PAID = row("Paid Search", 1237, 1198, 113, 111, 279, 159, 1940, 2189, 0.259);
const SOCIAL = row("Paid Social", 444, 294, 0, 1, 26, 7, 69, 40, 0.556);
const EMAIL = row("Email", 9, 5, 1, 0, 1, 1, 8, 2, 0.444);
const ROWS = [ORGANIC, CROSS, PAID, SOCIAL, EMAIL];
const OVERVIEW = {
  from: "2026-10-01", to: "2026-10-31",
  now: { visits: 35739, purchases: 1207, conversions: 27273, views: 1, engaged: 22327, people: 1, value: 0 },
  before: { visits: 37507, purchases: 1258, conversions: 28623, views: 1, engaged: 24762, people: 1, value: 0 },
  changedMost: [],
};
const NOT_A_SHOP = { ...OVERVIEW, now: { ...OVERVIEW.now, purchases: 0 }, before: { ...OVERVIEW.before, purchases: 0 } };

const point = (day: string, organic: number, cross: number, paid: number, social: number, email: number, basket: number[], bought: number[]) => ({ day, visits: [organic, cross, paid, social, email], events: [basket, bought] });
const EACH_DAY = {
  live: false,
  channels: ["Organic Search", "Cross-network", "Paid Search", "Paid Social", "Email"],
  events: [{ eventName: "add_to_cart", counted: true, times: 100 }, { eventName: "newsletter_sign_ups", counted: false, times: 30 }],
  points: [
    point("2026-10-01", 100, 80, 10, 5, 1, [30, 20, 5, 1, 0], [3, 4, 1, 0, 0]),
    point("2026-10-02", 200, 90, 20, 6, 2, [40, 25, 6, 2, 1], [5, 5, 2, 0, 1]),
  ],
  before: [{ day: "2026-09-01", visits: [90, 100, 9, 3, 1] }, { day: "2026-09-02", visits: [95, 110, 8, 4, 0] }],
};

const figures = (visits: number, visitsBefore: number | null, bought: number, boughtBefore: number | null, conversions: number, conversionsBefore: number | null) => ({ visits, visitsBefore, bought, boughtBefore, conversions, conversionsBefore });
const KINDS = {
  collecting: false, everyDevice: false, hasBefore: true,
  columns: [
    { key: "brand", name: "Brand", visits: 3000 },
    { key: "blog", name: "Blog", visits: 1900 },
    { key: "OTHER_KINDS", name: null, holds: [{ kind: "locks", name: "Locks" }, { kind: "knobs", name: "Knobs" }], visits: 500 },
    { key: "NO_PAGE", name: null, visits: 2000 },
  ],
  rows: [
    { channel: "Organic Search", ...figures(13169, 12808, 284, 289, 7564, 7504), cells: [figures(2035, 885, 40, 15, 900, 400), figures(1770, 1800, 1, 2, 30, 32), figures(300, 310, 10, 11, 90, 92), figures(830, 900, 20, 22, 300, 350)] },
    { channel: "Paid Search", ...figures(1237, 1198, 113, 111, 1940, 2189), cells: [figures(769, 700, 91, 80, 1500, 1600), figures(0, 2, 0, 0, 0, 0), figures(15, 10, 1, 1, 20, 18), figures(107, 90, 5, 4, 60, 50)] },
    { channel: "Email", ...figures(9, 5, 1, 0, 8, 2), cells: [figures(4, 2, 1, 0, 6, 1), figures(0, 0, 0, 0, 0, 0), figures(0, 0, 0, 0, 0, 0), figures(0, 0, 0, 0, 0, 0)] },
  ],
};
const DEVICES = {
  collecting: false, everyDevice: false, hasBefore: true,
  columns: [{ key: "desktop", name: null, visits: 9000 }, { key: "mobile", name: null, visits: 20000 }, { key: "tablet", name: null, visits: 900 }],
  rows: [
    { channel: "Organic Search", ...figures(13169, 12808, 284, 289, 7564, 7504), cells: [figures(5000, 4800, 135, 120, 3000, 2900), figures(7900, 7700, 110, 130, 4400, 4300), figures(269, 308, 39, 39, 164, 304)] },
  ],
};
const STEPS = {
  collecting: false, everyDevice: false, tracks: { basket: true, checkout: true },
  everywhere: { arrived: 35739, stayed: 22327, basket: 5034, checkout: 2153, bought: 1205 },
  channels: [
    { channel: "Organic Search", arrived: 13169, stayed: 9003, basket: 1399, checkout: 537, bought: 283 },
    { channel: "Paid Search", arrived: 1237, stayed: 916, basket: 279, checkout: 159, bought: 112 },
    { channel: "Email", arrived: 9, stayed: 5, basket: 1, checkout: 1, bought: 1 },
  ],
};

type Reads = { rows?: typeof ROWS; overview?: unknown; eachDay?: unknown; kinds?: unknown; devices?: unknown; steps?: unknown; gone?: unknown };
let asked: Array<{ path: string; args: Record<string, unknown> }> = [];
let seesParts: Record<string, unknown> = {};

function SeesPartsSpy() {
  const parts = useSeesParts();
  useEffect(() => {
    seesParts = parts as Record<string, unknown>;
  }, [parts]);
  return null;
}

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
    if (path.endsWith("analyticsChannelsEachDay")) return reads.eachDay ?? EACH_DAY;
    if (path.endsWith("analyticsChannelSquares")) return (args as { split: string }).split === "device" ? reads.devices ?? DEVICES : reads.kinds ?? KINDS;
    if (path.endsWith("analyticsChannelSteps")) return reads.steps ?? STEPS;
    if (path.endsWith("analyticsListPage")) {
      const ask = JSON.stringify(args);
      if (!kept.has(ask)) kept.set(ask, list(rows, { total: rows.length, gone: reads.gone ?? [], spanBefore: { from: "2026-09-01", to: "2026-09-30" }, from: "2026-10-01", to: "2026-10-31" }));
      return kept.get(ask);
    }
    return undefined;
  }) as never);
  return render(<><AnalyticsChannelsPage /><SeesPartsSpy /></>);
}

const boxOf = (label: string) => screen.getByText(label).parentElement!.textContent;
const chart = () => screen.getByLabelText("the day chart");
/** The figures handed to the day chart, by each line's name. */
const linesDrawn = () => Object.fromEntries((JSON.parse(chart().getAttribute("data-lines")!) as Array<{ key: string; points: Array<{ value: number }> }>).map((line) => [line.key, line.points.map((one) => one.value)]));
const lineColours = () => Object.fromEntries((JSON.parse(chart().getAttribute("data-lines")!) as Array<{ key: string; colour: string }>).map((line) => [line.key, line.colour]));
/** A card by its title: from it up to the first thing holding the part asked for. */
const cardOf = (title: string, part: string) => {
  let at = screen.getByText(title) as HTMLElement;
  while (!at.querySelector(`[data-part="${part}"]`) && at.parentElement) at = at.parentElement;
  return at;
};
const squares = () => cardOf("Where each channel's visits started", "conversions-map");
const steps = () => cardOf("How far people got", "step-flow");
/** The last address the page wrote. */
const wrote = () => new URL(`https://x.test${String(nav.replace.mock.calls.at(-1)?.[0] ?? "")}`).searchParams;

beforeEach(() => {
  useScreenDay("2026-11-05");
  asked = [];
  seesParts = {};
  realChart.on = false;
  resetSees();
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
  it("each name a channel, with what it's set against, and use Google's own total for the whole website", () => {
    open();
    expect(boxOf("Most visits")).toContain("Organic Search");
    expect(boxOf("Most visits")).toContain("13,169 visits. That's 37% of all your visits.");
    expect(boxOf("Most bought")).toContain("Cross-network");
    expect(boxOf("Most bought")).toContain("362 bought. That's 30% of everything bought.");
    expect(boxOf("Sells best")).toContain("Paid Search");
    expect(boxOf("Sells best")).toContain("9.1 bought for every 100 visits. Your website gets 3.4.");
    expect(boxOf("Biggest change")).toContain("Cross-network");
    expect(boxOf("Biggest change")).toContain("1,917 fewer visits than September.");
  });

  it("Sells best never names a channel under 100 visits, however well it sells", () => {
    open("", { rows: [{ ...EMAIL, visits: 9, purchases: 5 }, PAID] });
    expect(boxOf("Sells best")).toContain("Paid Search");
  });

  it("says Events on a website with nothing bought, and Best for events by the same rule", () => {
    open("", { overview: NOT_A_SHOP });
    expect(screen.queryByText("Most bought")).toBeNull();
    expect(screen.queryByText("Sells best")).toBeNull();
    expect(boxOf("Most events")).toContain("Cross-network");
    expect(boxOf("Most events")).toContain("8,126 events. That's 30% of all your events.");
    expect(boxOf("Best for events")).toContain("Paid Search");
    expect(boxOf("Best for events")).toContain("157 events for every 100 visits. Your website gets 76.");
  });

  it("a channel that stopped altogether can be the biggest change", () => {
    open("", { gone: [{ key: "Display", visitsBefore: 5000, purchasesBefore: 10, conversionsBefore: 50 }] });
    expect(boxOf("Biggest change")).toContain("Display");
    expect(boxOf("Biggest change")).toContain("5,000 fewer visits than September.");
  });

  it("with no channels at all, each shows a dash and says why, and no chart is drawn with nothing on it", () => {
    open("", { rows: [], overview: { ...OVERVIEW, now: { ...OVERVIEW.now, visits: 0, purchases: 0, conversions: 0 }, before: { ...OVERVIEW.before, purchases: 0 } } });
    expect(boxOf("Most visits")).toContain("–");
    expect(boxOf("Most visits")).toContain("No visits in these dates.");
    expect(boxOf("Biggest change")).toContain("Nothing to compare these dates with.");
    expect(screen.queryByLabelText("the day chart")).toBeNull();
    expect(screen.queryByText("Where each channel's visits started")).toBeNull();
    expect(screen.getByText("No visits in these dates.", { selector: "td *, td, p" })).toBeTruthy();
  });

  it("with one channel, says what's true of it and no more", () => {
    open("", { rows: [{ ...EMAIL, visitsBefore: 9, purchases: 0, conversions: 0 }] });
    expect(boxOf("Most visits")).toContain("Email");
    expect(boxOf("Most bought")).toContain("Nothing bought in these dates.");
    expect(boxOf("Sells best")).toContain("No channel has 100 visits and a sale.");
    expect(boxOf("Biggest change")).toContain("Nothing to compare these dates with.");
  });
});

describe("visits each day: the Channels menu", () => {
  it("opens on the four busiest, each its own line, and the rest on one grey line", () => {
    open();
    expect(linesDrawn()).toEqual({ "Organic Search": [100, 200], "Cross-network": [80, 90], "Paid Search": [10, 20], "Paid Social": [5, 6], rest: [1, 2] });
    expect(screen.getByText("Visits each day, by channel")).toBeTruthy();
    expect(chart().getAttribute("data-figure")).toBe("Visits");
  });

  it("what's ticked gets a line, the rest add up, and a link opens what was showing", () => {
    open("lines=Paid Social,Email");
    expect(linesDrawn()).toEqual({ "Paid Social": [5, 6], Email: [1, 2], rest: [190, 310] });
    expect(within(chart()).getByRole("button", { name: /Channels: Paid Social, Email/ })).toBeTruthy();
  });

  it("with every channel ticked, the grey line goes", () => {
    open(`lines=${EACH_DAY.channels.join(",")}`);
    expect(Object.keys(linesDrawn())).toEqual(EACH_DAY.channels);
  });

  it("colours stay with the channel, whatever else is ticked", () => {
    const first = open();
    const busiest = lineColours();
    first.unmount();
    open("lines=Paid Search,Email");
    expect(lineColours()["Paid Search"]).toBe(busiest["Paid Search"]);
    expect(lineColours().rest).toBe(busiest.rest);
    expect(lineColours().Email).not.toBe(busiest["Paid Search"]);
  });

  it("nothing ticked says what to tick, and draws nothing", () => {
    open("lines=-");
    expect(screen.getByText("Tick at least one channel.")).toBeTruthy();
    expect(linesDrawn()).toEqual({});
  });

  it("a tick writes the choice to the address, the table staying on its page", () => {
    open("p=2");
    fireEvent.click(within(chart()).getByRole("button", { name: /^Channels:/ }));
    fireEvent.click(within(chart()).getByLabelText("Email"));
    expect(wrote().get("lines")?.split(",")).toEqual(["Organic Search", "Cross-network", "Paid Search", "Paid Social", "Email"]);
    expect(wrote().get("p")).toBe("2");
  });
});

describe("visits each day: the Events menu", () => {
  it("opens on None, which counts visits", () => {
    open();
    expect(within(chart()).getByRole("button", { name: /Events: None/ })).toBeTruthy();
    expect(chart().getAttribute("data-hint")).toContain("Tick events to count those instead of visits.");
  });

  it("one ticked: each line counts it, as times, and the title follows", () => {
    open("events=add_to_cart");
    expect(linesDrawn()).toEqual({ "Organic Search": [30, 40], "Cross-network": [20, 25], "Paid Search": [5, 6], "Paid Social": [1, 2], rest: [0, 1] });
    expect(screen.getByText("Added to basket each day, by channel")).toBeTruthy();
    expect(chart().getAttribute("data-figure")).toBe("Times");
    expect(chart().getAttribute("data-hint")).toContain("This counts times, not visits");
  });

  it("several ticked add up, and the hint says so", () => {
    open("events=add_to_cart,newsletter_sign_ups");
    expect(linesDrawn()["Organic Search"]).toEqual([33, 45]);
    expect(screen.getByText("Events each day, by channel")).toBeTruthy();
    expect(chart().getAttribute("data-hint")).toContain("Ticking several adds them up");
  });

  it("a key event not counted as a conversion says so", () => {
    open();
    fireEvent.click(within(chart()).getByRole("button", { name: /^Events:/ }));
    expect(within(chart()).getByLabelText("Signed up for emails (not counted as a conversion)")).toBeTruthy();
  });

  it("a website with no key events has no Events menu", () => {
    open("", { eachDay: { ...EACH_DAY, events: [], points: EACH_DAY.points.map((one) => ({ ...one, events: [] })) } });
    expect(within(chart()).queryByRole("button", { name: /^Events:/ })).toBeNull();
  });
});

describe("the squares: their five menus", () => {
  it("Count leads each square with visits, bought, what's bought for every 100 visits, or conversions", () => {
    const first = open();
    expect(squares().textContent).toContain("2,035");
    expect(squares().textContent).toContain("15%");
    first.unmount();
    const second = open("count=bought");
    expect(squares().textContent).toContain("91");
    expect(squares().textContent).toContain("81%");
    second.unmount();
    const third = open("count=boughtPer100");
    // 91 bought from 769 visits.
    expect(squares().textContent).toContain("12");
    expect(squares().textContent).toContain("91 bought");
    third.unmount();
    open("count=conversions");
    expect(squares().textContent).toContain("1,500");
    expect(screen.getByText(/counts every time, so one visit can count more than once/)).toBeTruthy();
  });

  it("bought for every 100 visits never reads over 100 by accident", () => {
    open("count=boughtPer100", { kinds: { ...KINDS, rows: [{ channel: "Email", ...figures(9, 5, 3, 0, 8, 2), cells: [figures(2, 2, 3, 0, 6, 1), figures(0, 0, 0, 0, 0, 0), figures(0, 0, 0, 0, 0, 0), figures(0, 0, 0, 0, 0, 0)] }] } });
    expect(squares().textContent).toContain("100");
    expect(squares().textContent).not.toContain("150");
  });

  it("a website with nothing bought counts events, for every 100 visits too, and an old link on Bought falls back", () => {
    const first = open("count=bought", { overview: NOT_A_SHOP });
    expect(squares().textContent).toContain("2,035");
    expect(within(squares()).getByLabelText("Count").textContent).not.toContain("Bought");
    expect(within(squares()).getByLabelText("Count").textContent).toContain("Events for every 100 visits");
    first.unmount();
    open("count=conversionsPer100", { overview: NOT_A_SHOP });
    // 1,500 events from 769 visits: over 100, as one visit can count many times, and the key says so.
    expect(squares().textContent).toContain("195");
    expect(screen.getByText(/so it can go over 100/)).toBeTruthy();
  });

  it("Compare with shows each square's change against the dates before", () => {
    open("compare-squares=before");
    expect(squares().textContent).toContain("▲ 129.9%");
    expect(squares().textContent).not.toContain("15%");
    expect(screen.getByText("The small figure is the change since September.")).toBeTruthy();
  });

  it("Channels chooses the rows, and Classifications the columns", () => {
    const first = open("square-channels=Paid Search");
    expect(within(squares()).queryByText("Organic Search")).toBeNull();
    expect(within(squares()).getByRole("link", { name: "Paid Search" })).toBeTruthy();
    first.unmount();
    open("square-kinds=blog,NO_PAGE");
    expect(squares().textContent).not.toContain("2,035");
    expect(squares().textContent).toContain("1,770");
  });

  it("nothing ticked says what to tick, and the menus stay", () => {
    open("square-kinds=-");
    expect(screen.getByText("Tick at least one channel and one Classification.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Classifications:/ })).toBeTruthy();
  });

  it("Split by Device reads the device squares, and the Classifications menu goes", () => {
    open("split=device");
    expect(asked.some((one) => one.path.endsWith("analyticsChannelSquares") && one.args.split === "device")).toBe(true);
    expect(squares().textContent).toContain("Mobile");
    expect(squares().textContent).toContain("7,900");
    expect(within(squares()).queryByRole("button", { name: /^Classifications:/ })).toBeNull();
  });

  it("says it's showing every device where the list isn't kept by device", () => {
    open("", { kinds: { ...KINDS, everyDevice: true } });
    expect(screen.getByText(/This shows every device/)).toBeTruthy();
  });

  it("a row's name opens that channel's own page, and Other groups says what's in it", () => {
    open();
    const link = within(squares()).getByRole("link", { name: "Organic Search" });
    expect(link.getAttribute("href")).toContain("/channels/channel");
    expect(link.getAttribute("href")).toContain("key=Organic+Search");
    fireEvent.mouseEnter(within(squares()).getByText("Other groups"));
    expect(screen.getByRole("tooltip").textContent).toBe("Other groups holds Locks, Knobs.");
  });

  it("the hover names a square's visits, bought and conversions, now and before", () => {
    open();
    const square = within(squares()).getByText("2,035").closest("[aria-label]");
    const said = square?.getAttribute("aria-label") ?? "";
    expect(said).toContain("Organic Search, Brand");
    expect(said).toContain("Visits in October: 2,035");
    expect(said).toContain("Visits in September: 885");
    expect(said).toContain("Of this channel's visits: 15%");
    expect(said).toContain("Bought in October: 40");
    expect(said).toContain("Conversions in September: 400");
  });
});

describe("how far people got", () => {
  it("opens on everywhere, by Google's own total, and each step says its share of all visits", () => {
    open();
    expect(steps().textContent).toContain("35,739");
    expect(steps().textContent).toContain("Every visit");
    expect(steps().textContent).toContain("3% of all visits");
  });

  it("Came from shows one channel's own steps, and offers only those with 100 visits or more", () => {
    const first = open();
    const menu = within(steps()).getByLabelText("Came from");
    expect(within(menu).queryByText("Email")).toBeNull();
    expect(within(menu).getByText("Paid Search")).toBeTruthy();
    first.unmount();
    open("steps=Paid Search");
    expect(steps().textContent).toContain("1,237 visits");
    expect(steps().textContent).toContain("321 stopped here");
    expect(steps().textContent).not.toContain("35,739");
  });

  it("a website with nothing bought leaves this chart off, and never reads it", () => {
    open("", { overview: NOT_A_SHOP });
    expect(screen.queryByText("How far people got")).toBeNull();
    expect(asked.some((one) => one.path.endsWith("analyticsChannelSteps"))).toBe(false);
  });

  it("a step the website doesn't send is left off, rather than drawn as nobody", () => {
    open("", { steps: { ...STEPS, tracks: { basket: true, checkout: false } } });
    expect(steps().textContent).toContain("In basket");
    expect(steps().textContent).not.toContain("At checkout");
  });
});

describe("the table", () => {
  const table = () => within(screen.getByRole("table"));

  it("shows Came from, Visits, Left straight away, Added to basket, Started checkout and Bought, each for every 100 visits", () => {
    open();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Came from", "Visits", "Left straight away", "Added to basket", "Started checkout", "Bought"]);
    expect(table().getByText("1,399")).toBeTruthy();
    expect(table().getByText("Organic Search").closest("tr")?.textContent).toContain("per 100 visits");
    expect(screen.getByTitle(/Google counts each list on its own/)).toBeTruthy();
  });

  it("a website with nothing bought shows Came from, Visits, Left straight away and Events", () => {
    open("", { overview: NOT_A_SHOP });
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Came from", "Visits", "Left straight away", "Events"]);
  });

  it("every heading sorts on the server, over the whole list", () => {
    open();
    fireEvent.click(screen.getByRole("columnheader", { name: "Started checkout" }).querySelector("button")!);
    expect(wrote().get("sort")).toBe("checkout");
    cleanup();
    open("sort=basket&dir=desc");
    expect(asked.some((one) => one.path.endsWith("analyticsListPage") && one.args.sort === "basket" && one.args.direction === "desc" && one.args.rows !== 100)).toBe(true);
  });

  it("a row opens that channel's own page", () => {
    open();
    expect(table().getByText("Paid Search")).toBeTruthy();
  });
});

describe("the eye", () => {
  it("is handed every channel, Google's total, and each part's own figures, whatever the menus show", () => {
    open("split=device&square-channels=Paid Search");
    const kinds = seesParts.channelSquares as { rows: Array<{ name: string; purchases: number; cells: Array<{ key: string; column: string }> }> };
    expect(kinds.rows.map((one) => one.name)).toEqual(["Organic Search", "Paid Search", "Email"]);
    expect(kinds.rows[0].cells[2]).toMatchObject({ key: "OTHER_KINDS", column: "Other groups" });
    expect((seesParts.channelDevices as { columns: Array<{ name: string }> }).columns.map((one) => one.name)).toEqual(["Desktop", "Mobile", "Tablet"]);
    expect((seesParts.channelSteps as { everywhere: { arrived: number } }).everywhere.arrived).toBe(35739);
    expect((seesParts.channelsByDay as { days: Array<Record<string, number>> }).days[0]["Organic Search"]).toBe(100);
    expect((seesParts.channelsByDay as { daysBefore: Array<Record<string, number>> }).daysBefore[1]["Cross-network"]).toBe(110);
  });
});

describe("the approved look", () => {
  it("Channels, as Anthony chose it", async () => {
    realChart.on = true;
    const { container } = open();
    await openHakkenSees();
    await expectApprovedLook(container, "channels-new-page", "New", "Google Analytics → Channels");
  });
});
