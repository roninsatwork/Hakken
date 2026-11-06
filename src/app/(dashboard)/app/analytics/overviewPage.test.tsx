import { useQuery } from "convex/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { cleanup, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { CHART, DAYS_BEFORE, statusWith } from "@/src/test/googleAnalyticsFixtures";
import { convexPath } from "@/src/test/siteViewFixtures";
import AnalyticsOverviewPage from "./[siteId]/page";

/**
 * Overview (docs/plans/active/overview-new-page-plan-2026-11-06.md, step 13): "Test what a control means, not that it moved." Every
 * menu is held to the figures it should show: two on the chart, five on the squares, two on the bands. The figures are worked out by
 * hand here, on a shop and on a service business, and the Visits box is held to Google's total where the lists add up to something else.
 */

const nav = vi.hoisted(() => ({ search: "", drawn: [] as unknown[] }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/analytics/site_1",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
// The chart's own drawing is held by its own tests: here, what the page hands it.
vi.mock("@/src/ui/components/screens/DaysChart", () => ({
  DaysChart: ({ title, lines }: { title: string; lines: unknown[] }) => {
    nav.drawn = lines;
    return <h3>{title}</h3>;
  },
}));

type Row = ReturnType<typeof rowOf>;
function rowOf(key: string, visits: number, stayed: number, bought: number, conversions: number, did: number[], before: { visits: number; bought: number; conversions: number; did?: number[] } | null, name: string | null = null) {
  return {
    key, name, visits, stayed, views: visits * 3, length: visits * 100, bought, conversions, did, times: did,
    visitsBefore: before?.visits ?? null, stayedBefore: before ? Math.round(before.visits * 0.7) : null, viewsBefore: before ? before.visits * 2 : null,
    boughtBefore: before?.bought ?? null, conversionsBefore: before?.conversions ?? null, didBefore: before ? before.did ?? did : null, timesBefore: before ? before.did ?? did : null,
  };
}
const answerOf = (events: Array<{ name: string; counted: boolean }>, rows: Row[]) => ({ collecting: false, everyDevice: false, hasBefore: true, events, rows });

const SHOP_EVENTS = [{ name: "add_to_cart", counted: true }, { name: "begin_checkout", counted: true }, { name: "purchase", counted: true }];
const SHOP = {
  connection: { shop: true },
  // Google's total: 1,000 visits. The channels add up to 1,010, as each of Google's lists is counted on its own.
  overview: { now: { visits: 1000, engaged: 600, views: 3000, conversions: 500, purchases: 30, length: 100000 }, before: { visits: 1100, engaged: 700, views: 3300, conversions: 500, purchases: 33, length: 110000 } },
  channel: answerOf(SHOP_EVENTS, [
    rowOf("Organic Search", 700, 420, 12, 300, [100, 40, 12], { visits: 650, bought: 13, conversions: 300 }),
    rowOf("Paid Search", 110, 70, 11, 90, [40, 20, 11], { visits: 120, bought: 9, conversions: 90 }),
    rowOf("Cross-network", 200, 110, 7, 110, [60, 20, 7], { visits: 400, bought: 11, conversions: 110 }),
  ]),
  kind: answerOf(SHOP_EVENTS, [
    rowOf("k1", 600, 400, 25, 400, [150, 60, 25], { visits: 700, bought: 28, conversions: 400 }, "Products"),
    rowOf("k2", 400, 200, 5, 100, [50, 20, 5], { visits: 400, bought: 5, conversions: 100 }, "Blog"),
  ]),
  device: answerOf(SHOP_EVENTS, [
    rowOf("desktop", 300, 240, 20, 300, [100, 50, 20], { visits: 330, bought: 22, conversions: 300 }),
    rowOf("mobile", 700, 360, 10, 200, [100, 30, 10], { visits: 770, bought: 11, conversions: 200 }),
  ]),
  visitorType: answerOf(SHOP_EVENTS, [
    rowOf("new", 800, 450, 15, 300, [120, 40, 15], { visits: 900, bought: 18, conversions: 300 }),
    rowOf("returning", 200, 150, 15, 200, [80, 40, 15], { visits: 200, bought: 15, conversions: 200 }),
  ]),
  year: { now: { visits: 12000, purchases: 360, conversions: 6000 } },
};

const SERVICE_EVENTS = [{ name: "click_apply_now", counted: true }, { name: "form_submit_contact", counted: true }, { name: "form_submit_book_a_visit", counted: true }, { name: "scroll", counted: false }];
const SERVICE = {
  connection: { shop: false },
  overview: { now: { visits: 1000, engaged: 600, views: 3000, conversions: 16, purchases: 0, length: 100000 }, before: { visits: 1000, engaged: 700, views: 3000, conversions: 40, purchases: 0, length: 110000 } },
  channel: answerOf(SERVICE_EVENTS, [
    rowOf("Organic Search", 800, 480, 0, 8, [4, 3, 1, 500], { visits: 700, bought: 0, conversions: 20, did: [10, 8, 2, 400] }),
    rowOf("Paid Search", 200, 120, 0, 8, [4, 2, 2, 100], { visits: 300, bought: 0, conversions: 20, did: [10, 6, 4, 100] }),
  ]),
  kind: answerOf(SERVICE_EVENTS, [rowOf("k1", 1000, 600, 0, 16, [8, 5, 3, 600], { visits: 1000, bought: 0, conversions: 40, did: [20, 14, 6, 500] }, "News")]),
  device: answerOf(SERVICE_EVENTS, [rowOf("mobile", 1000, 600, 0, 16, [8, 5, 3, 600], { visits: 1000, bought: 0, conversions: 40, did: [20, 14, 6, 500] })]),
  visitorType: answerOf(SERVICE_EVENTS, [rowOf("new", 1000, 600, 0, 16, [8, 5, 3, 600], { visits: 1000, bought: 0, conversions: 40, did: [20, 14, 6, 500] })]),
  year: { now: { visits: 12000, purchases: 0, conversions: 144 } },
};

const SPANS = { from: "2026-10-01", to: "2026-10-31", spanBefore: { from: "2026-09-01", to: "2026-09-30" } };
const LIST = { rows: [], total: 0, pages: 1, preparing: false, live: false, ...SPANS };

function answer(site: typeof SHOP | typeof SERVICE, search = "") {
  nav.search = search;
  vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const name = convexPath(reference);
    const asked = args as { split?: keyof typeof SHOP; period?: string };
    if (name.endsWith("googleAnalyticsStatus")) return statusWith(site.connection);
    if (name.endsWith("analyticsOverviewSplit")) return site[asked.split as "channel"];
    if (name.endsWith("analyticsOverview")) return asked.period === "last12Months" ? site.year : { preparing: false, ...SPANS, ...site.overview, seen: { says: [], steps: [] } };
    if (name.endsWith("analyticsListPage")) return LIST;
    if (name.endsWith("analyticsChart")) return { ...CHART, events: ["add_to_cart", "begin_checkout", "purchase"], points: CHART.points.slice(0, 3).map((point, at) => ({ ...point, day: `2026-10-0${at + 1}`, visits: 100, engaged: 60, views: 300, length: 9000, conversions: 5, events: [10, 5, 4 - at] })) };
    if (name.endsWith("analyticsPeriodBeforeChart")) return { ...DAYS_BEFORE, held: true, events: ["add_to_cart", "begin_checkout", "purchase"], points: [{ day: "2026-10-01", visits: 200, engaged: 100, views: 400, length: 8000, conversions: 7, events: [20, 8, 6] }] };
    return undefined;
  }) as never);
}

