import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AICostDistributionCharts } from "./AICostDistributionCharts";
import { AICostTimelineChart } from "./AICostTimelineChart";
import type { Translate } from "./types";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ children, ...props }, ref) =>
          React.createElement(tag, { ...props, ref }, children)
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    }
  ),
}));

vi.mock("@/src/ui/components/charts/ChartExportWrapper", () => ({
  default: ({ children, exportName }: { children: React.ReactNode; exportName: string }) => (
    <div data-export-name={exportName}>{children}</div>
  ),
}));

vi.mock("recharts", () => {
  const Shell = ({ children, data, dataKey, name }: { children?: React.ReactNode; data?: unknown[]; dataKey?: string; name?: string }) => {
    const visibleChildren = React.Children.toArray(children).filter(
      (child) => !React.isValidElement(child) || typeof child.type !== "string" || !["defs", "linearGradient", "stop"].includes(child.type)
    );

    return (
      <div data-count={data?.length ?? 0} data-key={dataKey} data-name={name}>
        {visibleChildren}
      </div>
    );
  };

  return {
    Area: Shell,
    AreaChart: Shell,
    Bar: Shell,
    BarChart: Shell,
    CartesianGrid: Shell,
    Cell: ({ fill }: { fill: string }) => <span data-testid="chart-cell" data-fill={fill} />,
    Legend: Shell,
    Pie: Shell,
    PieChart: Shell,
    ResponsiveContainer: Shell,
    Tooltip: ({ formatter }: { formatter?: (value: unknown) => [string, string] | string }) => (
      <div data-testid="chart-tooltip">{formatter ? String(formatter(1234)) : "tooltip"}</div>
    ),
    XAxis: Shell,
    YAxis: Shell,
  };
});

const t: Translate = (key) => {
  if (key === "chart.tooltipLabel") return "Spend";
  return key;
};

describe("AI cost charts", () => {
  it("renders empty states when chart data has not arrived", () => {
    render(
      <>
        <AICostTimelineChart aggregationLabel="Daily Cost" noDataLabel="No spend yet" t={t} />
        <AICostDistributionCharts />
      </>
    );

    expect(screen.getByText("Daily Cost (USD)")).toBeInTheDocument();
    expect(screen.getByText("No spend yet")).toBeInTheDocument();
    expect(screen.getAllByText("No Data")).toHaveLength(3);
  });

  it("renders populated timeline and distribution charts", () => {
    render(
      <>
        <AICostTimelineChart
          aggregationLabel="Daily Cost"
          noDataLabel="No spend yet"
          t={t}
          timeline={[{ date: "2026-06-01", cost: 1.23, inputTokens: 1000, outputTokens: 500 }]}
        />
        <AICostDistributionCharts
          modelDistribution={[
            { name: "gpt-4.1", calls: 10, cost: 1.5 },
            { name: "gpt-4.1-mini", calls: 20, cost: 0.5 },
          ]}
          providerDistribution={[
            { providerKey: "openai", calls: 20, cost: 1.75 },
            { providerKey: "unknown", calls: 2, cost: 0.05 },
          ]}
          timeline={[{ date: "2026-06-01", inputTokens: 1000, outputTokens: 500 }]}
        />
      </>
    );

    expect(screen.getByText("Model Invocations")).toBeInTheDocument();
    expect(screen.getByText("Provider Distribution")).toBeInTheDocument();
    expect(screen.getByText("Token Flux")).toBeInTheDocument();
    expect(screen.getAllByTestId("chart-tooltip")[0]).toHaveTextContent("Spend");
    expect(screen.getAllByTestId("chart-cell")).toHaveLength(4);
    expect(screen.queryByText("No Data")).not.toBeInTheDocument();
  });
});
