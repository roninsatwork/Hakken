"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";
import { RecordLinkCell } from "../sites/_components/SiteCells";
import { HoverArea, useHoverReadout } from "../sites/_components/HoverReadout";

/** One kind's row: its name, where it opens, its share in each measure (0 to 1), and the line of numbers beside the bars. */
export type KindBarsRow = {
  key: string;
  label: string;
  href: string;
  shares: number[];
  line: ReactNode;
  /** What the pointer reads over the row, one entry per measure. */
  readout: Array<{ value: string; label: string }>;
};

/**
 * Kinds as deep bars — pages by kind, keywords by what the searcher wants —
 * one bar per measure on show, all on one scale (the largest share on show
 * fills the track). A row answers the pointer with its numbers and opens the
 * records of that kind (Anthony, 2026-09-25: the bars looked "weedy and
 * thin", and "we need hover states").
 *
 * Shared by the Sites Overview and Search Console's Types, which drew two
 * copies in two colour pairs until the 2026-10-03 clean-up; it lives here,
 * the narrowest folder both reach. The colours are the caller's, from the
 * chart palette: blue for how many, orange for what they bring.
 */
export function KindBars({ rows, colours, shown, loading = false, children }: {
  rows: KindBarsRow[];
  /** One colour per measure, from `chartPalette.ts`. */
  colours: string[];
  /** Which measures are drawn: the card's tick boxes. */
  shown: boolean[];
  loading?: boolean;
  /** Notes under the rows. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const { hover, bind } = useHoverReadout<string>();
  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-sidebar/30" aria-busy="true" />;
  const widest = Math.max(0.0001, ...rows.flatMap((row) => row.shares.filter((_, index) => shown[index])));
  return (
    <HoverArea
      hover={hover}
      className="flex flex-col gap-1"
      readout={(key) => {
        const row = rows.find((entry) => entry.key === key);
        if (!row) return null;
        return (
          <ChartTooltipSurface heading={row.label}>
            {row.readout.map((entry, index) => (
              <ChartTooltipRow key={entry.label} colour={colours[index]} value={entry.value} label={entry.label} />
            ))}
          </ChartTooltipSurface>
        );
      }}
    >
      {rows.map((row) => (
        <div
          key={row.key}
          {...bind(row.key)}
          onClick={() => router.push(row.href)}
          className="grid cursor-pointer grid-cols-1 items-center gap-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-hover md:grid-cols-[150px_minmax(0,1fr)_minmax(220px,auto)] md:gap-4"
        >
          <RecordLinkCell href={row.href}>{row.label}</RecordLinkCell>
          <div className="flex flex-col gap-1" aria-hidden="true">
            {row.shares.map((share, index) => (shown[index]
              ? <span key={index} className="block h-3.5 rounded-[3px]" style={{ width: `${Math.max(0.5, (share / widest) * 100)}%`, background: colours[index] }} />
              : null))}
          </div>
          <span className="text-[12px] tabular-nums text-secondary">{row.line}</span>
        </div>
      ))}
      {children}
    </HoverArea>
  );
}
