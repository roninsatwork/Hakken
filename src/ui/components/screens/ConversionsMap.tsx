"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CHART_ENGAGEMENT_RAMP } from "@/src/ui/components/charts/chartPalette";
import { ChartCard } from "./ChartCard";
import { ChannelMap, type ChannelMapRow } from "./ChannelMap";
import { Select } from "./Select";

/**
 * The Conversions map (docs/plans/active/conversion-charts-plan.md, agreed
 * 2026-10-29): each conversion down the side, a kind across — page kind,
 * channel, device or country — and a square for each, in visits that did it,
 * as a rate of the column's visits, or in times it happened. Brighter is a
 * bigger share of the row, or a higher rate. With Compare on, each square
 * carries its change against the span before. The card is its heading, the
 * dropdowns, the grid and the key: nothing else (Anthony: "stop adding text
 * to the graphs"). Shared: Conversions, and any page that shows conversions
 * by a kind.
 *
 * The part draws; the screen reads and chooses. `controls` is the row of
 * dropdowns (Count, Columns, Compare), kept in the address by the screen.
 *
 * Narrow, where a square would be under `NARROW_SQUARE` px (Anthony,
 * 2026-10-29, at a 450px card: "this is still very unreadable"), the map
 * becomes a list for one conversion at a time, chosen from a dropdown: each
 * kind's full name, a bar in the row's shade, and its figure.
 */
const NARROW_SQUARE = 60;

/** A share of the row as the ramp's shade, brighter for more: the map's own rule, for the narrow bars. */
function shadeOf(share: number): string {
  if (share >= 0.5) return CHART_ENGAGEMENT_RAMP[4];
  if (share >= 0.3) return CHART_ENGAGEMENT_RAMP[3];
  if (share >= 0.15) return CHART_ENGAGEMENT_RAMP[2];
  if (share >= 0.05) return CHART_ENGAGEMENT_RAMP[1];
  return CHART_ENGAGEMENT_RAMP[0];
}

/**
 * The width of the part's box, kept up to date, so it can choose the grid or the list. The box arrives with the
 * figures, after the card's first render, so it is watched from whenever it mounts, not from the first render.
 */
function useWidth(): [(node: HTMLDivElement | null) => void, number] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0]?.contentRect.width ?? 0)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width];
}
export type ConversionsCount = "visits" | "rate" | "events";
export type ConversionsMapColumn = { key: string; name: string; visits: number; visitsBefore: number | null };
export type ConversionsMapCell = { visits: number; times: number; visitsBefore: number | null; timesBefore: number | null };
export type ConversionsMapRow = { eventName: string; name: string; counted: boolean; cells: readonly ConversionsMapCell[] };

export type ConversionsMapWords = {
  /** The line under a row's name: its total in the unit shown. */
  rowTotal: (row: ConversionsMapRow, total: { visits: number; times: number; rate: number }) => string;
  /** A square's hover words: the conversion, the kind, the value shown, and the square's own figures behind it. */
  hover: (row: ConversionsMapRow, column: ConversionsMapColumn, value: string, cell: ConversionsMapCell) => string;
  /** The key: what the shades mean, and an empty square. */
  shades: string;
  empty: string;
};

const fmt = (value: number) => value.toLocaleString("en-GB");
const pct = (share: number) => `${(100 * share).toFixed(1)}%`;

/** A square's figure in the unit shown, and the span before's. */
export function cellValue(count: ConversionsCount, cell: ConversionsMapCell, column: ConversionsMapColumn): { now: number; before: number | null } {
  if (count === "events") return { now: cell.times, before: cell.timesBefore };
  if (count === "visits") return { now: cell.visits, before: cell.visitsBefore };
  const now = column.visits > 0 ? cell.visits / column.visits : 0;
  const before = cell.visitsBefore === null || column.visitsBefore === null ? null : column.visitsBefore > 0 ? cell.visitsBefore / column.visitsBefore : 0;
  return { now, before };
}

/** The change against the span before, as a square says it: an arrow and the percentage, "new" from nothing, nothing from nothing to nothing. */
export function changeWords(now: number, before: number | null, newWord: string): string | null {
  if (before === null) return null;
  if (before === 0) return now > 0 ? newWord : null;
  const by = (now - before) / before;
  if (Math.abs(by) < 0.0005) return "–";
  return `${by > 0 ? "▲" : "▼"} ${(100 * Math.abs(by)).toFixed(1)}%`;
}

