"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/src/ui/lib/utils";
import { ChartTooltipSurface } from "./ChartTooltip";

/**
 * A column of the readout. `band` sets the figure the chart is about apart — bold, on its own shaded band, with its
 * icon — never by colour alone; `quiet` is a figure worked out from the others (visits for one, a rate), in the
 * quieter ink; `drawn` marks, with a short line, the column the chart's lines are drawing.
 */
export type ReadoutColumn = { key: string; label: string; tone?: "band" | "quiet"; icon?: ReactNode; drawn?: boolean };

/** A figure in the readout: its words, quiet for a nought or a dash, and what it was in the span set against. */
export type ReadoutCell = { text: string; quiet?: boolean; was?: string | null };

/** A line of the readout: its name, keyed by a short stroke of its colour, and a figure a column. */
export type ReadoutTableRow = { key: string; name: string; colour?: string; cells: Readonly<Record<string, ReadoutCell>> };

export type ChartReadoutTableProps = {
  heading: ReactNode;
  /** The dates of the step set against, when one is: "21 – 27 Sept, against 22 – 28 June". */
  against?: string | null;
  /** A line under the heading: what the figures count, when the chart's dropdowns narrow it. */
  note?: ReactNode;
  columns: readonly ReadoutColumn[];
  /** Every line drawn, each its own row, noughts shown — never folded away. */
  rows: readonly ReadoutTableRow[];
  /** Every line's figures together, under them; named "All four", "Both" … by how many lines there are. */
  total?: Readonly<Record<string, ReadoutCell>> | null;
};

/**
 * A chart's hover readout as a small table, the style every configurable chart's hover takes (docs/developer/
 * screen-kit.md, "Configurable charts"; drawn as Hover B on the page-conversion canvas and built 2026-10-20, then
 * locked in: "let's lock this in as a component style"). A row a line, a column a figure, the total under them; the
 * app's standard 13px throughout ("why is the font not our standard size … this is huge"); every line its own row,
 * its noughts shown ("I want to show 0s still for the hover — don't truncate it like this"). On the wide hover panel.
 */
export function ChartReadoutTable({ heading, against = null, note, columns, rows, total }: ChartReadoutTableProps) {
  const t = useTranslations("ui.chartExplorer");
  const withTotal = Boolean(total) && rows.length > 1;
  const cells = (row: Readonly<Record<string, ReadoutCell>>, last: boolean, totalRow: boolean) => columns.map((column) => {
    const cell = row[column.key] ?? { text: "–", quiet: true };
    const band = column.tone === "band";
    return (
      <div
        key={column.key}
        className={cn(
          "px-2 text-right text-[13px]",
          totalRow ? "border-t border-border-dim pb-0.5 pt-1.5" : "py-1",
          band && "bg-hover",
          band && last && "rounded-b-[6px]",
        )}
      >
        <div className={cn(
          "font-mono tabular-nums",
          band && !cell.quiet ? "font-bold" : totalRow ? "font-medium" : "font-normal",
          cell.quiet ? "text-muted" : column.tone === "quiet" ? "text-secondary" : "text-foreground",
        )}>
          {cell.text}
        </div>
        {against !== null && cell.was !== undefined && cell.was !== null
          ? <div className="text-secondary">{t.rich("was", { value: cell.was, figure: (chunks) => <span className="font-mono tabular-nums">{chunks}</span> })}</div>
          : null}
      </div>
    );
  });

  return (
    <ChartTooltipSurface wide heading={against !== null ? t("against", { dates: String(heading), before: against }) : heading}>
      {note ? <div className="text-[13px] text-secondary">{note}</div> : null}
      <div className="mt-1 grid items-start" style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${columns.length}, auto)` }}>
        <div />
        {columns.map((column) => (
          <div
            key={column.key}
            data-readout-head=""
            className={cn(
              "flex items-center justify-end gap-1.5 whitespace-nowrap px-2 pb-1 pt-0.5 text-[13px] font-medium",
              column.tone === "band" ? "rounded-t-[6px] bg-hover text-foreground" : column.drawn ? "text-foreground" : "text-secondary",
            )}
          >
            {column.drawn ? <span aria-hidden className="h-[2px] w-3 shrink-0 rounded-full bg-foreground" /> : null}
            {column.icon}
            {column.label}
          </div>
        ))}
        {rows.map((row, at) => (
          <ReadoutLine key={row.key} name={row.name} colour={row.colour}>
            {cells(row.cells, !withTotal && at === rows.length - 1, false)}
          </ReadoutLine>
        ))}
        {withTotal && total ? (
          <>
            <div className="border-t border-border-dim pb-0.5 pr-2 pt-1.5 text-[13px] font-medium text-foreground">{t("all", { count: rows.length })}</div>
            {cells(total, true, true)}
          </>
        ) : null}
      </div>
    </ChartTooltipSurface>
  );
}

/** A line's name, keyed by a short stroke of its colour as every readout's, then its figures. */
function ReadoutLine({ name, colour, children }: { name: string; colour?: string; children: ReactNode }) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 py-1 pr-2">
        <span aria-hidden className="h-[2px] w-3 shrink-0 rounded-full" style={{ backgroundColor: colour ?? "var(--color-muted)" }} />
        <span className="truncate text-[13px] text-foreground">{name}</span>
      </div>
      {children}
    </>
  );
}
