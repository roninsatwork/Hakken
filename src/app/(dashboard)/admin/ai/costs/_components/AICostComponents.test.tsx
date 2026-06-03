import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Activity } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AICostLeaderboards } from "./AICostLeaderboards";
import { AICostsHeader } from "./AICostsHeader";
import { AICostsMetricGrid } from "./AICostsMetricGrid";
import { MetricBlock } from "./MetricBlock";
import type { Translate } from "./types";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

vi.mock("next/image", () => ({
  default: ({ unoptimized, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void unoptimized;
    return React.createElement("img", { ...props, alt: alt ?? "" });
  },
}));

const t: Translate = (key, values) => {
  if (key === "metrics.tokenSub") return `${values?.input} in / ${values?.output} out`;
  return key;
};

describe("AI cost reusable display components", () => {
  it("renders metric blocks with compact and large variants", () => {
    const { rerender } = render(
      <MetricBlock icon={Activity} title="Usage" value="42" sub="messages" className="custom" />
    );

    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByText("42")).toHaveClass("text-3xl");
    expect(screen.getByText("messages")).toBeInTheDocument();

    rerender(<MetricBlock icon={Activity} title="Cost" value="£1.20" sub="period" largeText />);

    expect(screen.getByText("£1.20")).toHaveClass("text-5xl");
  });

  it("renders aggregate metrics with formatted currency and token totals", () => {
    render(
      <AICostsMetricGrid
        aggregates={{
          aggregationType: "global",
          avgCostPerMessage: 0.00123,
          costPerActiveUser: 1.5,
          totalCostGBP: 12.34567,
          totalInputTokens: 1000,
          totalOutputTokens: 2500,
          totalTokens: 3500,
        }}
        t={t}
      />
    );

    expect(screen.getByText("metrics.periodCost")).toBeInTheDocument();
    expect(screen.getByText("3,500")).toBeInTheDocument();
    expect(screen.getByText("1,000 in / 2,500 out")).toBeInTheDocument();
  });

  it("renders the costs header and forwards timeframe controls", () => {
    const setTimeframe = vi.fn();
    const setCustomStart = vi.fn();
    const setCustomEnd = vi.fn();

    render(
      <AICostsHeader
        customEnd=""
        customStart=""
        setCustomEnd={setCustomEnd}
        setCustomStart={setCustomStart}
        setTimeframe={setTimeframe}
        subtitle="Spend by tenant"
        timeframe="7d"
        title="AI Costs"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Last 7 Days/i }));
    fireEvent.click(screen.getByRole("button", { name: "Last 14 Days" }));

    expect(screen.getByRole("heading", { name: "AI Costs" })).toBeInTheDocument();
    expect(screen.getByText("Spend by tenant")).toBeInTheDocument();
    expect(setTimeframe).toHaveBeenCalledWith("14d");
  });

  it("renders leaderboard empty states and populated company, user, and agent rows", () => {
    const adminOverview: Translate = (key) => {
      if (key === "leaderboards.empty") return "No rows";
      if (key === "leaderboards.tenants") return "Tenants";
      if (key === "leaderboards.initiators") return "Initiators";
      return key;
    };

    const { rerender } = render(<AICostLeaderboards adminOverview={adminOverview} />);

    expect(screen.getAllByText("No rows")).toHaveLength(3);

    rerender(
      <AICostLeaderboards
        adminOverview={adminOverview}
        topCompanies={[{ id: "company1", name: "Acme", logo: "", cost: 1.2345, messages: 10 }]}
        topUsers={[{ id: "user1", name: "Ada", image: "/ada.png", companyName: "Acme", cost: 2, messages: 20 }]}
        topAgents={[{ id: "agent1", name: "Sales Agent", avatar: "/agent.png", cost: 3, interactions: 30 }]}
      />
    );

    expect(screen.getAllByText("Acme")).toHaveLength(2);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Sales Agent")).toBeInTheDocument();
    expect(screen.getByText("Autonomous Process")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });
});
