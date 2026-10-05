import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChartReveal, revealKey } from "./ChartReveal";

/** A chart's figures as Recharts 3 draws them — each kind in a layer of its own — without the chart. */
function Figures({ lines = 0, bars = 0, pies = 0 }: { lines?: number; bars?: number; pies?: number }) {
  return (
    <svg>
      <g className="recharts-zIndex-layer_400">
        {Array.from({ length: lines }, (_, index) => <g key={index} className="recharts-layer recharts-line" />)}
      </g>
      <g className="recharts-zIndex-layer_300">
        {Array.from({ length: bars }, (_, index) => <g key={index} className="recharts-layer recharts-bar" />)}
      </g>
      {Array.from({ length: pies }, (_, index) => <g key={index} className="recharts-layer recharts-pie" />)}
      <g className="recharts-cartesian-axis" />
    </svg>
  );
}

/**
 * A chart's entrance (2026-10-03): its figures come in when the chart appears
 * and on new dates, never on a tick box, and never for a computer set to
 * reduce motion.
 */
describe("ChartReveal", () => {
  const animate = vi.fn();
  const matchMedia = window.matchMedia;
  let reduced = false;

  beforeEach(() => {
    animate.mockClear();
    reduced = false;
    Element.prototype.animate = animate as unknown as Element["animate"];
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: reduced })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).animate;
    window.matchMedia = matchMedia;
  });

  const moved = () => animate.mock.contexts.map((element) => (element as Element).getAttribute("class"));

  it("wipes a chart's lines in from the left as one, leaving its axes still", () => {
    render(<ChartReveal replay="a"><Figures lines={2} /></ChartReveal>);
    expect(moved()).toEqual(["recharts-zIndex-layer_400"]);
    expect(animate.mock.calls[0][0]).toEqual([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }]);
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: 600 });
  });

  it("grows upright bars from their line, bars along from the left, and fades what runs along nothing", () => {
    const { unmount } = render(<ChartReveal replay="a" motion="rise"><Figures bars={3} /></ChartReveal>);
    expect(moved()).toEqual(["recharts-zIndex-layer_300"]);
    expect(animate.mock.calls[0][0][0]).toMatchObject({ transform: "scaleY(0)", transformOrigin: "50% 100%", transformBox: "fill-box" });
    unmount();
    animate.mockClear();

    render(<ChartReveal replay="a" motion="along"><Figures bars={1} /></ChartReveal>);
    expect(animate.mock.calls[0][0][0]).toMatchObject({ transform: "scaleX(0)", transformOrigin: "0% 50%" });
    animate.mockClear();

    // A figure outside a kind's own layer moves alone.
    render(<ChartReveal replay="a" motion="fade"><Figures pies={1} /></ChartReveal>);
    expect(moved()).toEqual(["recharts-layer recharts-pie"]);
    expect(animate.mock.calls[0][0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it("waits for figures the chart draws after it has measured itself", async () => {
    const { container } = render(<ChartReveal replay="a"><svg /></ChartReveal>);
    expect(animate).not.toHaveBeenCalled();
    const line = document.createElementNS("http://www.w3.org/2000/svg", "g");
    line.setAttribute("class", "recharts-line");
    container.querySelector("svg")!.appendChild(line);
    await waitFor(() => expect(animate).toHaveBeenCalledTimes(1));
  });

  it("plays again on new dates, but not when a line is ticked on or off", () => {
    const { rerender } = render(<ChartReveal replay="a"><Figures lines={2} /></ChartReveal>);
    animate.mockClear();
    rerender(<ChartReveal replay="a"><Figures lines={1} /></ChartReveal>);
    expect(animate).not.toHaveBeenCalled();
    rerender(<ChartReveal replay="b"><Figures lines={1} /></ChartReveal>);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("draws the chart at once for a computer set to reduce motion", () => {
    reduced = true;
    render(<ChartReveal replay="a"><Figures lines={2} /></ChartReveal>);
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("revealKey", () => {
  it("is new for new dates or names, and the same when the same rows come again", () => {
    const month = [{ day: "2026-09-01", label: "1 Sep", clicks: 3 }, { day: "2026-09-30", label: "30 Sep", clicks: 5 }];
    expect(revealKey(month)).toBe("2:2026-09-01:2026-09-30");
    expect(revealKey(month.map((row) => ({ ...row, clicks: 9 })))).toBe(revealKey(month));
    expect(revealKey([{ day: "2025-09-01" }, { day: "2025-09-30" }])).not.toBe(revealKey(month));
    expect(revealKey([{ name: "Pro" }, { name: "Free" }], "name")).toBe("2:Pro:Free");
    expect(revealKey([])).toBe("0::");
  });
});
