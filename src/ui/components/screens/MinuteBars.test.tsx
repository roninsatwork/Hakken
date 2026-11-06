import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { LiveDot } from "./LiveDot";
import { MinuteBars, type MinuteBar } from "./MinuteBars";

const bars = (values: readonly number[], from = 0): MinuteBar[] => values.map((value, at) => ({ key: from + at, value, label: at === values.length - 1 ? "Now" : `${values.length - 1 - at} min ago` }));
const measure = (value: number) => (value === 1 ? "Person" : "People");

describe("MinuteBars (docs/plans/active/live-new-page-plan-2026-11-06.md)", () => {
  it("draws one bar a step, in real pixels, each saying its figure", () => {
    const { container } = render(<MinuteBars bars={bars([1, 2, 3, 2])} name="People each minute" measure={measure} />);
    expect(container.querySelectorAll("[data-bar]")).toHaveLength(4);
    const drawing = container.querySelector("svg")!;
    expect(drawing.getAttribute("height")).toBe("170");
    expect(drawing.getAttribute("width")).not.toBe("100%");
    expect([...container.querySelectorAll("text")].map((text) => text.textContent)).toEqual(expect.arrayContaining(["1", "2", "3", "Now"]));
  });

  it("lights the newest, and marks it as the one coming in", () => {
    const { container } = render(<MinuteBars bars={bars([1, 2])} name="People each minute" measure={measure} />);
    const [oldest, newest] = [...container.querySelectorAll("[data-bar]")];
    expect(oldest.getAttribute("fill-opacity")).toBe("0.55");
    expect(newest.getAttribute("fill-opacity")).toBe("1");
    expect(container.querySelectorAll("[data-now]")).toHaveLength(1);
  });

  it("keeps a step's bar as it moves along, so it slides rather than being drawn again", () => {
    const { container, rerender } = render(<MinuteBars bars={bars([1, 2, 3])} name="People each minute" measure={measure} />);
    const second = container.querySelectorAll("g[data-minute]")[1];
    rerender(<MinuteBars bars={bars([2, 3, 4], 1)} name="People each minute" measure={measure} />);
    expect(container.querySelectorAll("g[data-minute]")[0]).toBe(second);
  });

  it("draws an empty step low and grey, and says no figure for it", () => {
    const { container } = render(<MinuteBars bars={bars([0, 2])} name="People each minute" measure={measure} />);
    const empty = container.querySelector("[data-bar]")!;
    expect(empty.getAttribute("height")).toBe("2");
    expect([...container.querySelectorAll("text")].map((text) => text.textContent)).not.toContain("0");
  });

  it("names the step and its figure on hover", () => {
    const { container } = render(<MinuteBars bars={bars([1, 2, 3])} name="People each minute" measure={measure} />);
    const part = container.querySelector('[data-part="minute-bars"]')!;
    fireEvent.mouseMove(part, { clientX: 10, clientY: 10 });
    fireEvent.mouseEnter(container.querySelectorAll("g[data-minute]")[0]);
    expect(screen.getByText("2 min ago", { selector: "div" })).toBeTruthy();
    expect(screen.getByText("Person")).toBeTruthy();
    fireEvent.mouseLeave(part);
    expect(screen.queryByText("Person")).toBeNull();
  });

  it("says fewer labels and figures where there's no room, keeping the newest and the busiest", () => {
    const values = Array.from({ length: 30 }, (_, at) => (at === 10 ? 9 : 1));
    const box = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 300 } as DOMRect);
    const { container } = render(<MinuteBars bars={bars(values)} name="People each minute" measure={measure} />);
    box.mockRestore();
    const words = [...container.querySelectorAll("text")].map((text) => text.textContent);
    expect(words.filter((word) => /min ago|Now/.test(word ?? ""))).toEqual(["20 min ago", "10 min ago", "Now"]);
    // The busiest and the newest say their figures; the rest can't fit.
    expect(words.filter((word) => /^\d+$/.test(word ?? ""))).toEqual(["9", "1"]);
  });

  it("slides its bars by a transition on the element, and stays still for anyone who asks for less motion", () => {
    const { container, unmount } = render(<><MinuteBars bars={bars([1, 2])} name="People each minute" measure={measure} /><LiveDot /></>);
    expect((container.querySelector("g[data-minute]") as SVGGElement).style.transition).toContain("transform");
    expect((container.querySelector("[data-bar]") as SVGRectElement).style.transition).toContain("height");
    unmount();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), addEventListener: () => undefined, removeEventListener: () => undefined }));
    const still = render(<><MinuteBars bars={bars([1, 2])} name="People each minute" measure={measure} /><LiveDot /></>).container;
    expect((still.querySelector("g[data-minute]") as SVGGElement).style.transition).toBe("none");
    expect((still.querySelector("[data-bar]") as SVGRectElement).style.transition).toBe("none");
    expect(still.querySelector("[data-now]")!.getAttribute("class")).toContain("motion-reduce:animate-none");
    expect(still.querySelector('[data-part="live-dot"] span')!.getAttribute("class")).toContain("motion-reduce:animate-none");
  });
});
