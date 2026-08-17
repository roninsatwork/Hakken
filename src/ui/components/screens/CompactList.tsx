"use client";

import type { ReactNode } from "react";

/**
 * A short list that lives inside somebody else's panel.
 *
 * `DataTable` is for a screen's records: a card, a search box, page controls, a
 * footer that always reports the count. Four places in the app need something
 * that is emphatically not that — a run of rows tucked inside a panel that has
 * already introduced itself:
 *
 * - the dashboard's ledger of recent events, which has no column headings at all
 * - a customer's line items, opened inside a collapsed month
 * - an agent's tool breakdown, a success bar per row
 * - the widget greeting's settings row
 *
 * Every one of them hand-wrote a `<table>`, and each was written off in an
 * earlier phase as "cannot use the kit". That was true and it was the kit's
 * fault: forcing the records table on them would have meant a card inside a
 * card, a thousand-pixel minimum inside a narrow column, and rows five times
 * taller than they are. Three exceptions stacked on one component is how drift
 * starts, so this is a second, smaller component instead.
 *
 * What it owns is the structure that drifted — the row rhythm, the divider, the
 * heading style, and the fact that it is a real `<table>` so the columns line up.
 * What it leaves alone is text size and colour: the dashboard ledger reads at
 * 15px and an inner line-item list at 13px, and that is a design decision about
 * prominence rather than an accident.
 */

export type CompactListColumn<Row> = {
  key: string;
  /**
   * Omit on every column for a list with no headings.
   *
   * The dashboard ledger has none — time, event, who, tag, read in order with
   * nothing above them. A heading row there would label the obvious.
   */
  header?: ReactNode;
  align?: "left" | "right";
  /** Width, wrapping, number alignment, text size — whatever this column needs. */
  className?: string;
  cell: (row: Row) => ReactNode;
};

type CompactListProps<Row> = {
  /** `undefined` draws the loading line rather than an empty list. */
  rows: Row[] | undefined;
  columns: CompactListColumn<Row>[];
  rowKey: (row: Row) => string;
  /** Shown in place of the rows when there are none, and while loading. */
  empty: ReactNode;
  loading?: ReactNode;
  /**
   * A rule between rows.
   *
   * `rule` for a list that reads as a ledger, `none` for a tight inner list
   * where lines would be louder than the content.
   */
  dividers?: "rule" | "none";
  /** Only for a list wide enough to need scrolling — most of these are not. */
  minWidthClassName?: string;
  className?: string;
};

const HEADER_ROW = "text-[11px] uppercase tracking-[0.08em] text-muted";
const HEADER_CELL = "font-medium py-1.5";
const CELL = "px-4 py-2.5";

export function CompactList<Row>({
  rows,
  columns,
  rowKey,
  empty,
  loading,
  dividers = "rule",
  minWidthClassName = "",
  className = "",
}: CompactListProps<Row>) {
  const hasHeadings = columns.some((column) => column.header !== undefined);
  const isLoading = rows === undefined;

  if (isLoading || rows.length === 0) {
    return (
      <div className={`w-full ${className}`.trim()}>
        <p className="py-1 text-[12px] text-secondary">{isLoading ? (loading ?? empty) : empty}</p>
      </div>
    );
  }

  return (
    <div className={`w-full ${minWidthClassName ? "overflow-x-auto" : ""} ${className}`.trim()}>
      <table className={`w-full text-left border-collapse ${minWidthClassName}`.trim()}>
        {hasHeadings && (
          <thead>
            <tr className={HEADER_ROW}>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={[HEADER_CELL, column.align === "right" ? "text-right" : "", column.className ?? ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={dividers === "rule" ? "border-b border-border-dim last:border-b-0" : ""}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={[CELL, column.align === "right" ? "text-right" : "", column.className ?? ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
