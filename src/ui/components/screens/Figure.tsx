"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/src/ui/lib/utils";

/**
 * One headline figure: what it is, the number, and a line under it — the
 * change, or what the number means. The number box of every screen: Sites'
 * and Search Console's hero boxes, and admin's cost and to-do figures, which
 * each drew their own until the 2026-10-03 clean-up (one part per shape,
 * Anthony: "we need to keep a ui standard app wide").
 *
 * With `href` the figure opens the records behind it, and says so with an
 * arrow (docs/plans/active/sites-ux-updates-plan.md §3, "every number opens
 * the records behind it"); without one it is only read. `framed={false}` for
 * figures inside a panel that is already the card; `emphasis` for the one
 * figure the eye should land on first. `mark` goes before the label when the
 * figure is about one website — its `SiteMark` — as the competitor cards are.
 */
export function Figure({ label, value, detail, href, arrow = true, framed = true, emphasis = false, named = false, mark }: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  /** Off where pressing filters the page rather than opening another (Tracking health; Anthony, 2026-11-06: no arrows on its boxes). */
  arrow?: boolean;
  framed?: boolean;
  emphasis?: boolean;
  /** The value is a name, not a number: smaller, so "Organic Search" doesn't fill the box over two lines (Anthony, 2026-11-06). */
  named?: boolean;
  mark?: ReactNode;
}) {
  const title = href && arrow ? `${label} →` : label;
  const body = (
    <>
      {mark !== undefined ? (
        // The mark sits beside the title, not in it: the title stays the figure's words alone.
        <div className="flex min-w-0 items-center gap-2">
          {mark}
          <div data-part-title className="truncate text-[12px] text-secondary">{title}</div>
        </div>
      ) : (
        <div data-part-title className="text-[12px] text-secondary">{title}</div>
      )}
      <div className={cn("mt-1 font-semibold text-foreground", named ? "text-[16px]" : "text-[24px] tabular-nums")}>{value}</div>
      {detail !== undefined ? <div className="mt-1 text-[12px]">{detail}</div> : null}
    </>
  );
  const frame = framed
    ? cn("rounded-2xl border px-5 py-4", emphasis ? "border-brand/40 bg-brand/5" : "border-border-dim bg-card/40")
    : "rounded-lg";
  if (!href) return <div data-part="figure" className={frame}>{body}</div>;
  return (
    <Link
      data-part="figure"
      href={href}
      className={cn(
        frame,
        "transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand",
        framed ? "hover:border-brand/40" : "hover:opacity-90",
      )}
    >
      {body}
    </Link>
  );
}

/** A row of figures: four across on a wide screen, two on a tablet, one on a phone. */
export function FigureRow({ children, columns = 4 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return (
    <div data-part="figures" className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", columns === 4 ? "xl:grid-cols-4" : columns === 3 ? "xl:grid-cols-3" : "")}>
      {children}
    </div>
  );
}
