import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChartTooltip, ChartTooltipRow, ChartTooltipSurface } from "./ChartTooltip";

const payload = [
  { dataKey: "finished", name: "Finished", value: 12, color: "#3987e5" },
  { dataKey: "waited", name: "Waited for a person", value: 0, color: "#f59e0b" },
];

describe("ChartTooltip", () => {
  it("shows nothing until the pointer is on a mark", () => {
    const { container } = render(<ChartTooltip payload={payload} label="5 Aug" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("leads with the number and follows it with what the number counts", () => {
    render(<ChartTooltip active payload={payload} label="5 Aug" />);

    expect(screen.getByText("5 Aug")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
  });

  it("leaves out the bands a day has none of", () => {
    render(<ChartTooltip active hideEmptyRows payload={payload} label="5 Aug" />);

    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.queryByText("Waited for a person")).not.toBeInTheDocument();
  });

  it("stays away entirely when every band is empty", () => {
    const { container } = render(
      <ChartTooltip active hideEmptyRows payload={[{ dataKey: "finished", value: 0 }]} label="5 Aug" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("gives a mark drawn without a row none, as a lone line's fill under the line", () => {
    render(
      <ChartTooltip
        active
        payload={[{ dataKey: "views", value: 40, type: "none" }, { dataKey: "views", name: "Views", value: 40 }]}
        label="5 Aug"
      />
    );

    expect(screen.getAllByText("40")).toHaveLength(1);
    expect(screen.getByText("Views")).toBeInTheDocument();
  });

  it("lets a chart say how its numbers read", () => {
    render(
      <ChartTooltip
        active
        payload={[{ dataKey: "cost", value: 12.5 }]}
        label="5 Aug"
        formatValue={(value) => `£${value.toFixed(2)}`}
        seriesLabel={() => "spent"}
      />
    );

    expect(screen.getByText("£12.50")).toBeInTheDocument();
    expect(screen.getByText("spent")).toBeInTheDocument();
  });

  it("wraps a long line onto a second one, never cutting it mid-sentence, and keeps a short one as it was", () => {
    // Anthony, 18 November 2026, of Demand by Classification's bands: "Google keeps these searches private, so it doesn't say which pag…".
    const long = "Google keeps these searches private, so it doesn't say which page they went to.";
    render(
      <ChartTooltipSurface heading="Private searches" wide>
        <ChartTooltipRow value="251,047" label="Impressions" />
        <ChartTooltipRow value="" label={long} />
      </ChartTooltipSurface>,
    );
    const line = screen.getByText(long);
    expect(line.className).not.toMatch(/\btruncate\b|whitespace-nowrap|text-ellipsis|overflow-hidden/);
    expect(line.className).toContain("break-words");
    // A short label reads whole, beside a figure that never gives way to it.
    expect(screen.getByText("Impressions")).toBeInTheDocument();
    expect(screen.getByText("251,047").className).toContain("shrink-0");
  });
});
