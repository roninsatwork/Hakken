import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrganizationUsagePlot } from "./OrganizationUsagePlot";

vi.mock("recharts", () => {
  const Shell = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const AreaChart = ({
    children,
    className,
    data,
  }: {
    children?: React.ReactNode;
    className?: string;
    data?: unknown[];
  }) => (
    <div className={className} data-points={data?.length} data-testid="area-chart">
      {children}
    </div>
  );

  return {
    Area: Shell,
    AreaChart,
    CartesianGrid: Shell,
    ResponsiveContainer: Shell,
    Tooltip: Shell,
    XAxis: Shell,
    YAxis: Shell,
  };
});

const labels = {
  estimatedCostLabel: "Estimated cost",
  globalMessagesLabel: "Messages",
  noDataLabel: "No chart data",
};

describe("OrganizationUsagePlot", () => {
  it("preserves the empty state", () => {
    render(<OrganizationUsagePlot {...labels} timeline={[]} />);

    expect(screen.getByText("No chart data")).toBeInTheDocument();
    expect(screen.getByTestId("area-chart")).toHaveClass("w-12", "h-12", "mb-3");
  });

  it("renders the populated timeline", () => {
    render(
      <OrganizationUsagePlot
        {...labels}
        timeline={[{ date: "2026-06-01", cost: 1.23, messages: 42 }]}
      />,
    );

    expect(screen.queryByText("No chart data")).not.toBeInTheDocument();
    expect(screen.getByTestId("area-chart")).toHaveAttribute("data-points", "1");
  });
});
