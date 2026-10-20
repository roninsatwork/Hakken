"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChartReadoutTable, type ChartReadoutTableProps } from "@/src/ui/components/charts/ChartReadoutTable";
import { SiteBarChart, SiteLineChart, type SiteSeries } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import { SearchConsoleChartCard } from "@/src/app/(dashboard)/app/search-console/_components/SearchConsoleChartCard";
import { CompactList } from "./CompactList";
import { Select } from "./Select";
import { StatusLabel } from "./StatusLabel";
import { TickSelect } from "./TickSelect";
import { verdictOf, type ExplorerScore, type ExplorerStep } from "./chartExplorerRule";

/** A dropdown on the toolbar: one choice (what to show, what each line is, what to set it against), or tick boxes. */
export type ExplorerControl =
  | { kind: "select"; key: string; label: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (value: string) => void }
  | { kind: "ticks"; key: string; label: string; everyWord: string; choices: ReadonlyArray<{ key: string; label: string }>; ticked: readonly string[]; onChange: (next: string[]) => void };

/**
 * A configurable chart: the style every chart a reader can explore takes (docs/developer/screen-kit.md, "Configurable
 * charts"; built for a page's "Visits needed for one conversion, by channel" and locked in 2026-10-20, Anthony: "I
 * think this is great, let's lock this in as a component style"). In its card, in this order:
 *
 * - **A toolbar of dropdowns**, each a chip saying its label and choice. Every chip looks the same whatever is
 *   picked — the words say the choice ("I don't understand how these button colours are supposed to work"; "same").
 *   Tick boxes open with "Select all" and "Deselect all".
 * - **The chart**: lines over the page's dates, stepping by day, week or month as the dates call for; a line breaks
 *   where a step has no figure; a week or month the dates cut is an open ring, its hover naming its days.
 * - **Its hover**: a small table, a row a line with their total (`ChartReadoutTable`), every line its own row.
 * - **Better or worse** under it: each line's latest whole step against the one before, the last three against the
 *   three before, and — for 12 months only — the last three against the same three a year before.
 *
 * A dropdown with nothing ticked puts words in place of the chart and the scorecard, saying what to tick.
 *
 * As bars (`bars`), for figures over the dates chosen rather than over time (Anthony, 2026-10-20: a page's "Visitors to
 * this page", page-visitors-explorer-plan.md): bars along, each saying its figure, the same toolbar and hover table,
 * and no scorecard — a span's totals have no steps to set against each other.
 */
export function ChartExplorer({ title, hint, exportName, csv, host, from, to, step, waiting, controls, nothingTicked, data, series, readout, anything, empty, scores, bars }: {
  /** What the chart shows and what each line is, as the dropdowns set them: "Conversions, by channel". */
  title: string;
  hint: string;
  exportName: string;
  csv: () => string;
  host: string;
  from: string | null;
  to: string | null;
  /** What each point is; none for bars, which stand for the dates chosen. */
  step?: ExplorerStep;
  /** Undefined while the figures load (nothing drawn); words in place of everything while they cannot be drawn ("Still being collected"); null once they can. */
  waiting: string | null | undefined;
  controls: readonly ExplorerControl[];
  /** Words in place of the chart and the scorecard when a dropdown has nothing ticked: "Tick at least one channel". */
  nothingTicked: string | null;
  data: Array<Record<string, unknown>>;
  series: SiteSeries[];
  /** The hover's table for a point: its rows, columns and total, drawn by `ChartReadoutTable`. */
  readout: (point: { row: Record<string, unknown>; heading: ReactNode }) => ChartReadoutTableProps;
  /** Whether any line has a figure in the dates; without one, `empty` is said in place of the chart. */
  anything: boolean;
  empty: string;
  /** Lines only: better or worse for each line. */
  scores?: { rows: readonly ExplorerScore[]; figure: (value: number | null) => string; fewerIsBetter: boolean; withYear: boolean };
  /** Draw bars along rather than lines over time: each bar's own words, stacked for a split. */
  bars?: { labels: (value: number, key: string, row: Record<string, unknown>) => string | null; stacked?: boolean };
}) {
  const t = useTranslations("ui.chartExplorer");
  const verdict = (now: number | null, then: number | null) => {
    const said = verdictOf(scores?.fewerIsBetter ?? false, now, then);
    if (!said) return <span className="text-[12px] text-muted">–</span>;
    if (said.kind === "same") return <span className="text-[12px] text-secondary">{t("same")}</span>;
    return <StatusLabel tone={said.kind === "better" ? "success" : "danger"}>{t(said.kind, { by: said.by })}</StatusLabel>;
  };
  const cell = (value: number | null) => <span className="font-mono text-[12px] text-foreground">{scores ? scores.figure(value) : "–"}</span>;
  const table = (point: { row: Record<string, unknown>; heading: ReactNode }) => <ChartReadoutTable {...readout(point)} />;

  return (
    <SearchConsoleChartCard title={title} hint={hint} exportName={exportName} csv={csv} host={host} from={from} to={to} step={step}>
      {waiting === undefined ? null : waiting !== null ? <p className="py-10 text-center text-[12px] text-muted">{waiting}</p> : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            {controls.map((control) => (control.kind === "select" ? (
              <Select
                key={control.key}
                aria-label={control.label}
                value={control.value}
                onChange={control.onChange}
                chip={{ label: control.label, choice: control.options.find((option) => option.value === control.value)?.label ?? null, changed: false }}
              >
                {control.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            ) : (
              <TickSelect key={control.key} label={control.label} everyWord={control.everyWord} choices={control.choices} ticked={control.ticked} onChange={control.onChange} changed={false} />
            )))}
          </div>
          {nothingTicked !== null ? <p className="py-10 text-center text-[13px] text-muted">{nothingTicked}</p> : (
            <>
              {!anything ? <p className="py-10 text-center text-[12px] text-muted">{empty}</p>
                : bars ? <SiteBarChart horizontal data={data} series={series} stacked={bars.stacked} labels={bars.labels} readout={table} />
                  : <SiteLineChart data={data} series={series} sharedScale readout={table} keepEmptyRows breakGaps />}
              {scores ? <CompactList
                rows={[...scores.rows]}
                rowKey={(score) => score.key}
                empty={empty}
                columns={[
                  { key: "line", header: t("scoreLine"), cell: (score) => <span className="text-[13px] text-foreground">{score.name}</span> },
                  { key: "latest", header: t("latest", { step: step ?? "day" }), align: "right", cell: (score) => cell(score.latest) },
                  { key: "previous", header: t("previous"), align: "right", cell: (score) => verdict(score.latest, score.previous) },
                  { key: "last3", header: t("last3", { step: step ?? "day" }), align: "right", cell: (score) => cell(score.last3) },
                  { key: "previous3", header: t("previous3"), align: "right", cell: (score) => verdict(score.last3, score.previous3) },
                  ...(scores.withYear ? [{ key: "yearAgo", header: t("yearAgo"), align: "right" as const, cell: (score: ExplorerScore) => verdict(score.last3, score.yearAgo) }] : []),
                ]}
              /> : null}
            </>
          )}
        </div>
      )}
    </SearchConsoleChartCard>
  );
}