export function ConversionsMap({ title, controls, columns, rows, count, compare, words, newWord, hrefFor, exportName, csv, caption, emptyText, pickWord, narrow: narrowGiven }: {
  title: string;
  controls: ReactNode;
  columns: readonly ConversionsMapColumn[];
  rows: readonly ConversionsMapRow[];
  count: ConversionsCount;
  compare: boolean;
  words: ConversionsMapWords;
  /** What a square says when the span before had none: "new". */
  newWord: string;
  /** Where a square's click goes: the pages behind it. */
  hrefFor?: (row: ConversionsMapRow, column: ConversionsMapColumn) => string | undefined;
  exportName: string;
  csv: () => string;
  caption?: string;
  /** What the card says with nothing to draw. */
  emptyText?: string;
  /** The narrow form's dropdown label: "Conversion". */
  pickWord?: string;
  /** The narrow form, forced: the drawing kit's example and tests; left out, the part measures itself. */
  narrow?: boolean;
}) {
  const [box, width] = useWidth();
  const narrow = narrowGiven ?? (width > 0 && width / (columns.length + 1) < NARROW_SQUARE);
  const [picked, setPicked] = useState<string | null>(null);
  const pickedRow = rows.find((row) => row.eventName === picked) ?? rows[0];
  const allVisits = columns.reduce((sum, column) => sum + column.visits, 0);
  const mapRows: ChannelMapRow[] = rows.map((row) => {
    const values = row.cells.map((cell, at) => cellValue(count, cell, columns[at]));
    const top = Math.max(0, ...values.map((value) => value.now));
    const sum = values.reduce((total, value) => total + value.now, 0);
    const visits = row.cells.reduce((total, cell) => total + cell.visits, 0);
    const times = row.cells.reduce((total, cell) => total + cell.times, 0);
    return {
      key: row.eventName,
      label: row.name,
      total: words.rowTotal(row, { visits, times, rate: allVisits > 0 ? visits / allVisits : 0 }),
      cells: row.cells.map((cell, at) => {
        const column = columns[at];
        const value = values[at];
        const text = count === "rate" ? pct(value.now) : fmt(value.now);
        const note = compare ? changeWords(value.now, value.before, newWord) : null;
        return {
          // Empty where nothing happened, whatever the unit: the rate of nothing is nothing.
          visits: value.now > 0 ? Math.max(1, Math.round(value.now)) : 0,
          conversions: 0,
          hover: words.hover(row, column, text, cell),
          text,
          ...(note ? { note } : {}),
          // A rate shades against the row's highest; a count against the row's total.
          share: count === "rate" ? (top > 0 ? value.now / top : 0) : sum > 0 ? value.now / sum : 0,
          href: hrefFor?.(row, column),
        };
      }),
    };
  });
  const list = pickedRow ? (() => {
    const values = pickedRow.cells.map((cell, at) => cellValue(count, cell, columns[at]));
    const top = Math.max(0, ...values.map((value) => value.now));
    const sum = values.reduce((total, value) => total + value.now, 0);
    return (
      <div className="flex flex-col gap-3">
        {rows.length > 1 ? (
          <Select chip={{ label: pickWord ?? "", choice: pickedRow.name, changed: false }} value={pickedRow.eventName} onChange={setPicked} aria-label={pickWord ?? pickedRow.name}>
            {rows.map((row) => <option key={row.eventName} value={row.eventName}>{row.name}</option>)}
          </Select>
        ) : null}
        <ul className="flex flex-col gap-2">
          {columns.map((column, at) => {
            const value = values[at];
            const text = count === "rate" ? pct(value.now) : fmt(value.now);
            const note = compare ? changeWords(value.now, value.before, newWord) : null;
            const share = count === "rate" ? (top > 0 ? value.now / top : 0) : sum > 0 ? value.now / sum : 0;
            const href = hrefFor?.(pickedRow, column);
            const figure = <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">{value.now > 0 ? text : "–"}{note ? <span className="ml-2 text-[11px] font-normal text-secondary">{note}</span> : null}</span>;
            return (
              <li key={column.key} className="flex flex-col gap-1" title={words.hover(pickedRow, column, text, pickedRow.cells[at])}>
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  {href && value.now > 0 ? <a href={href} className="min-w-0 truncate text-foreground hover:underline">{column.name}</a> : <span className="min-w-0 truncate text-foreground">{column.name}</span>}
                  {figure}
                </div>
                <div className="h-2 w-full rounded-[3px] bg-foreground/10">
                  {value.now > 0 ? <div className="h-2 rounded-[3px]" style={{ width: `${Math.max(2, Math.round(100 * (top > 0 ? value.now / top : 0)))}%`, backgroundColor: shadeOf(share) }} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  })() : null;
  return (
    <ChartCard title={title} controls={controls} exportName={exportName} csv={csv} caption={caption} enoughData={rows.length > 0} emptyText={emptyText}>
      <div data-part="conversions-map" ref={box}>
        {narrow ? list : <ChannelMap
          columns={columns.map((column) => column.name)}
          rows={mapRows}
          rowVisits={() => 1}
          conversionsWord={() => ""}
          legend={{ shades: words.shades, empty: words.empty }}
          headingTooltips
          cellTooltips
        />}
      </div>
    </ChartCard>
  );
}
