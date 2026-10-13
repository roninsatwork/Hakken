import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { AlongTick, SiteBarChart, drawnRows } from "./SiteCharts";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());

/**
 * A name beside bars along (`AlongTick`): one line centred on its row, or a
 * long name on two (`wrapName`), as Keyword cannibalisation's groups are.
 */
const drawn = (props: Parameters<typeof AlongTick>[0]) => {
  const { container } = render(<svg><AlongTick x={200} y={40} {...props} /></svg>);
  return [...container.querySelectorAll("tspan")].map((line) => ({ text: line.textContent, dy: line.getAttribute("dy") }));
};

describe("a name beside bars along", () => {
  it("is one line centred on its row", () => {
    expect(drawn({ payload: { value: "app developers" } })).toEqual([{ text: "app developers", dy: "0.355em" }]);
  });

  it("breaks a long name onto two lines, centred together", () => {
    expect(drawn({ payload: { value: "wordpress development agency" } })).toEqual([
      { text: "wordpress development", dy: "-0.3em" },
      { text: "agency", dy: "1.25em" },
    ]);
  });
});

/**
 * A bar's figure beside its own bar (2026-10-13): the chart library draws no
 * bar for a nought and numbers its labels by the bars it drew, so every
 * figure after a nought was written one row low — an article's "1 from 593
 * visits" beside the next article's bar.
 */
describe("a bar's figure", () => {
  it("knows the rows a series draws: every number but nought", () => {
    expect(drawnRows([{ v: 1 }, { v: 0 }, { v: 3 }, { v: null }, { v: "2" }], "v")).toEqual([0, 2, 4]);
  });

  it("is written beside its own bar when a bar before it is nought", async () => {
    // A browser's layout, which the test browser has none of: the chart's box is 800 wide, a word as wide as its letters.
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    const measured = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const text = this.id === "recharts_measurement_span";
      const width = text ? (this.textContent ?? "").length * 7 : 800;
      const height = text ? 16 : (this as HTMLElement).classList?.contains("recharts-legend-wrapper") ? 26 : parseFloat((this as HTMLElement).style?.height ?? "") || 300;
      return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} } as DOMRect;
    });
    try {
      const rows = [
        { label: "Kapferer prism", value: 593, words: "1 from 593 visits" },
        { label: "Neurodiversity", value: 0, words: "0 from 105 visits" },
        { label: "Brand Bible", value: 35, words: "3 from 35 visits" },
      ];
      const { container } = renderWithProviders(
        <SiteBarChart horizontal data={rows} series={[{ key: "value", name: "Visits", colour: "#f97316" }]} labels={(_value, _key, row) => String(row.words)} />,
      );
      await waitFor(() => expect([...container.querySelectorAll(".recharts-label-list text")].map((text) => text.textContent)).toEqual(["1 from 593 visits", "3 from 35 visits"]));
    } finally {
      measured.mockRestore();
    }
  });
});
