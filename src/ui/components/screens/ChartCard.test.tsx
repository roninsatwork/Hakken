import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";

import { ChartCard } from "./ChartCard";

vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());

/**
 * One chart in its card (2026-10-03 clean-up): Sites', Search Console's and
 * the Overview's panels became this.
 */
describe("ChartCard", () => {
  it("titles the chart, says what it shows and offers its download", () => {
    render(
      <ChartCard title="Clicks over time" hint="Tick the measures to draw." exportName="site-clicks" csv={() => "a,b"}>
        <div>the chart</div>
      </ChartCard>,
    );

    expect(screen.getByRole("heading", { name: "Clicks over time" })).toBeInTheDocument();
    expect(screen.getByText("Tick the measures to draw.")).toBeInTheDocument();
    expect(screen.getByText("the chart")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ui\.chart\.download/ })).toBeInTheDocument();
  });

  it("says in words when there is too little to draw, in the screen's own words when it has them", () => {
    const { rerender } = render(<ChartCard title="Clicks" enoughData={false}><div>the chart</div></ChartCard>);
    expect(screen.getByText("ui.chart.notEnough")).toBeInTheDocument();
    expect(screen.queryByText("the chart")).not.toBeInTheDocument();

    rerender(<ChartCard title="Clicks" enoughData={false} emptyText="Nothing was shown in these dates."><div>the chart</div></ChartCard>);
    expect(screen.getByText("Nothing was shown in these dates.")).toBeInTheDocument();
  });

  it("is a plain card in the same frame without a download", () => {
    render(<ChartCard title="Search"><div>figures</div></ChartCard>);

    expect(screen.getByRole("heading", { name: "Search" }).closest("section")).toHaveClass("rounded-2xl");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
