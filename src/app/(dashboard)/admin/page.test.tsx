import React from "react";
import { render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { describe, expect, it, vi } from "vitest";
import AdminDashboard from "./page";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (key: string) => {
    const translations: Record<string, string> = {
      title: "Admin Overview",
      subtitle: "Platform analytics",
      "charts.daily": "Daily",
      "charts.noData": "No data",
      "metrics.mrr": "MRR",
      "metrics.mrrSub": "Monthly revenue",
      "metrics.mau": "MAU",
      "metrics.mauSub": "Active users",
      "metrics.logisticBurn": "Cost",
      "metrics.burnSub": "AI cost",
      "metrics.activeContext": "Active Context",
      "metrics.activeSub": "Current users",
      "metrics.compute": "Compute",
      "metrics.computeSub": "Input {input} Output {output}",
      "metrics.messagesSent": "Messages",
      "metrics.messagesSub": "Total messages",
      "leaderboards.empty": "No rows",
      "leaderboards.tenants": "Top Companies",
      "leaderboards.initiators": "Top Users",
    };
    return translations[key] || key;
  }),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

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

vi.mock("@/src/ui/components/TimeframeDropdown", () => ({
  default: () => <div>Timeframe dropdown</div>,
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
    Tooltip: Shell,
    XAxis: Shell,
    YAxis: Shell,
  };
});

describe("AdminDashboard", () => {
  it("renders provider distribution on the global overview dashboard", () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({
        aggregates: {
          aggregationType: "day",
          activeUsers: 1,
          mau: 1,
          totalCostGBP: 0.01,
          totalInputTokens: 100,
          totalMessages: 2,
          totalOutputTokens: 50,
          totalTokens: 150,
        },
        modelDistribution: [{ name: "Platform Model", calls: 2, cost: 0.01 }],
        providerDistribution: [{ providerKey: "openai", calls: 2, cost: 0.01 }],
        timeline: [{ date: "2026-06-02", cost: 0.01, messages: 2, inputTokens: 100, outputTokens: 50 }],
        topAgents: [],
        topCompanies: [],
        topUsers: [],
      } as unknown as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({
        aggregates: { mrr: 0 },
        planDistribution: [],
        systemIntegrity: { totalProvisionedCompanies: 1 },
      } as unknown as ReturnType<typeof useQuery>);

    render(<AdminDashboard />);

    expect(screen.getByText("Provider Distribution")).toBeInTheDocument();
    expect(screen.getByText("Cost drivers by provider")).toBeInTheDocument();
    expect(screen.getByText("Model Logistics")).toBeInTheDocument();
    expect(screen.getByText("Token Flux")).toBeInTheDocument();
  });
});
