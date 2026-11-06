import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { AgainstBars, type AgainstRow } from "./AgainstBars";

const row = (over: Partial<AgainstRow> = {}): AgainstRow => ({
  key: "people", label: "People", now: 26, usual: 20, nowWord: "26", usualWord: "About 20 in a usual half hour", moved: <span>▲ 30%</span>,
  readout: [{ value: "26", label: "In the last half hour" }, { value: "20", label: "In a usual half hour" }], ...over,
});
const shown = (rows: AgainstRow[]) => render(<AgainstBars rows={rows} nowKey="The last half hour" usualKey="Usual" />);
const widthOf = (element: Element | null) => Number.parseFloat((element as HTMLElement).style.width);
const leftOf = (element: Element | null) => Number.parseFloat((element as HTMLElement).style.left);

describe("AgainstBars (docs/plans/active/live-new-page-plan-2026-11-06.md)", () => {
  it("says each row's figure, how far it moved and what the mark means, with a key", () => {
    shown([row()]);
    expect(screen.getByText("People")).toBeTruthy();
    expect(screen.getByText("26")).toBeTruthy();
    expect(screen.getByText("▲ 30%")).toBeTruthy();
    expect(screen.getByText("About 20 in a usual half hour")).toBeTruthy();
    expect(screen.getByText("The last half hour")).toBeTruthy();
    expect(screen.getByText("Usual")).toBeTruthy();
  });

  it("draws the bar past the mark when now is above usual, and short of it when below", () => {
    const { container } = shown([row({ key: "above", now: 30, usual: 20 }), row({ key: "below", now: 10, usual: 20 })]);
    const of = (key: string) => container.querySelector(`[data-row="${key}"]`)!;
    expect(widthOf(of("above").querySelector("[data-bar]"))).toBeGreaterThan(leftOf(of("above").querySelector("[data-mark]")));
    expect(widthOf(of("below").querySelector("[data-bar]"))).toBeLessThan(leftOf(of("below").querySelector("[data-mark]")));
  });

  it("puts each row on its own scale, so a small figure and a big one can sit together", () => {
    const { container } = shown([row({ key: "small", now: 3, usual: 2 }), row({ key: "big", now: 300, usual: 200 })]);
    const of = (key: string) => widthOf(container.querySelector(`[data-row="${key}"] [data-bar]`));
    expect(of("small")).toBeCloseTo(of("big"));
  });

  it("keeps the mark inside its row when the usual is the bigger", () => {
    const { container } = shown([row({ now: 1, usual: 100 })]);
    expect(leftOf(container.querySelector("[data-mark]"))).toBeLessThan(100);
  });

  it("shows the bar alone with nothing to set it against yet", () => {
    const { container } = shown([row({ usual: null, moved: undefined, usualWord: "No usual yet" })]);
    expect(container.querySelector("[data-bar]")).toBeTruthy();
    expect(container.querySelector("[data-mark]")).toBeNull();
    expect(screen.getByText("No usual yet")).toBeTruthy();
  });

  it("draws nothing past zero with nothing to count", () => {
    const { container } = shown([row({ now: 0, usual: 0 })]);
    expect(widthOf(container.querySelector("[data-bar]"))).toBe(0);
  });

  it("says both figures on hover", () => {
    const { container } = shown([row()]);
    fireEvent.mouseMove(container.querySelector('[data-part="against-bars"]')!, { clientX: 10, clientY: 10 });
    fireEvent.mouseEnter(container.querySelector('[data-row="people"]')!);
    expect(screen.getByText("In the last half hour")).toBeTruthy();
    expect(screen.getByText("In a usual half hour")).toBeTruthy();
  });

  it("stays still for anyone who asks for less motion", () => {
    const { container } = shown([row()]);
    expect(container.querySelector("[data-bar]")!.getAttribute("class")).toContain("motion-reduce:transition-none");
    expect(container.querySelector("[data-mark]")!.getAttribute("class")).toContain("motion-reduce:transition-none");
  });
});
