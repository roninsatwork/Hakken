import { renderWithProviders, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import type { SiteSeries } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import type { AnswerChart as Chart } from "@/convex/utils/assistantCharts";
import { AnswerChart } from "./AnswerChart";

/**
 * The chart under an Ask Hakken answer (hakken-tasks-plan.md, item 2.1, board
 * AskChart): what it shows, its link to the screen, and the days drawn
 * against as many days before, dashed. The Sites chart is stood in for, so
 * the test reads what it is handed.
 */

vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/app/(dashboard)/app/sites/_components/SiteCharts", async (original) => ({
  ...(await original<typeof import("@/src/app/(dashboard)/app/sites/_components/SiteCharts")>()),
  SiteLineChart: ({ data, series, sharedScale }: { data: Array<Record<string, unknown>>; series: SiteSeries[]; sharedScale?: boolean }) => (
    <ul data-testid="lines" data-shared={String(Boolean(sharedScale))}>
      {series.map((line) => (
        <li key={line.key}>{`${line.name}${line.dashed ? " (dashed)" : ""}: ${data.map((row) => row[line.key] ?? "–").join(",")}`}</li>
      ))}
    </ul>
  ),
  SiteBarChart: ({ data, series, stacked, horizontal }: { data: Array<Record<string, unknown>>; series: SiteSeries[]; stacked?: boolean; horizontal?: boolean }) => (
    <ul data-testid="bars" data-stacked={String(Boolean(stacked))} data-along={String(Boolean(horizontal))}>
      {data.map((row) => <li key={String(row.label)}>{`${String(row.label)}: ${series.map((one) => `${one.name} ${String(row[one.key] ?? "–")}`).join(", ")}`}</li>)}
    </ul>
  ),
  SitePieChart: ({ slices, formatValue }: { slices: Array<{ name: string; value: number }>; formatValue: (value: number) => string }) => (
    <ul data-testid="pie">{slices.map((slice) => <li key={slice.name}>{`${slice.name} ${formatValue(slice.value)}`}</li>)}</ul>
  ),
  SiteScatterChart: ({ groups, yLabel }: { groups: Array<{ points: Array<{ x: number; y: number; label: string }> }>; yLabel: string }) => (
    <ul data-testid="scatter" data-y={yLabel}>{groups[0].points.map((point) => <li key={point.label}>{`${point.label} ${point.x} ${point.y}`}</li>)}</ul>
  ),
}));

const september: Chart = {
  look: "searchConsoleDays",
  measure: "visitors",
  website: "example.co.uk",
  from: "2026-09-01",
  to: "2026-09-30",
  beforeFrom: "2026-08-01",
  beforeTo: "2026-08-31",
  points: [
    { day: "2026-09-01", value: 70 },
    { day: "2026-09-02", value: 74, before: 61 },
  ],
  link: "/app/search-console/companyWebsites_1",
};

