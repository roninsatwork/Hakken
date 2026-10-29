"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CHART_ENGAGEMENT_NONE, CHART_ENGAGEMENT_RAMP, CHART_RAMP_INK_ON_DARK, CHART_RAMP_INK_ON_LIGHT } from "@/src/ui/components/charts/chartPalette";
import { Tooltip } from "./Tooltip";

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
export type ChannelMapCell = {
  visits: number;
  conversions: number;
  hover: string;
  /**
   * The Conversions map's extras (conversion-charts-plan.md): the square's own words in place of its visits (a rate,
   * "3.6%"), a line under them (its change against the month before), where a click goes, and its own share for
   * the shade (a rate against the row's highest) in place of its share of the row's visits.
   */
  text?: string;
  note?: ReactNode;
  href?: string;
  share?: number;
};
export type ChannelMapRow = { key: string; label: string; total: string; href?: string; cells: readonly ChannelMapCell[] };

/** A share of its row as the ramp's shade, brighter for more. */
function shadeOf(share: number): string {
  if (share >= 0.5) return CHART_ENGAGEMENT_RAMP[4];
  if (share >= 0.3) return CHART_ENGAGEMENT_RAMP[3];
  if (share >= 0.15) return CHART_ENGAGEMENT_RAMP[2];
  if (share >= 0.05) return CHART_ENGAGEMENT_RAMP[1];
  return CHART_ENGAGEMENT_RAMP[0];
}

export function ChannelMap({ columns, rows, rowVisits, conversionsWord, legend, headingTooltips = false }: {
  columns: readonly string[];
  rows: readonly ChannelMapRow[];
  /** Each row's visits, to shade its squares by their share. */
  rowVisits: (row: ChannelMapRow) => number;
  /** "3 conv." under a square's number. */
  conversionsWord: (count: number) => string;
  /**
   * The key's words: what a number, a conversions line, the shades and an empty square mean. Without `conversions`, for
   * a grid whose squares are conversions themselves (Conversions' by page classification), that line is left out.
   */
  legend: { visits?: string; conversions?: string; shades: string; empty: string };
  /** Column headings say their full name on hover, in the app's own tooltip: the Conversions map, whose kinds truncate. */
  headingTooltips?: boolean;
}) {
  // The name column gives way before the squares do, so eleven columns still fit a narrow card.
  const template = { gridTemplateColumns: `minmax(96px, 140px) repeat(${columns.length}, minmax(0, 1fr))` };
  return (
    <div data-part="channel-map" className="flex flex-col gap-1">
      <div className="grid gap-1 text-[11px] text-muted" style={template}>
        <span />
        {columns.map((column) => headingTooltips ? (
          <span key={column} className="min-w-0 px-1 text-center">
            <Tooltip label={column} className="relative flex w-full min-w-0 justify-center"><span tabIndex={0} className="block min-w-0 max-w-full truncate">{column}</span></Tooltip>
          </span>
        ) : <span key={column} className="truncate px-1 text-center" title={column}>{column}</span>)}
      </div>
      {rows.map((row) => {
        const total = rowVisits(row);
        return (
          <div key={row.key} className="grid items-stretch gap-1" style={template}>
            <span className="flex min-w-0 flex-col items-end justify-center pr-3 text-right leading-tight">
              {row.href ? <Link href={row.href} className="text-[12px] text-foreground hover:underline">{row.label}</Link> : <span className="text-[12px] text-foreground">{row.label}</span>}
              <span className="text-[11px] text-muted">{row.total}</span>
            </span>
            {row.cells.map((cell, index) => {
              const share = cell.share ?? (total > 0 ? cell.visits / total : 0);
              const empty = cell.visits === 0;
              const light = share >= 0.3;
              const style = {
                backgroundColor: empty ? CHART_ENGAGEMENT_NONE : shadeOf(share),
                opacity: empty ? 0.35 : 1,
                color: light ? CHART_RAMP_INK_ON_LIGHT : CHART_RAMP_INK_ON_DARK,
              };
              const inside = empty ? null : (
                <>
                  <span className="max-w-full truncate px-0.5 font-mono text-[12px] font-semibold tabular-nums lg:text-[13px]">{cell.text ?? cell.visits.toLocaleString("en-GB")}</span>
                  {cell.note !== undefined ? <span className="text-[11px]">{cell.note}</span> : cell.conversions > 0 ? <span className="text-[11px]">{conversionsWord(cell.conversions)}</span> : null}
                </>
              );
              const squareClass = "flex h-11 min-w-0 flex-col items-center justify-center overflow-hidden rounded-md leading-tight";
              return cell.href && !empty ? (
                <Link key={columns[index] ?? index} href={cell.href} title={cell.hover} className={`${squareClass} hover:opacity-90`} style={style}>{inside}</Link>
              ) : (
                <span key={columns[index] ?? index} title={cell.hover} className={squareClass} style={style}>{inside}</span>
              );
            })}
          </div>
        );
      })}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-secondary">
        {legend.visits ? <span>{legend.visits}</span> : null}
        {legend.conversions ? <span>{legend.conversions}</span> : null}
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
