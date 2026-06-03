import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompanySettingsDashboard from "./page";

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
  mockReturnValue: (value: unknown) => void;
};

vi.mock("next/image", () => ({
  default: ({ unoptimized, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void unoptimized;
    return React.createElement("img", { ...props, alt: alt ?? "" });
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      "charts.daily": "Daily",
      "charts.monthly": "Monthly",
      "charts.noData": "No chart data",
      "charts.weekly": "Weekly",
      "leaderboards.empty": "No leaderboard rows",
      "metrics.activeContext": "Active Users",
      "metrics.activeSub": "Current team",
      "metrics.burnSub": "Estimated spend",
      "metrics.logisticBurn": "AI Cost",
      "metrics.messagesSent": "Messages",
      "metrics.messagesSub": "Total messages",
      "metrics.mrr": "MRR",
      "metrics.mrrSub": "Monthly recurring revenue",
    };
    return labels[key] ?? key;
  },
}));

vi.mock("@/src/ui/components/TimeframeDropdown", () => ({
  default: ({ setTimeframe }: { setTimeframe: (value: string) => void }) => (
    <button type="button" onClick={() => setTimeframe("30d")}>
      Change timeframe
    </button>
  ),
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

vi.mock("recharts", () => {
  const Shell = ({ children }: { children?: React.ReactNode }) => {
    const visibleChildren = React.Children.toArray(children).filter(
      (child) => !React.isValidElement(child) || typeof child.type !== "string" || !["defs", "linearGradient", "stop"].includes(child.type)
    );

    return <div>{visibleChildren}</div>;
  };
  return {
    Area: Shell,
    AreaChart: Shell,
    CartesianGrid: Shell,
    ResponsiveContainer: Shell,
    Tooltip: Shell,
    XAxis: Shell,
    YAxis: Shell,
  };
});

const metrics = {
  aggregates: {
    activeUsers: 3,
    aggregationType: "day",
    mrr: 99,
    totalCostGBP: 1.23456,
    totalMessages: 42,
  },
  providerDistribution: [{ providerKey: "openai", calls: 7, cost: 0.1234 }],
  timeline: [{ date: "2026-06-01", cost: 1.23, messages: 42 }],
  topAgents: [{ id: "agent_1", name: "Sales Agent", avatar: "/agent.png", interactions: 12, cost: 0.25 }],
  topUsers: [{ id: "user_1", name: "Ada", image: "/ada.png", email: "ada@example.com", messages: 20, cost: 0.5 }],
};

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("CompanySettingsDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown, args: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("getMe")) return { _id: "user_1", name: "Ada", companyId: "company_1" };
      if (path.includes("getCompanyMetrics")) return args === "skip" ? undefined : metrics;
      return undefined;
    });
  });

  it("renders loading and no-organization states", () => {
    (useQuery as unknown as HookMock).mockReturnValue(undefined);
    const { container, rerender } = render(<CompanySettingsDashboard />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("getMe")) return { _id: "user_1", name: "Ada" };
      return undefined;
    });
    rerender(<CompanySettingsDashboard />);

    expect(screen.getByText("No organization linked to this account.")).toBeInTheDocument();
  });

  it("queries company metrics and renders populated organization analytics", () => {
    render(<CompanySettingsDashboard />);

    expect(useQuery).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ companyId: "company_1", timeframe: "today" }));
    expect(screen.getByText("Organization Dashboard")).toBeInTheDocument();
    expect(screen.getByText("£99.00")).toBeInTheDocument();
    expect(screen.getByText("Provider Usage")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("7 calls")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Sales Agent")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change timeframe" }));

    expect(useQuery).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ companyId: "company_1", timeframe: "30d" }));
  });
});
