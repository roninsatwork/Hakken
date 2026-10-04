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
 * figure the eye should land on first.
 */
export function Figure({ label, value, detail, href, framed = true, emphasis = false }: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  framed?: boolean;
  emphasis?: boolean;
}) {
  const body = (
    <>
      <div data-part-title className="text-[12px] text-secondary">{href ? `${label} →` : label}</div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums text-foreground">{value}</div>
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
