import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { PageFlowChart, type PageFlowBand, type PageFlowNode } from "./PageFlowChart";

/** How visits moved through a website (landing-pages-flow-plan.md LF2): boxes, bands, tails, dots, and following a page. */
describe("PageFlowChart", () => {
  const node = (id: string, column: 0 | 1 | 2, label: string, visits: number, left: number, conversions = 0): PageFlowNode =>
    ({ id, column, label, visits, left, conversions, hover: `${label}: ${visits} visits` });
  const band = (from: string, to: string, visits: number, conversions: number, landings: string[]): PageFlowBand =>
    ({ from, to, visits, conversions, landings, hover: `${from} → ${to}: ${visits} visits` });
  const props = {
    columns: [{ title: "Landing pages", summary: "245 visits" }, { title: "Next page", summary: "60 visits" }, { title: "Page after", summary: "30 visits" }],
    nodes: [
      node("0:/", 0, "/", 155, 109, 1),
      node("0:/ai-agency/", 0, "/ai-agency/", 90, 90),
      node("1:/about-us/", 1, "/about-us/", 60, 30),
      node("2:/contact/", 2, "/contact/", 30, 30, 2),
    ],
    bands: [band("0:/", "1:/about-us/", 60, 0, ["0:/"]), band("1:/about-us/", "2:/contact/", 30, 2, ["0:/"])],
    legend: { conversions: "Conversions", left: "Visits that left there" },
    figuresOf: (one: PageFlowNode) => `${one.visits}`,
  };
  const box = (id: string) => document.querySelector(`[data-node="${id}"]`) as SVGGElement;
  const route = (id: string) => document.querySelector(`[data-band="${id}"]`) as SVGPathElement;

  it("opens with no route followed: every route grey, every box whole, each column named with its figures", () => {
    render(<PageFlowChart {...props} />);
    expect(route("0:/>1:/about-us/").getAttribute("fill")).toBe(CHART_SERIES_SLATE);
    expect(box("0:/ai-agency/").getAttribute("opacity")).toBe("1");
    expect(screen.getByText("Landing pages")).toBeInTheDocument();
    expect(screen.getByText("Visits that left there")).toBeInTheDocument();
    // The routes for a screen reader, as a list.
    expect(document.querySelector("ul.sr-only")).toHaveTextContent("1:/about-us/ → 2:/contact/: 30 visits");
  });

  it("follows a landing page two steps on when clicked, fades the rest, and lets go when clicked again", () => {
    render(<PageFlowChart {...props} />);
    fireEvent.click(box("0:/"));
    expect(box("0:/").getAttribute("aria-pressed")).toBe("true");
    expect(route("0:/>1:/about-us/").getAttribute("fill")).toBe(CHART_SERIES_ORANGE);
    expect(route("1:/about-us/>2:/contact/").getAttribute("fill")).toBe(CHART_SERIES_ORANGE);
    expect(box("0:/ai-agency/").getAttribute("opacity")).toBe("0.3");
    fireEvent.click(box("0:/"));
    expect(box("0:/").getAttribute("aria-pressed")).toBe("false");
    expect(route("0:/>1:/about-us/").getAttribute("fill")).toBe(CHART_SERIES_SLATE);
  });

  it("follows a page in the middle by its routes in and out, from the keyboard too", () => {
    render(<PageFlowChart {...props} />);
    fireEvent.keyDown(box("1:/about-us/"), { key: "Enter" });
    expect(route("0:/>1:/about-us/").getAttribute("fill")).toBe(CHART_SERIES_ORANGE);
    expect(route("1:/about-us/>2:/contact/").getAttribute("fill")).toBe(CHART_SERIES_ORANGE);
    expect(box("0:/ai-agency/").getAttribute("opacity")).toBe("0.3");
  });
});
