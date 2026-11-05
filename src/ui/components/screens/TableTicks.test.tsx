import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import { TickActions, TickCount, tickColumn, type TableTicks } from "./TableTicks";

type Row = { key: string; views: number };
const rows: Row[] = [{ key: "a", views: 9 }, { key: "b", views: 0 }, { key: "c", views: 7 }, { key: "d", views: 5 }];
const rowKey = (row: Row) => row.key;
const hasViews = (row: Row) => row.views > 0;

function ticks(keys: string[], most = 2) {
  return { keys, most, limit: "Two at most", set: vi.fn<TableTicks["set"]>() };
}

function show(node: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={en}>{node}</NextIntlClientProvider>);
}

describe("a table's Clear all and Select top", () => {
  test("Select top takes the first rows in the table's order, as many as can be ticked, past any that can't", () => {
    const one = ticks(["d"]);
    show(<TickActions ticks={one} rows={rows} rowKey={rowKey} canTick={hasViews} />);
    fireEvent.click(screen.getByRole("button", { name: "Select top 2" }));
    expect(one.set).toHaveBeenCalledWith(["a", "c"]);
  });

  test("Clear all takes every tick off", () => {
    const one = ticks(["a", "d"]);
    show(<TickActions ticks={one} rows={rows} rowKey={rowKey} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(one.set).toHaveBeenCalledWith([]);
  });

  test("with nothing ticked there's nothing to clear, and with the top ticked there's nothing to select", () => {
    show(<TickActions ticks={ticks([])} rows={rows} rowKey={rowKey} />);
    expect((screen.getByRole("button", { name: "Clear all" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Select top 2" }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("the top ticked in another order still counts as the top", () => {
    show(<TickActions ticks={ticks(["b", "a"])} rows={rows} rowKey={rowKey} />);
    expect((screen.getByRole("button", { name: "Select top 2" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Clear all" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("a table's count of what's ticked", () => {
  test("says how many of the most it can hold", () => {
    show(<TickCount ticks={ticks(["a", "c", "d"], 10)} />);
    expect(screen.getByText("3 of 10 on the chart")).toBeInTheDocument();
  });
});

describe("a table's tick column", () => {
  const labelled = { rowKey, label: (row: Row) => `Tick ${row.key}`, heading: "Chosen" };

  test("a tick adds to what's ticked, and taking one off leaves the rest", () => {
    const one = ticks(["a"], 3);
    const column = tickColumn(one, labelled);
    show(<>{column.cell(rows[2])}{column.cell(rows[0])}</>);
    fireEvent.click(screen.getByRole("checkbox", { name: "Tick c" }));
    expect(one.set).toHaveBeenLastCalledWith(["a", "c"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Tick a" }));
    expect(one.set).toHaveBeenLastCalledWith([]);
  });

  test("at the most, a box not ticked says why it can't be, and one ticked can still come off", () => {
    const column = tickColumn(ticks(["a", "c"]), labelled);
    show(<>{column.cell(rows[3])}{column.cell(rows[0])}</>);
    expect((screen.getByRole("checkbox", { name: "Tick d" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Tick a" }) as HTMLInputElement).disabled).toBe(false);
  });

  test("a row with nothing to choose has no box", () => {
    expect(tickColumn(ticks([]), { ...labelled, canTick: hasViews }).cell(rows[1])).toBeNull();
  });

  test("a tick doesn't open the row", () => {
    const opened = vi.fn();
    const column = tickColumn(ticks([], 3), labelled);
    show(<div onClick={opened}>{column.cell(rows[0])}</div>);
    fireEvent.click(screen.getByRole("checkbox", { name: "Tick a" }));
    expect(opened).not.toHaveBeenCalled();
  });
});
