"use client";

import type { ReactNode } from "react";
import type { SiteSeries } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import { formatNumber, toCsv } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";
import type { ChartReadoutTableProps } from "@/src/ui/components/charts/ChartReadoutTable";
import { ChartExplorer, type ExplorerControl } from "./ChartExplorer";

type BarRow = { label: string } & Record<string, unknown>;

/**
 * Named things as bars along, with their menus and their hover: the kit's chart with menus as bars, with what every such chart
 * writes done once (Anthony, 2026-11-05: "I only want reusable shared components"; docs/plans/active/campaigns-new-page-plan-2026-11-05.md,
 * step 7). Visits' who, a page's who looks and its visitors, and both of Products' charts each wrote their own until then. It's given
 * plain figures and reads nothing. Each bar says its figure. The hover lists every series, and a card that needs more hands over its own.
 */
export function BarsCard({ title, hint, exportName, csvHeading, csv, host, waiting, controls, nothingTicked = null, rows, series, figure, drawnColumn = false, totalOf, readout, stacked = false, labels, anything, empty }: {
  title: string;
  hint: string;
  exportName: string;
  /** The download's first heading: what the bars are. Its columns are the series. */
  csvHeading?: string;
  /** The download, where it isn't simply each row's series. */
  csv?: () => string;
  host: string;
  /** As `ChartExplorer`'s: undefined while the figures load, words in place of everything while they can't be drawn. */
  waiting: string | null | undefined;
  controls: readonly ExplorerControl[];
  /** Words in place of the chart when a tick box has nothing ticked. */
  nothingTicked?: string | null;
  rows: ReadonlyArray<BarRow>;
  series: SiteSeries[];
  /** What the bars count, at the head of the hover's column. */
  figure?: string;
  /** Mark that column with a short line, as the figure the bars are drawing. */
  drawnColumn?: boolean;
  /** A total under the hover's rows: every series added up, for a bar split into parts. */
  totalOf?: (row: Record<string, unknown>) => number;
  /** The hover, for a card whose figures need more than a row a series. */
  readout?: (point: { row: Record<string, unknown>; heading: ReactNode }) => ChartReadoutTableProps;
  stacked?: boolean;
  /** Each bar's words. A number with thousands, unless it says otherwise. */
  labels?: (value: number, key: string, row: Record<string, unknown>) => string | null;
  anything: boolean;
  empty: string;
}) {
  const standard = ({ row, heading }: { row: Record<string, unknown>; heading: ReactNode }): ChartReadoutTableProps => ({
    heading,
    columns: [{ key: "figure", label: figure ?? "", tone: "band", ...(drawnColumn ? { drawn: true } : {}) }],
    rows: series.map((entry) => {
      const value = row[entry.key];
      return { key: entry.key, name: entry.name, colour: entry.colour, cells: { figure: typeof value === "number" ? { text: formatNumber(value) } : { text: "–", quiet: true } } };
    }),
    ...(totalOf ? { total: { figure: { text: formatNumber(totalOf(row)) } } } : {}),
  });
  return (
    <ChartExplorer
      title={title}
      hint={hint}
      exportName={exportName}
      csv={csv ?? (() => toCsv([csvHeading ?? "", ...series.map((entry) => entry.name)], rows.map((row) => [row.label, ...series.map((entry) => (row[entry.key] as number | null | undefined) ?? null)])))}
      host={host}
      from={null}
      to={null}
      waiting={waiting}
      controls={controls}
      nothingTicked={nothingTicked}
      data={[...rows]}
      series={series}
      readout={readout ?? standard}
      anything={anything}
      empty={empty}
      bars={{ labels: labels ?? ((value: number) => (Number.isFinite(value) ? formatNumber(value) : null)), stacked }}
    />
  );
}