describe("a chart under an answer", () => {
  it("names what it shows, links to its screen, and draws a whole month against the month before, dashed", () => {
    renderWithProviders(<AnswerChart chart={september} />);
    expect(screen.getByRole("figure", { name: "Visitors from Google each day" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Search Console" })).toHaveAttribute("href", "/app/search-console/companyWebsites_1");
    expect(screen.getAllByRole("listitem").map((line) => line.textContent)).toEqual(["September: 70,74", "August (dashed): –,61"]);
    // One measure on both lines, so one scale.
    expect(screen.getByTestId("lines")).toHaveAttribute("data-shared", "true");
  });

  it("says the dates when they are not a month, names a page's chart by its page, and draws no line before when none is held", () => {
    renderWithProviders(
      <AnswerChart
        chart={{
          ...september,
          measure: "impressions",
          page: "https://example.co.uk/web-design-london/",
          from: "2026-09-24",
          to: "2026-09-30",
          beforeFrom: "2026-09-17",
          beforeTo: "2026-09-23",
          points: [{ day: "2026-09-24", value: 600 }],
          link: "/app/search-console/companyWebsites_1/pages",
        }}
      />,
    );
    expect(screen.getByText("Times /web-design-london/ was shown in Google each day")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((line) => line.textContent)).toEqual(["24 Sept to 30 Sept: 600"]);
  });

  it("draws Google Analytics' days too: one conversion named as Google names it, linked to Analytics (2026-10-31)", () => {
    renderWithProviders(<AnswerChart chart={{ ...september, look: "analyticsDays", measure: "conversionRate", event: "add_to_cart", link: "/app/analytics/companyWebsites_1/conversions?period=lastMonth" }} />);
    expect(screen.getByRole("figure", { name: "Share of visits that did add to cart each day" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Google Analytics" })).toHaveAttribute("href", "/app/analytics/companyWebsites_1/conversions?period=lastMonth");
  });
});

describe("a chart of a website's groups (ask-hakken-every-chart-plan-2026-10-31.md)", () => {
  const groups = (chart: Partial<Chart> & Record<string, unknown>) => ({
    look: "analyticsGroups", by: "channel", website: "morehandles.co.uk", period: "lastMonth", link: "/app/analytics/site/conversions?period=lastMonth", ...chart,
  }) as Chart;

  it("bars rank the channels, last month against the month before", () => {
    renderWithProviders(<AnswerChart chart={groups({ kind: "bars", measure: "visits", groups: [{ name: "Organic Search", value: 12809, before: 13382 }, { name: "Direct", value: 4491 }] })} />);
    expect(screen.getByRole("figure", { name: "Visits by channel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Google Analytics" })).toHaveAttribute("href", "/app/analytics/site/conversions?period=lastMonth");
    expect(screen.getByTestId("bars")).toHaveAttribute("data-along", "true");
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["Organic Search: Last month 12809, The month before 13382", "Direct: Last month 4491, The month before –"]);
  });

  it("stacked bars set the month before beside last month, each channel's share, the rest together", () => {
    renderWithProviders(<AnswerChart chart={groups({ kind: "stacked", measure: "visits", groups: [{ name: "Organic Search", value: 34.9, before: 38.6 }, { name: "*", value: 65.1, before: 61.4 }] })} />);
    expect(screen.getByRole("figure", { name: "Each channel's share of visits" })).toBeInTheDocument();
    expect(screen.getByTestId("bars")).toHaveAttribute("data-stacked", "true");
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["The month before: Organic Search 38.6, Every other 61.4", "Last month: Organic Search 34.9, Every other 65.1"]);
  });

  it("a pie names each device in plain words with its share", () => {
    renderWithProviders(<AnswerChart chart={groups({ kind: "pie", by: "device", measure: "visits", groups: [{ name: "mobile", value: 50 }, { name: "desktop", value: 47.2 }, { name: "tablet", value: 2.8 }] })} />);
    expect(screen.getByRole("figure", { name: "Visits by device" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["Mobile 50%", "Desktop 47.2%", "Tablet 2.8%"]);
  });

  it("a scatter sets each kind of page's visits against the share that bought", () => {
    renderWithProviders(<AnswerChart chart={groups({ kind: "scatter", by: "kind", measure: "conversionRate", event: "purchase", groups: [{ name: "Brand", value: 5.7, visits: 3517 }, { name: "Blog", value: 0.4, visits: 2027 }] })} />);
    expect(screen.getByRole("figure", { name: "Visits against the share that made a purchase, by kind of page" })).toBeInTheDocument();
    expect(screen.getByTestId("scatter")).toHaveAttribute("data-y", "Share that made a purchase (%)");
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["Brand 3517 5.7", "Blog 2027 0.4"]);
  });

  it("Search Console's clicks by country name each country and open Search Console", () => {
    renderWithProviders(<AnswerChart chart={groups({ look: "searchConsoleGroups", kind: "bars", by: "country", measure: "clicks", link: "/app/search-console/site/countries-and-devices", groups: [{ name: "gbr", value: 840, before: 790 }] })} />);
    expect(screen.getByRole("figure", { name: "Clicks from Google by country" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Search Console" })).toHaveAttribute("href", "/app/search-console/site/countries-and-devices");
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["United Kingdom: Last month 840, The month before 790"]);
  });

  it("the week's hours: each weekday by name, each square a count", () => {
    renderWithProviders(<AnswerChart chart={groups({ kind: "grid", by: "hour", measure: "conversions", event: "purchase", groups: [{ name: "08:00–12:00", value: 13 }, { name: "12:00–16:00", value: 7 }], rows: [{ event: "1", values: [12, 4] }, { event: "0", values: [1, 3] }] })} />);
    expect(screen.getByRole("figure", { name: "When people made a purchase, by hour and day" })).toBeInTheDocument();
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Sunday")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("a grid shades each conversion's rate across the kinds of page", () => {
    renderWithProviders(<AnswerChart chart={groups({ kind: "grid", by: "kind", measure: "conversionRate", event: "purchase", groups: [{ name: "Brand", value: 3517 }, { name: "Blog", value: 2027 }], rows: [{ event: "purchase", values: [5.7, 0.4] }, { event: "add_to_cart", values: [18.8, null] }] })} />);
    expect(screen.getByRole("figure", { name: "Share of visits that did each step, by kind of page" })).toBeInTheDocument();
    expect(screen.getByText("Purchase")).toBeInTheDocument();
    expect(screen.getByText("Add to cart")).toBeInTheDocument();
    expect(screen.getByText("5.7%")).toBeInTheDocument();
    expect(screen.getByText("18.8%")).toBeInTheDocument();
  });
});

describe("charts from Bing, Clarity and Visibility (ask-hakken-every-chart-plan-2026-10-31.md, the last sources)", () => {
  const groups = (chart: Partial<Chart> & Record<string, unknown>) => ({ website: "morehandles.co.uk", period: "lastMonth", link: "/app/x", ...chart }) as Chart;

  it("Bing's searches are Bing's clicks, opened in Bing Webmaster", () => {
    renderWithProviders(<AnswerChart chart={groups({ look: "bingGroups", kind: "bars", by: "query", measure: "clicks", link: "/app/bing-webmaster/site/keywords", groups: [{ name: "door handles", value: 12, before: 9 }] })} />);
    expect(screen.getByRole("figure", { name: "Clicks from Bing by search" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Bing Webmaster" })).toHaveAttribute("href", "/app/bing-webmaster/site/keywords");
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["door handles: Last month 12, The month before 9"]);
  });

  it("Clarity's scroll by device in percent, its devices in plain words, opened in Clarity", () => {
    renderWithProviders(<AnswerChart chart={groups({ look: "clarityGroups", kind: "bars", by: "device", measure: "scroll", groups: [{ name: "desktop", value: 31.4, before: 28 }, { name: "mobile", value: 22.5 }] })} />);
    expect(screen.getByRole("figure", { name: "How far people scroll, by device" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Clarity" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["Desktop: Last month 31.4, The month before 28", "Mobile: Last month 22.5, The month before –"]);
  });

  it("Clarity's grid names each row by what people did, each square a share", () => {
    renderWithProviders(<AnswerChart chart={groups({ look: "clarityGroups", kind: "grid", by: "page", measure: "scroll", groups: [{ name: "/basket", value: 900 }], rows: [{ event: "scroll", values: [41.2] }, { event: "rageClicks", values: [3.5] }] })} />);
    expect(screen.getByRole("figure", { name: "What people do on each page, from Clarity" })).toBeInTheDocument();
    expect(screen.getByText("Scroll")).toBeInTheDocument();
    expect(screen.getByText("Angry clicks")).toBeInTheDocument();
    expect(screen.getByText("41.2%")).toBeInTheDocument();
  });

  it("Visibility sets each website at its newest check, by its day, and opens Visibility", () => {
    renderWithProviders(<AnswerChart chart={groups({ look: "visibilityGroups", kind: "bars", by: "website", measure: "estimatedVisitors", period: "latest", asOf: "2026-10-28", groups: [{ name: "corston.com", value: 4120 }, { name: "morehandles.co.uk", value: 2210 }] })} />);
    expect(screen.getByRole("figure", { name: "Estimated visitors from Google by website" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Visibility" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0].textContent).toMatch(/^corston\.com: Newest check, .*28.* 4120$/);
  });

  it("Visibility's grid keeps each website's address as it is, each square a count of searches", () => {
    renderWithProviders(<AnswerChart chart={groups({ look: "visibilityGroups", kind: "grid", by: "website", measure: "searches", period: "latest", groups: [{ name: "1–3", value: 141 }, { name: "4–10", value: 99 }], rows: [{ event: "morehandles.co.uk", values: [61, 29] }] })} />);
    expect(screen.getByRole("figure", { name: "Each website's searches by Google position" })).toBeInTheDocument();
    expect(screen.getByText("morehandles.co.uk")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
  });
});
