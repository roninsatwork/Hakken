import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { MirrorBars, type MirrorBar } from "./MirrorBars";

const bar = (key: string, top: number, bottom: number): MirrorBar => ({
  key, label: key, heading: `Place ${key}`, top, bottom,
  readout: [{ value: String(top), label: "Keywords that got a click" }, { value: String(bottom), label: "Clicks" }],
});
const BARS = [bar("1", 72, 100), bar("2", 191, 405), bar("3", 122, 308), bar("4", 191, 554), bar("5", 0, 0)];
const ZONES = [{ upTo: "3", name: "Top 3" }, { upTo: "5", name: "4–10" }];
const shown = (bars: MirrorBar[] = BARS) => render(<MirrorBars bars={bars} zones={ZONES} topLabel="Keywords that got a click" bottomLabel="Clicks" />);
const heightOf = (element: Element | null) => Number.parseFloat((element as HTMLElement).style.height);

/** Two counts on one scale of steps (search-console-position-bands-way-3-plan-2026-11-19.md). */
describe("MirrorBars", () => {
  it("names every step, every zone, and both counts in its key", () => {
    shown();
    for (const label of ["1", "2", "3", "4", "5", "Top 3", "4–10"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Keywords that got a click").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Clicks").length).toBeGreaterThan(0);
  });

  it("sizes each half against its own biggest, so a step with a lot of one and little of the other shows", () => {
    const { container } = shown();
    const of = (key: string, half: "top" | "bottom") => heightOf(container.querySelector(`[data-bar="${key}"] [data-${half}]`));
    // The most keywords is 191 (places 2 and 4), the most clicks 554 (place 4): both bars of place 4 are full.
    expect(of("4", "top")).toBeCloseTo(of("2", "top"));
    expect(of("4", "bottom")).toBeGreaterThan(of("2", "bottom"));
    expect(of("2", "top") / of("1", "top")).toBeCloseTo(191 / 72);
    // A step with nothing draws nothing either side.
    expect(of("5", "top")).toBe(0);
    expect(of("5", "bottom")).toBe(0);
  });

  it("rises above the line and falls below it as it comes in", () => {
    const { container } = shown();
    expect(container.querySelector('[data-bar="2"] [data-top]')).toHaveAttribute("data-reveal", "rise");
    expect(container.querySelector('[data-bar="2"] [data-bottom]')).toHaveAttribute("data-reveal", "fall");
  });

  it("says each step's figures on hover", () => {
    const { container } = shown();
    fireEvent.mouseMove(container.querySelector('[data-part="mirror-bars"]')!, { clientX: 10, clientY: 10 });
    fireEvent.mouseEnter(container.querySelector('[data-bar="4"]')!);
    expect(screen.getByText("Place 4")).toBeTruthy();
    // Once under its bar, and once in the hover.
    expect(screen.getAllByText("554")).toHaveLength(2);
  });

  it("keeps a zone's bars together, from the zone before's end", () => {
    const { container } = shown();
    const zones = Array.from(container.querySelectorAll<HTMLElement>('[data-part="mirror-bars"] > div:first-child > span'));
    expect(zones.map((zone) => zone.style.gridColumn)).toEqual(["1 / 4", "4 / 6"]);
  });
});
