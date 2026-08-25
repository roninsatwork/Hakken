import { cloneElement, type ReactElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlanDistributionChart } from "./PlanDistributionChart";

vi.mock("recharts", () => {
  const shell = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  return {
    Bar: shell,
    BarChart: shell,
    CartesianGrid: shell,
    Cell: ({ fill }: { fill: string }) => <span data-testid="plan-chart-cell" data-fill={fill} />,
    ResponsiveContainer: shell,
    // Stands in for the hover, which recharts only renders under a pointer.
    Tooltip: ({ content }: { content?: ReactElement }) =>
      content
        ? cloneElement(content, {
            active: true,
            label: "No plan",
            payload: [{ dataKey: "companies", value: 6, payload: { fill: "#4d4d52" } }],
          } as Record<string, unknown>)
        : null,
    XAxis: shell,
    YAxis: shell,
  };
});

const renderChart = () =>
  render(
    <PlanDistributionChart
      data={[
        { name: "No plan", companies: 6 },
        { name: "Starter Plan", companies: 2 },
      ]}
      noPlanName="No plan"
      noPlanFill="#4d4d52"
      planFill="#3987e5"
      unitLabel={(count) => (count === 1 ? "client workspace" : "client workspaces")}
    />
  );

describe("PlanDistributionChart", () => {
  it("keeps unpriced workspaces grey and priced plans blue", () => {
    renderChart();

    expect(screen.getAllByTestId("plan-chart-cell").map((cell) => cell.dataset.fill)).toEqual([
      "#4d4d52",
      "#3987e5",
    ]);
  });

  it("names the plan and what the number counts, rather than the raw column", () => {
    renderChart();

    expect(screen.getByText("No plan")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("client workspaces")).toBeInTheDocument();
    expect(screen.queryByText(/companies/i)).not.toBeInTheDocument();
  });
});
