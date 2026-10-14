import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CHART_ENGAGEMENT_NONE, CHART_ENGAGEMENT_RAMP } from "@/src/ui/components/charts/chartPalette";
import { ChannelMap } from "./ChannelMap";

vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const hex = (value: string) => {
  const probe = document.createElement("span");
  probe.style.backgroundColor = value;
  return probe.style.backgroundColor;
};

/** Each channel by page group (ga-channel-pages-plan.md CH9): squares shaded by their share of the row, with a key. */
describe("ChannelMap", () => {
  const props = {
    columns: ["Service", "Content hub", "Product"],
    rows: [{ key: "organic", label: "Organic Search", total: "192 visits", href: "/c", cells: [
      { visits: 120, conversions: 3, hover: "Organic Search → Service" },
      { visits: 20, conversions: 0, hover: "Organic Search → Content hub" },
      { visits: 0, conversions: 0, hover: "Organic Search → Product" },
    ] }],
    rowVisits: () => 140,
    conversionsWord: (count: number) => `${count} conv.`,
    legend: { visits: "visits", conversions: "conversions", shades: "share", empty: "none" },
  };

  it("shades a bigger share brighter, an empty square grey, and writes the conversions under the number", () => {
    render(<ChannelMap {...props} />);
    const square = (hover: string) => screen.getByTitle(hover) as HTMLElement;
    expect(square("Organic Search → Service").style.backgroundColor).toBe(hex(CHART_ENGAGEMENT_RAMP[4]));
    expect(square("Organic Search → Content hub").style.backgroundColor).toBe(hex(CHART_ENGAGEMENT_RAMP[1]));
    expect(square("Organic Search → Product").style.backgroundColor).toBe(hex(CHART_ENGAGEMENT_NONE));
    expect(square("Organic Search → Service")).toHaveTextContent("1203 conv.");
  });

  it("names each row with its link and its visits, and says what the map means", () => {
    render(<ChannelMap {...props} />);
    expect(screen.getByRole("link", { name: "Organic Search" })).toHaveAttribute("href", "/c");
    expect(screen.getByText("192 visits")).toBeInTheDocument();
    expect(screen.getByText("share")).toBeInTheDocument();
  });
});