/** A row of the squares' key: how many squares, and what it's set against. */
function square(name: string) {
  const grid = document.querySelector("[data-part=hundred-grid]") as HTMLElement;
  const row = within(grid).getByText(name).closest("[data-key]") as HTMLElement;
  const cells = [...row.querySelectorAll("span")].map((one) => one.textContent ?? "");
  return { count: Number(cells[1]), was: cells[3] };
}
const hasSquare = (name: string) => within(document.querySelector("[data-part=hundred-grid]") as HTMLElement).queryByText(name) !== null;
const band = (name: string) => within(within(document.querySelector("[data-part=hundred-strips]") as HTMLElement).getByText(name).closest("[data-key]") as HTMLElement).getByText(/→/).textContent;
/** A box, by what it's called. */
const box = (name: string) => [...document.querySelectorAll("[data-part=figure]")].find((one) => one.querySelector("[data-part-title]")?.textContent?.startsWith(name))?.textContent ?? "";
/** A card's title: its words can also be a menu's choice. */
const titled = (words: string) => screen.findAllByRole("heading", { name: words });
const lineOf = (key: string) => (nav.drawn as Array<{ key: string; points: Array<{ value: number }> }>).find((line) => line.key === key)?.points.map((point) => point.value);

beforeEach(() => {
  useScreenDay("2026-11-06");
  vi.mocked(useQuery).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Overview's boxes", () => {
  it("a shop: Google's total for visits, what was bought, and the rule's two picks", async () => {
    answer(SHOP);
    render(<AnalyticsOverviewPage />);
    await titled("Who visits, and who buys");
    expect(box("Visits")).toContain("1,000");
    expect(box("Bought")).toContain("3.0 for every 100 visits. The same as September, with 3 fewer sales.");
    // Cross-network lost 200, more than any other channel moved.
    expect(box("Biggest change")).toContain("Cross-network");
    expect(box("Biggest change")).toContain("200 fewer visits than September");
    // Paid Search: 11 from 110 visits, 10 for every 100; the whole website gets 3.
    expect(box("Sells best")).toContain("Paid Search");
    expect(box("Sells best")).toContain("10.0 bought for every 100 visits. Your website gets 3.0.");
    expect(box("Events")).toBe("");
  });

  it("a service business: says Events, and never bought, sales or basket", async () => {
    answer(SERVICE);
    render(<AnalyticsOverviewPage />);
    await titled("Who visits, and who gets in touch");
    expect(box("Events")).toContain("1.6 for every 100 visits. It was 4.0 in September, with 24 fewer events.");
    expect(box("Best for events")).toContain("Paid Search");
    expect(document.body.textContent).not.toMatch(/bought|sale|basket/i);
  });
});

