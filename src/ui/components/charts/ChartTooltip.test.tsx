import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChartTooltip } from "./ChartTooltip";

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
});
