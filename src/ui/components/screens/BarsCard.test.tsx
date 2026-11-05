import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import type { ChartReadoutTableProps } from "@/src/ui/components/charts/ChartReadoutTable";
import { BarsCard } from "./BarsCard";

/**
 * What BarsCard writes for every chart of named bars (docs/plans/active/campaigns-new-page-plan-2026-11-05.md, step 7): the download, the
 * hover and each bar's words. `ChartExplorer`, which draws them, has tests of its own, so it's stood in for here.
 */
const handed = vi.hoisted(() => ({ props: null as null | { csv: () => string; readout: (point: { row: Record<string, unknown>; heading: string }) => ChartReadoutTableProps; bars: { labels: (value: number, key: string, row: Record<string, unknown>) => string | null; stacked: boolean }; data: unknown[] } }));
vi.mock("./ChartExplorer", () => ({
  ChartExplorer: (props: NonNullable<typeof handed.props> & { title: string }) => {
    handed.props = props;
    return <div>{props.title}</div>;
  },
}));

const rows = [{ label: "Mobile", now: 1200, before: 900 }, { label: "Tablet", now: 30, before: null }];
const series = [{ key: "now", name: "October", colour: "#f60" }, { key: "before", name: "September", colour: "#999" }];
const card = { title: "Who visits", hint: "By device.", exportName: "who", host: "acme-shop.test", waiting: null, controls: [], rows, series, anything: true, empty: "Nothing." };

describe("BarsCard", () => {
  it("downloads each row's series under its heading, unless the card writes its own", () => {
    render(<BarsCard {...card} csvHeading="Device" />);
    expect(handed.props!.csv().trim().split(/\r?\n/)).toEqual(["Device,October,September", "Mobile,1200,900", "Tablet,30,"]);
    render(<BarsCard {...card} csv={() => "its own"} />);
    expect(handed.props!.csv()).toBe("its own");
  });

  it("its hover names every series, even one with nothing, and a total if it's given one", () => {
    render(<BarsCard {...card} figure="Visits" drawnColumn totalOf={(row) => Number(row.now) + Number(row.before ?? 0)} />);
    const hover = handed.props!.readout({ row: rows[1], heading: "Tablet" });
    expect(hover.columns).toEqual([{ key: "figure", label: "Visits", tone: "band", drawn: true }]);
    expect(hover.rows.map((row) => [row.name, row.cells.figure.text])).toEqual([["October", "30"], ["September", "–"]]);
    expect(hover.total).toEqual({ figure: { text: "30" } });
  });

  it("each bar says its figure with thousands, unless the screen writes its own words", () => {
    render(<BarsCard {...card} />);
    expect(handed.props!.bars.labels(1200, "now", rows[0])).toBe("1,200");
    expect(handed.props!.bars.labels(Number.NaN, "now", rows[0])).toBeNull();
    expect(handed.props!.bars.stacked).toBe(false);
    render(<BarsCard {...card} stacked labels={() => "its words"} />);
    expect(handed.props!.bars.labels(1200, "now", rows[0])).toBe("its words");
    expect(handed.props!.bars.stacked).toBe(true);
  });

  it("hands over a card's own hover in place of the standard one", () => {
    const own: ChartReadoutTableProps = { heading: "own", columns: [], rows: [] };
    render(<BarsCard {...card} readout={() => own} />);
    expect(handed.props!.readout({ row: rows[0], heading: "Mobile" })).toBe(own);
    expect(screen.getAllByText("Who visits").length).toBeGreaterThan(0);
  });
});