describe("Overview's Visits each day", () => {
  it("Show: the figure the title names", async () => {
    answer(SHOP);
    render(<AnalyticsOverviewPage />);
    await titled("Visits each day");
    expect(lineOf("now")).toEqual([100, 100, 100]);
    cleanup();
    answer(SHOP, "?show=bought");
    render(<AnalyticsOverviewPage />);
    await titled("Bought each day");
    expect(lineOf("now")).toEqual([4, 3, 2]);
  });

  it("Show: a rate is worked out from its own sums, for each step", async () => {
    answer(SHOP, "?show=boughtRate&step=week");
    render(<AnalyticsOverviewPage />);
    await titled("Bought for every 100 visits each week");
    // Added up over the steps, never a sum of each day's rate.
    for (const value of lineOf("now") ?? []) expect(value).toBeLessThanOrEqual(4);
    expect(lineOf("now")?.length).toBeGreaterThan(0);
  });

  it("Compare with: the dates before, or nothing", async () => {
    answer(SHOP);
    render(<AnalyticsOverviewPage />);
    await titled("Visits each day");
    expect(lineOf("before")).toEqual([200]);
    cleanup();
    answer(SHOP, "?against=none");
    render(<AnalyticsOverviewPage />);
    await titled("Visits each day");
    expect(lineOf("before")).toBeUndefined();
  });
});

