"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/src/ui/lib/utils";

export type SiteSwitcherItem = {
  href: string;
  label: string;
  /** A count or a price beside the label, quieter than it. */
  detail?: ReactNode;
  active: boolean;
};

/**
 * One choice of view inside a tab: Searches, Questions or Competitors under
 * Tracking; AI answers, What the engines searched or Rankings under Results.
 *
 * Links rather than a radio group, because each is somewhere you can be — a
 * page with its own address that the back button returns to. It wears the
 * segmented control's shape so it reads as one setting with several states,
 * which is what it is, and it scrolls sideways on a phone instead of wrapping.
 */
export function SiteSwitcher({ items, label }: { items: SiteSwitcherItem[]; label: string }) {
  return (
    <nav aria-label={label} className="overflow-x-auto custom-scrollbar">
      <div className="inline-flex min-w-full gap-1 rounded-[12px] border border-border-dim bg-black/20 p-1 sm:min-w-0">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[9px] px-4 py-2 text-[12px] font-medium transition-colors",
              item.active ? "bg-brand/20 text-brand" : "text-secondary hover:text-foreground",
            )}
          >
            {item.label}
            {item.detail !== undefined ? (
              <span className={cn("font-mono text-[11px]", item.active ? "text-brand/80" : "text-muted")}>
                {item.detail}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
