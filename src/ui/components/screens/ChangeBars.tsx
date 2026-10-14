"use client";

import Link from "next/link";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { Change } from "./Change";

/**
 * Things that gained and lost, in two columns either side of a centre line
 * (docs/plans/active/ga-channel-pages-plan.md CH6; Anthony, 2026-10-13: "I saw
 * this as 2 columns not three — the text is on each row, to the left of the
 * gains and the right of the losses").
 *
 * A gain's bar runs right in orange, its words to the left of the line; a
 * loss's bar runs left in grey, its words to the right. Each bar as long as
 * its move against the biggest, the app's bar size (24px, 3px corners, 16px
 * between rows, as `SiteBarChart`). The move is the kit's `Change` — its arrow
 * carries the meaning, the colour only repeats it. The figure's own words
 * show on hover.
 */
export type ChangeBar = {
  key: string;
  /** What moved: a page's path, a source. */
  label: string;
  /** Beside the move: "9 → 17". */
  detail: string;
  /** The move, up or down. */
  change: number;
  /** The bar's hover. */
  hover: string;
  /** Where the row leads. */
  href?: string;
  /** Quieter words: a row standing for none, "No page recorded". */
  muted?: boolean;
};

export function ChangeBars({ rows, lostLabel, gainedLabel }: { rows: readonly ChangeBar[]; lostLabel: string; gainedLabel: string }) {
  const biggest = Math.max(1, ...rows.map((row) => Math.abs(row.change)));
  return (
    <div data-part="change-bars" className="flex flex-col gap-4 text-[11px]">
      <div className="grid grid-cols-2 text-muted">
        <span className="pr-3 text-right">◀ {lostLabel}</span>
        <span className="border-l border-border-dim pl-3">{gainedLabel} ▶</span>
      </div>
      {rows.map((row) => {
        const share = `${Math.max(1, (Math.abs(row.change) / biggest) * 100)}%`;
        const words = (
          <span className={`inline-flex min-w-0 items-baseline gap-1.5 ${row.muted ? "text-muted" : "text-foreground"}`}>
            {row.href ? <Link href={row.href} className="truncate hover:underline">{row.label}</Link> : <span className="truncate">{row.label}</span>}
            <span className="shrink-0"><Change by={row.change} /></span>
            <span className="shrink-0 font-mono text-[11px] text-secondary">{row.detail}</span>
          </span>
        );
        const bar = (colour: string) => <span title={row.hover} className="block h-6 rounded-[3px]" style={{ width: share, backgroundColor: colour }} />;
        return row.change >= 0 ? (
          <div key={row.key} className="grid grid-cols-2 items-center">
            <span className="flex min-w-0 justify-end pr-3">{words}</span>
            <span className="flex border-l border-border-dim">{bar(CHART_SERIES_ORANGE)}</span>
          </div>
        ) : (
          <div key={row.key} className="grid grid-cols-2 items-center">
            <span className="flex justify-end border-r border-border-dim">{bar(CHART_COMPARATOR_GREY)}</span>
            <span className="flex min-w-0 pl-3">{words}</span>
          </div>
        );
      })}
    </div>
  );
}
