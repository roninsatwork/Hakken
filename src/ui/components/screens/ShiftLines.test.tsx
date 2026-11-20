import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { ShiftLines, type ShiftRow } from "./ShiftLines";

const row = (key: string, from: number | null, to: number): ShiftRow => ({
  key, label: key, from, to, figures: from === null ? String(to) : `${from} → ${to}`, detail: "1,000 shown",
  readout: [{ value: String(to), label: "Position in the last 3 months" }],
});
const ZONES = [{ upTo: 3, name: "Top 3" }, { upTo: 10, name: "4–10" }, { upTo: 20, name: "11–20" }, { upTo: 30, name: "21 and below" }];
const shown = (rows: ShiftRow[]) => render(<ShiftLines rows={rows} min={1} max={30} zones={ZONES} lowerIsBetter tick={(value) => (value === 30 ? "30+" : String(value))} fromKey="The 3 months before" toKey="The last 3 months" />);
const leftOf = (element: Element | null) => Number.parseFloat((element as HTMLElement).style.left);
const colourOf = (element: Element | null) => (element as HTMLElement).style.backgroundColor;
const hex = (colour: string) => {
  const probe = document.createElement("span");
  probe.style.backgroundColor = colour;
  return probe.style.backgroundColor;
};

/** Where each thing sat before and sits now (search-console-position-bands-way-3-plan-2026-11-19.md). */
describe("ShiftLines", () => {
  it("names each row, its figures, the zones, their edges and the key", () => {
    shown([row("door handles", 16.3, 13.2)]);
    for (const words of ["door handles", "16.3 → 13.2", "1,000 shown", "Top 3", "4–10", "11–20", "21 and below", "1", "10", "30+", "The 3 months before", "The last 3 months"]) {
      expect(screen.getAllByText(words).length).toBeGreaterThan(0);
    }
  });

  it("joins the dot before to the dot now, orange when a place got better and grey when it got worse", () => {
    const { container } = shown([row("up", 16.3, 13.2), row("down", 8.5, 10.6)]);
    const of = (key: string, part: string) => container.querySelector(`[data-row="${key}"] [data-${part}]`);
    expect(leftOf(of("up", "now"))).toBeLessThan(leftOf(of("up", "before")));
    expect(leftOf(of("up", "line"))).toBeCloseTo(leftOf(of("up", "now")));
    expect(colourOf(of("up", "now"))).toBe(hex(CHART_SERIES_ORANGE));
    expect(colourOf(of("down", "now"))).toBe(hex(CHART_COMPARATOR_GREY));
  });

  it("shows only the dot now with nothing before, and waits at the end of the scale past it", () => {
    const { container } = shown([row("new", null, 12), row("far", 48.3, 10.8)]);
    expect(container.querySelector('[data-row="new"] [data-before]')).toBeNull();
    expect(container.querySelector('[data-row="new"] [data-line]')).toBeNull();
    expect(leftOf(container.querySelector('[data-row="far"] [data-before]'))).toBe(100);
  });

  it("says a row's figures on hover", () => {
    const { container } = shown([row("door handles", 16.3, 13.2)]);
    fireEvent.mouseMove(container.querySelector('[data-part="shift-lines"]')!, { clientX: 10, clientY: 10 });
    fireEvent.mouseEnter(container.querySelector('[data-row="door handles"]')!);
    expect(screen.getByText("Position in the last 3 months")).toBeTruthy();
  });
});
