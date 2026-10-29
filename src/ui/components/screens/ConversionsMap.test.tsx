import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import { ConversionsMap, cellValue, changeWords, type ConversionsMapColumn, type ConversionsMapRow } from "./ConversionsMap";

vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());

/**
 * The Conversions map (conversion-charts-plan.md): a square in visits, as a rate of the column's visits, or in
 * times; its change against the span before when compared; the heading's full name on hover.
 */

const columns: ConversionsMapColumn[] = [
  { key: "cupboards", name: "Cupboard Handles", visits: 6568, visitsBefore: 6000 },
  { key: "brand", name: "Brand", visits: 3534, visitsBefore: 3000 },
];
const rows: ConversionsMapRow[] = [
  { eventName: "purchase", name: "Purchase", counted: true, cells: [{ visits: 236, times: 236, visitsBefore: 200, timesBefore: 200 }, { visits: 201, times: 201, visitsBefore: 0, timesBefore: 0 }] },
  { eventName: "add_to_cart", name: "Added to basket", counted: true, cells: [{ visits: 959, times: 4227, visitsBefore: 1000, timesBefore: 4300 }, { visits: 0, times: 0, visitsBefore: 0, timesBefore: 0 }] },
];
const words = {
  rowTotal: (_row: ConversionsMapRow, total: { visits: number; times: number; rate: number }) => `${total.visits} visits`,
  hover: (row: ConversionsMapRow, column: ConversionsMapColumn, value: string) => `${row.name} → ${column.name}: ${value}`,
  shades: "a smaller to a bigger share of the row",
  empty: "none",
};

const draw = (count: "visits" | "rate" | "events", compare = false) =>
  render(<ConversionsMap title="Conversions" controls={<span>controls</span>} columns={columns} rows={rows} count={count} compare={compare} words={words} newWord="new" exportName="map" csv={() => ""} />);

describe("ConversionsMap", () => {
  it("shows each square in the unit chosen: visits, a rate of the column's visits, or times", () => {
    expect(cellValue("visits", rows[1].cells[0], columns[0])).toEqual({ now: 959, before: 1000 });
    expect(cellValue("events", rows[1].cells[0], columns[0])).toEqual({ now: 4227, before: 4300 });
    expect(cellValue("rate", rows[0].cells[0], columns[0]).now).toBeCloseTo(236 / 6568);
    const { unmount } = draw("rate");
    expect(screen.getByLabelText("Purchase → Cupboard Handles: 3.6%")).toHaveTextContent("3.6%");
    expect(screen.getByLabelText("Purchase → Brand: 5.7%")).toHaveTextContent("5.7%");
    unmount();
    draw("events");
    expect(screen.getByLabelText("Added to basket → Cupboard Handles: 4,227")).toHaveTextContent("4,227");
  });

  it("says each square's change against the span before when compared, 'new' from nothing", () => {
    expect(changeWords(236, 200, "new")).toBe("▲ 18.0%");
    expect(changeWords(959, 1000, "new")).toBe("▼ 4.1%");
    expect(changeWords(201, 0, "new")).toBe("new");
    expect(changeWords(0, 0, "new")).toBeNull();
    expect(changeWords(100, null, "new")).toBeNull();
    draw("visits", true);
    expect(screen.getByLabelText("Purchase → Cupboard Handles: 236")).toHaveTextContent("▲ 18.0%");
    expect(screen.getByLabelText("Purchase → Brand: 201")).toHaveTextContent("new");
  });

  it("names a column in full on its heading's tooltip, and leaves an empty square empty", () => {
    draw("visits");
    expect(screen.getAllByText("Cupboard Handles").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Added to basket → Brand: 0")).toBeEmptyDOMElement();
    expect(screen.getByText("a smaller to a bigger share of the row")).toBeInTheDocument();
  });
});