describe("Overview's squares", () => {
  it("the whole website, out of Google's total, against the dates before", async () => {
    answer(SHOP);
    render(<AnalyticsOverviewPage />);
    await titled("Out of every 100 visits");
    // 1,000 visits, 600 stayed, 200 added, 80 started checkout, 30 bought: every square accounted for.
    expect(square("Left straight away").count).toBe(40);
    expect(square("Looked around, then left").count).toBe(40);
    expect(square("Added to basket, then left").count).toBe(12);
    expect(square("Started checkout, then left").count).toBe(5);
    expect(square("Bought").count).toBe(3);
    screen.getByText(/That's 1,000 visits/);
  });

  it("Came from: only that channel's visits", async () => {
    answer(SHOP, "?came=Paid%20Search");
    render(<AnalyticsOverviewPage />);
    await titled("Out of every 100 visits");
    expect(square("Bought").count).toBe(10);
    screen.getByText(/Paid Search in October. That's 110 visits/);
  });

  it("Started on: only that Classification's visits", async () => {
    answer(SHOP, "?started=k2");
    render(<AnalyticsOverviewPage />);
    await titled("Out of every 100 visits");
    expect(square("Bought").count).toBe(1);
    screen.getByText(/Blog in October. That's 400 visits/);
  });

  it("Device: only that device's visits", async () => {
    answer(SHOP, "?squaresDevice=desktop");
    render(<AnalyticsOverviewPage />);
    await titled("Out of every 100 visits");
    expect(square("Left straight away").count).toBe(20);
    expect(square("Bought").count).toBe(7);
  });

  it("Out of every 100: starts from the step chosen", async () => {
    answer(SHOP, "?start=2");
    render(<AnalyticsOverviewPage />);
    await titled("Out of every 100 visits that added to a basket");
    expect(hasSquare("Left straight away")).toBe(false);
    expect(square("Bought").count).toBe(15);
  });

  it("Compare with: the dates before, the whole website, or nothing", async () => {
    answer(SHOP, "?came=Paid%20Search&squaresAgainst=website");
    render(<AnalyticsOverviewPage />);
    await titled("Out of every 100 visits");
    expect(square("Bought").was).toBe("3");
    cleanup();
    answer(SHOP, "?squaresAgainst=none");
    render(<AnalyticsOverviewPage />);
    await titled("Out of every 100 visits");
    expect(square("Bought").was).toBe("");
  });

  it("a service business: out of 1,000 when the thing that counts is rare, with its own rows", async () => {
    answer(SERVICE);
    render(<AnalyticsOverviewPage />);
    await titled("Out of every 1,000 visits");
    expect(square("Sent a form").count).toBe(8);
    expect(square("Clicked to get in touch").count).toBe(8);
    expect(square("Left straight away").count).toBe(400);
  });

  it("a service business: how people got in touch, out of every 100 events", async () => {
    answer(SERVICE, "?squares=kinds");
    render(<AnalyticsOverviewPage />);
    await titled("How people got in touch");
    expect(square("Click apply now").count).toBe(50);
    expect(hasSquare("Scroll")).toBe(false);
  });
});

describe("Overview's bands", () => {
  it("Split by: each split's own rows, its shares adding up to 100", async () => {
    answer(SHOP);
    render(<AnalyticsOverviewPage />);
    await titled("Who visits, and who buys");
    // 110 of 1,010 visits; 11 of 30 sold.
    expect(band("Paid Search")).toBe("11 → 37");
    cleanup();
    answer(SHOP, "?split=visitorType");
    render(<AnalyticsOverviewPage />);
    await titled("Who visits, and who buys");
    expect(band("Returning")).toBe("20 → 50");
  });

  it("Compare with: the bottom row is that figure", async () => {
    answer(SHOP, "?bands=views");
    render(<AnalyticsOverviewPage />);
    await titled("Who visits, and who looks around most");
    expect(band("Organic Search")).toBe("69 → 69");
    cleanup();
    answer(SHOP, "?bands=before");
    render(<AnalyticsOverviewPage />);
    await titled("Who visits now, and who visited in September");
    expect(band("Cross-network")).toBe("20 → 34");
  });

  it("says when it's only a rough guide", async () => {
    answer(SHOP);
    render(<AnalyticsOverviewPage />);
    await screen.findByText(/That's only 30, so it's a rough guide/);
  });
});
