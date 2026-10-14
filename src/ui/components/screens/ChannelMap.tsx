"use client";

import Link from "next/link";
import { CHART_ENGAGEMENT_NONE, CHART_ENGAGEMENT_RAMP, CHART_RAMP_INK_ON_DARK, CHART_RAMP_INK_ON_LIGHT } from "@/src/ui/components/charts/chartPalette";

/**
 * Rows across columns, each square a count shaded by its share of its row
 * (docs/plans/active/ga-channel-pages-plan.md CH9): Channels' "Where each
 * channel lands, by page classification" — channels down the side, page
 * groups across, each square the channel's visits that landed there, with
 * their conversions beneath (Anthony, 2026-10-13: "love this").
 *
 * Brighter is a bigger share of the row, on the engagement ramp's blues: the
 * owner reads intensity, not hue. An empty square is grey. The square's own
 * shade picks its words' colour, so they read in either theme. A key under
 * the map says what its numbers and shades mean.
 */
export type ChannelMapCell = { visits: number; conversions: number; hover: string };
export type ChannelMapRow = { key: string; label: string; total: string; href?: string; cells: readonly ChannelMapCell[] };

/** A share of its row as the ramp's shade, brighter for more. */
function shadeOf(share: number): string {
  if (share >= 0.5) return CHART_ENGAGEMENT_RAMP[4];
  if (share >= 0.3) return CHART_ENGAGEMENT_RAMP[3];
  if (share >= 0.15) return CHART_ENGAGEMENT_RAMP[2];
  if (share >= 0.05) return CHART_ENGAGEMENT_RAMP[1];
  return CHART_ENGAGEMENT_RAMP[0];
}

export function ChannelMap({ columns, rows, rowVisits, conversionsWord, legend }: {
  columns: readonly string[];
  rows: readonly ChannelMapRow[];
  /** Each row's visits, to shade its squares by their share. */
  rowVisits: (row: ChannelMapRow) => number;
  /** "3 conv." under a square's number. */
  conversionsWord: (count: number) => string;
  /** The key's words: what a number, a conversions line, the shades and an empty square mean. */
  legend: { visits: string; conversions: string; shades: string; empty: string };
}) {
  const template = { gridTemplateColumns: `140px repeat(${columns.length}, minmax(0, 1fr))` };
  return (
    <div data-part="channel-map" className="flex flex-col gap-1">
      <div className="grid gap-1 text-[11px] text-muted" style={template}>
        <span />
        {columns.map((column) => <span key={column} className="truncate px-1 text-center" title={column}>{column}</span>)}
      </div>
      {rows.map((row) => {
        const total = rowVisits(row);
        return (
          <div key={row.key} className="grid items-stretch gap-1" style={template}>
            <span className="flex flex-col items-end justify-center pr-3 leading-tight">
              {row.href ? <Link href={row.href} className="text-[12px] text-foreground hover:underline">{row.label}</Link> : <span className="text-[12px] text-foreground">{row.label}</span>}
              <span className="text-[11px] text-muted">{row.total}</span>
            </span>
            {row.cells.map((cell, index) => {
              const share = total > 0 ? cell.visits / total : 0;
              const empty = cell.visits === 0;
              const light = share >= 0.3;
              return (
                <span
                  key={columns[index] ?? index}
                  title={cell.hover}
                  className="flex h-11 flex-col items-center justify-center rounded-md leading-tight"
                  style={{
                    backgroundColor: empty ? CHART_ENGAGEMENT_NONE : shadeOf(share),
                    opacity: empty ? 0.35 : 1,
                    color: light ? CHART_RAMP_INK_ON_LIGHT : CHART_RAMP_INK_ON_DARK,
                  }}
                >
                  {empty ? null : (
                    <>
                      <span className="font-mono text-[13px] font-semibold">{cell.visits.toLocaleString("en-GB")}</span>
                      {cell.conversions > 0 ? <span className="text-[11px]">{conversionsWord(cell.conversions)}</span> : null}
                    </>
                  )}
                </span>
              );
            })}
          </div>
        );
      })}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-secondary">
        <span>{legend.visits}</span>
        <span>{legend.conversions}</span>
        <span className="inline-flex items-center gap-1.5">
          {CHART_ENGAGEMENT_RAMP.map((shade) => <span key={shade} aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px]" style={{ backgroundColor: shade }} />)}
          {legend.shades}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px]" style={{ backgroundColor: CHART_ENGAGEMENT_NONE, opacity: 0.35 }} />
          {legend.empty}
        </span>
      </div>
    </div>
  );
}
