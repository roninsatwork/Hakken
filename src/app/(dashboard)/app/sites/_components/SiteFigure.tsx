"use client";

import type { ReactNode } from "react";
import Link from "next/link";

const FIGURE_CLASSES = "rounded-2xl border border-border-dim bg-card/40 px-5 py-4";

/**
 * One headline figure on a Sites screen: what it is, the number, and a line
 * under it — the change, or what the number means.
 *
 * With `href` the figure opens the records behind it, and says so with an
 * arrow (docs/plans/active/sites-ux-updates-plan.md §3, "every number opens
 * the records behind it"); without one it is only read. The Overview's four
 * cards and every record's screen draw their figures with this.
 */
export function SiteFigure({ label, value, detail, href }: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="text-[12px] text-secondary">{href ? `${label} →` : label}</div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums text-foreground">{value}</div>
      {detail !== undefined ? <div className="mt-1 text-[12px]">{detail}</div> : null}
    </>
  );
  if (!href) return <div className={FIGURE_CLASSES}>{body}</div>;
  return (
    <Link
      href={href}
      className={`${FIGURE_CLASSES} transition-colors hover:border-brand/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand`}
    >
      {body}
    </Link>
  );
}
