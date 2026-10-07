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
});
