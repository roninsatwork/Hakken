import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HundredGrid, type HundredGroup } from "./HundredGrid";
import { HundredStrips, stripColour, type StripSegment } from "./HundredStrips";

const groups: HundredGroup[] = [
  { key: "left", name: "Left straight away", count: 38, colour: "#111111", was: "34", readout: [{ value: "13,739", label: "Visits" }] },
  { key: "looked", name: "Looked around, then left", count: 59, colour: "#222222", was: "62", readout: [{ value: "21,000", label: "Visits" }] },
  { key: "bought", name: "Bought", count: 3, colour: "#333333", was: "3", readout: [{ value: "1,205", label: "Visits" }] },
];

describe("HundredGrid", () => {
  it("draws one square for each count, and names each row", () => {
    const { container } = render(<HundredGrid groups={groups} nowLabel="October" wasLabel="September" label="Out of every 100 visits" />);
    expect(container.querySelectorAll("[data-square]")).toHaveLength(100);
    expect(container.querySelectorAll('[data-square="bought"]')).toHaveLength(3);
    screen.getByText("Left straight away");
    screen.getByText("October");
    screen.getByText("September");
    screen.getByRole("img", { name: /Out of every 100 visits, 38 Left straight away, 59 Looked around, then left, 3 Bought/ });
  });

  it("draws a thousand squares just as well", () => {
    const many = [{ ...groups[0], count: 996 }, { ...groups[2], count: 4 }];
    const { container } = render(<HundredGrid groups={many} cells={1000} nowLabel="October" wasLabel="" label="Out of every 1,000 visits" />);
    expect(container.querySelectorAll("[data-square]")).toHaveLength(1000);
  });

  it("lights a row on hover and shows its readout, and pressing keeps it lit", () => {
    const { container } = render(<HundredGrid groups={groups} nowLabel="October" wasLabel="September" label="Squares" />);
    const part = container.querySelector('[data-part="hundred-grid"]') as HTMLElement;
    const row = container.querySelector('[data-key="bought"]') as HTMLElement;
    fireEvent.mouseEnter(row);
    screen.getByText("1,205");
    const other = container.querySelector('[data-square="left"]') as HTMLElement;
    expect(other.style.opacity).toBe("0.25");
    // Crossing the gap between two squares lets nothing go, or the chart flickers: only leaving the whole part does.
    fireEvent.mouseLeave(row, { relatedTarget: part });
    expect(other.style.opacity).toBe("0.25");
    fireEvent.mouseLeave(part);
    expect(screen.queryByText("1,205")).toBeNull();
    expect(other.style.opacity).toBe("1");
    fireEvent.click(row);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(other.style.opacity).toBe("0.25");
    fireEvent.click(row);
    expect(row.getAttribute("aria-pressed")).toBe("false");
  });

  it("copes with nothing to draw", () => {
    const { container } = render(<HundredGrid groups={[]} nowLabel="October" wasLabel="" label="Squares" />);
    expect(container.querySelectorAll("[data-square]")).toHaveLength(0);
  });
});

const segments: StripSegment[] = [
  { key: "Organic Search", name: "Organic Search", top: 37, bottom: 24, colour: stripColour(0), readout: [{ value: "13,000", label: "Visits" }] },
  { key: "Paid Search", name: "Paid Search", top: 3, bottom: 9, colour: stripColour(1), readout: [{ value: "1,100", label: "Visits" }] },
  { key: "Direct", name: "Direct", top: 60, bottom: 67, colour: stripColour(2), readout: [{ value: "21,000", label: "Visits" }] },
];

describe("HundredStrips", () => {
  it("names every thing in the list under the chart, with its two figures", () => {
    render(<HundredStrips segments={segments} topLabel="Out of every 100 visits" bottomLabel="Out of every 100 sales" lit={null} onLit={() => undefined} />);
    screen.getByText("Out of every 100 visits");
    screen.getByText("Out of every 100 sales");
    screen.getByText("37 → 24");
    screen.getByText("3 → 9");
  });

  it("tells the page which one is pressed, and lets go when pressed again", () => {
    const onLit = vi.fn();
    const { container, rerender } = render(<HundredStrips segments={segments} topLabel="Top" bottomLabel="Bottom" lit={null} onLit={onLit} />);
    const row = container.querySelector('[data-key="Paid Search"]') as HTMLElement;
    fireEvent.click(row);
    expect(onLit).toHaveBeenCalledWith("Paid Search");
    rerender(<HundredStrips segments={segments} topLabel="Top" bottomLabel="Bottom" lit="Paid Search" onLit={onLit} />);
    expect((container.querySelector('[data-segment="Direct"]') as SVGElement).getAttribute("opacity")).toBe("0.25");
    fireEvent.click(row);
    expect(onLit).toHaveBeenCalledWith(null);
  });

  it("shows a thing's readout on hover, and keeps it across the gap between two cells", () => {
    const { container } = render(<HundredStrips segments={segments} topLabel="Top" bottomLabel="Bottom" lit={null} onLit={() => undefined} />);
    const segment = container.querySelector('[data-segment="Paid Search"]') as Element;
    const other = container.querySelector('[data-segment="Direct"]') as SVGElement;
    fireEvent.mouseEnter(segment);
    screen.getByText("1,100");
    expect(other.getAttribute("opacity")).toBe("0.25");
    const part = container.querySelector('[data-part="hundred-strips"]') as Element;
    fireEvent.mouseLeave(segment, { relatedTarget: part });
    screen.getByText("1,100");
    expect(other.getAttribute("opacity")).toBe("0.25");
    fireEvent.mouseLeave(part);
    expect(screen.queryByText("1,100")).toBeNull();
    expect(other.getAttribute("opacity")).toBe("1");
  });

  it("gives the six busiest a colour each, and the rest share grey", () => {
    expect(new Set([0, 1, 2, 3, 4, 5].map(stripColour)).size).toBe(6);
    expect(new Set([6, 7, 8, 9].map(stripColour)).size).toBe(2);
  });

  it("copes with nothing to draw, and with all nought", () => {
    const { container, rerender } = render(<HundredStrips segments={[]} topLabel="Top" bottomLabel="Bottom" lit={null} onLit={() => undefined} />);
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(0);
    rerender(<HundredStrips segments={[{ ...segments[0], top: 0, bottom: 0 }]} topLabel="Top" bottomLabel="Bottom" lit={null} onLit={() => undefined} />);
    screen.getByText("0 → 0");
  });
});
