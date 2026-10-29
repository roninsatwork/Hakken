"use client";

import type { ReactNode } from "react";
import { ChartCard } from "./ChartCard";
import { ChannelMap, type ChannelMapRow } from "./ChannelMap";

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
 */
export type ConversionsCount = "visits" | "rate" | "events";
export type ConversionsMapColumn = { key: string; name: string; visits: number; visitsBefore: number | null };
export type ConversionsMapCell = { visits: number; times: number; visitsBefore: number | null; timesBefore: number | null };
export type ConversionsMapRow = { eventName: string; name: string; counted: boolean; cells: readonly ConversionsMapCell[] };

export type ConversionsMapWords = {
  /** The line under a row's name: its total in the unit shown. */
  rowTotal: (row: ConversionsMapRow, total: { visits: number; times: number; rate: number }) => string;
  /** A square's hover words. */
  hover: (row: ConversionsMapRow, column: ConversionsMapColumn, value: string) => string;
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

export function ConversionsMap({ title, controls, columns, rows, count, compare, words, newWord, hrefFor, exportName, csv, caption, emptyText }: {
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
}) {
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
          hover: words.hover(row, column, text),
          text,
          ...(note ? { note } : {}),
          // A rate shades against the row's highest; a count against the row's total.
          share: count === "rate" ? (top > 0 ? value.now / top : 0) : sum > 0 ? value.now / sum : 0,
          href: hrefFor?.(row, column),
        };
      }),
    };
  });
  return (
    <ChartCard title={title} controls={controls} exportName={exportName} csv={csv} caption={caption} enoughData={rows.length > 0} emptyText={emptyText}>
      <div data-part="conversions-map">
        <ChannelMap
          columns={columns.map((column) => column.name)}
          rows={mapRows}
          rowVisits={() => 1}
          conversionsWord={() => ""}
          legend={{ shades: words.shades, empty: words.empty }}
          headingTooltips
        />
      </div>
    </ChartCard>
  );
}
