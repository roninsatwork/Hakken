import { describe, expect, it } from "vitest";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import type { ComponentProps, ReactNode } from "react";
import { ChartReadoutTable } from "@/src/ui/components/charts/ChartReadoutTable";
import { useExplorerReadout, type ReadoutLine } from "./ExplorerReadout";

/** The chart's hover as it draws: its rows built here, drawn by the kit's table. */
function ExplorerReadout(props: Omit<Parameters<ReturnType<typeof useExplorerReadout>>[0], "note"> & { note?: ReactNode }) {
  const tableOf = useExplorerReadout();
  const table: ComponentProps<typeof ChartReadoutTable> = tableOf(props);
  return <ChartReadoutTable {...table} />;
}

/**
 * A page's "Visits needed for one conversion, by channel": its hover readout, a small table that follows the chart's
 * dropdowns (Anthony, 2026-10-20, Hover B: "it should adapt for drop down selection"). Hurtwood House's home page,
 * 21–27 September, against 22–28 June.
 */

const CHANNELS: ReadoutLine[] = [
  { key: "c:Organic Search", name: "Organic Search", colour: "#f97316", now: { visits: 456, conversions: 14 }, then: { visits: 427, conversions: 11 } },
  { key: "c:Paid Search", name: "Paid Search", colour: "#3b82f6", now: { visits: 187, conversions: 4 }, then: { visits: 4, conversions: 0 } },
  { key: "c:Referral", name: "Referral", colour: "#14b8a6", now: { visits: 29, conversions: 0 }, then: { visits: 20, conversions: 0 } },
];
const TOTAL = { now: { visits: 672, conversions: 18 }, then: { visits: 451, conversions: 11 } };
const headers = () => [...document.querySelectorAll("[data-readout-head]")].map((cell) => cell.textContent);

describe("a page's visits for one conversion, its readout", () => {
  it("is a row a channel and their total: visits, conversions and visits for one, a count of none 0 and nothing to divide a dash", () => {
    render(<ExplorerReadout heading="21 Sept – 27 Sept" against={null} measure="perOne" linesBy="channel" lines={CHANNELS} total={{ now: TOTAL.now, then: null }} />);
    screen.getByText("21 Sept – 27 Sept");
    expect(headers()).toEqual(["Visits", "Conversions", "For one"]);
    screen.getByText("Organic Search");
    screen.getByText("All three");
    screen.getByText("33");
    screen.getByText("672");
    // Referral: 29 visits, a count of 0 conversions, and no visits for one to work out.
    screen.getByText("0");
    screen.getByText("–");
    expect(screen.queryByText(/^was/)).toBeNull();
  });

  it("follows Show: the rate in place of visits for one", () => {
    render(<ExplorerReadout heading="21 Sept – 27 Sept" against={null} measure="rate" linesBy="channel" lines={CHANNELS} total={{ now: TOTAL.now, then: null }} />);
    expect(headers()).toEqual(["Visits", "Conversions", "Rate"]);
    screen.getByText("3.1%");
    screen.getByText("0%");
  });

  it("follows Lines: a row a kind of conversion, their shared visits said once above them", () => {
    const kinds: ReadoutLine[] = [
      { key: "k:click-apply-now", name: "Click apply now", colour: "#f97316", now: { visits: 787, conversions: 8 }, then: null },
      { key: "k:purchase", name: "Purchase", colour: "#3b82f6", now: { visits: 787, conversions: 0 }, then: null },
    ];
    render(<ExplorerReadout heading="21 Sept – 27 Sept" against={null} measure="conversions" linesBy="kind" lines={kinds} total={{ now: { visits: 787, conversions: 8 }, then: null }} note="787 visits from the channels ticked" />);
    expect(headers()).toEqual(["Conversions", "For one"]);
    screen.getByText("787 visits from the channels ticked");
    screen.getByText("Both");
    // Click apply now's visits for one, and the total's: 787 visits over 8 conversions each.
    expect(screen.getAllByText("98")).toHaveLength(2);
  });

  it("follows Against: the step set against in the heading, and what each figure was beneath it", () => {
    render(<ExplorerReadout heading="21 Sept – 27 Sept" against="22 June – 28 June" measure="perOne" linesBy="channel" lines={CHANNELS} total={TOTAL} />);
    screen.getByText("21 Sept – 27 Sept, against 22 June – 28 June");
    expect(screen.getAllByText("was").length).toBeGreaterThan(0);
    screen.getByText("427");
    // Organic Search's visits for one, 39 then; Paid Search had no conversion to divide by.
    screen.getByText("39");
  });

  it("keeps a row for every line ticked, its noughts shown", () => {
    const quiet: ReadoutLine[] = [...CHANNELS, { key: "c:Display", name: "Display", colour: "#8b5cf6", now: { visits: 0, conversions: 0 }, then: null }, { key: "c:Paid Social", name: "Paid Social", colour: "#94a3b8", now: { visits: 0, conversions: 0 }, then: null }];
    render(<ExplorerReadout heading="14 Sept – 20 Sept" against={null} measure="perOne" linesBy="channel" lines={quiet} total={{ now: TOTAL.now, then: null }} />);
    screen.getByText("Display");
    screen.getByText("Paid Social");
    // Referral's, Display's and Paid Social's conversions, and the two channels' visits: each a 0 of its own.
    expect(screen.getAllByText("0")).toHaveLength(5);
    screen.getByText("All five");
  });

  it("has no total under a single line", () => {
    render(<ExplorerReadout heading="21 Sept – 27 Sept" against={null} measure="perOne" linesBy="one" lines={[{ ...CHANNELS[0], key: "all", name: "Everything ticked" }]} total={{ now: CHANNELS[0].now, then: null }} />);
    screen.getByText("Everything ticked");
    expect(screen.queryByText(/^All /)).toBeNull();
  });
});
