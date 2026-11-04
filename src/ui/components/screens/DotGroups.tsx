"use client";

import { SiteScatterChart, type SiteScatterGroup } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import { CHART_COMPARATOR_GREY, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_TEAL } from "@/src/ui/components/charts/chartPalette";
import { ExplorerToolbar, type ExplorerControl } from "./ChartExplorer";

/**
 * Dots in four named groups, split by two lines, with a menu above them (Anthony, 2026-11-04, on All pages' Way 4: "this
 * control is lovely please make this a standard component too"): each dot a page, the further right the more of one figure,
 * the higher the more of the other. The scales stop close to the dots. A few dots can say their names on the chart, and
 * those don't repeat in the key. Built on the kit's `SiteScatterChart`, so it has its ring and its hover. No page uses it yet.
 */
export type DotPoint = {
  x: number;
  y: number;
  label: string;
  /** Write its name beside its dot. Keep these few, or they run into each other. */
  named?: boolean;
};

export type DotGroupKey = "rightHigh" | "rightLow" | "leftHigh" | "leftLow";

/** In the key's order, as drawn. Grey for the group that's neither busy nor doing well. */
const GROUPS: ReadonlyArray<{ key: DotGroupKey; colour: string }> = [
  { key: "leftLow", colour: CHART_COMPARATOR_GREY },
  { key: "rightHigh", colour: CHART_SERIES_TEAL },
  { key: "rightLow", colour: CHART_SERIES_ORANGE },
  { key: "leftHigh", colour: CHART_SERIES_BLUE },
];

/** Which group a dot falls in. A dot on a line counts as past it. */
export function dotGroupOf(point: Pick<DotPoint, "x" | "y">, split: { x: number; y: number }): DotGroupKey {
  if (point.x >= split.x) return point.y >= split.y ? "rightHigh" : "rightLow";
  return point.y >= split.y ? "leftHigh" : "leftLow";
}

/** The chart's groups: each of the four with its dots, and those that say their names as a group of their own, out of the key. */
export function dotGroupsOf(points: readonly DotPoint[], split: { x: number; y: number }, names: Readonly<Record<DotGroupKey, string>>): SiteScatterGroup[] {
  return GROUPS.flatMap(({ key, colour }) => {
    const own = points.filter((point) => dotGroupOf(point, split) === key);
    const plain = own.filter((point) => !point.named).map(({ x, y, label }) => ({ x, y, label }));
    const named = own.filter((point) => point.named).map(({ x, y, label }) => ({ x, y, label }));
    return [
      { key, name: names[key], colour, points: plain },
      ...(named.length > 0 ? [{ key: `${key}Named`, name: names[key], colour, labelled: true, inKey: false, points: named }] : []),
    ];
  });
}

export function DotGroups({ points, split, names, xLabel, yLabel, readout, controls = [], height }: {
  points: readonly DotPoint[];
  /** Where the lines between the groups fall. */
  split: { x: number; y: number };
  /** What each group is called, in the words of the page: "Busy, not often added". */
  names: Readonly<Record<DotGroupKey, string>>;
  xLabel: string;
  yLabel: string;
  /** Short names for the two figures in the hover, where an axis's own name is too long. */
  readout?: { x: string; y: string };
  /** The menu above the dots, as on a chart with menus. */
  controls?: readonly ExplorerControl[];
  height?: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      {controls.length > 0 ? <ExplorerToolbar controls={controls} /> : null}
      <SiteScatterChart groups={dotGroupsOf(points, split, names)} xLabel={xLabel} yLabel={yLabel} readout={readout} height={height} scale="tight" />
    </div>
  );
}
