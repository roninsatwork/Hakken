import { cn } from "@/src/ui/lib/utils";

/**
 * A figure a row has none of — no position, no change, nothing to compare —
 * as a muted dash in the tables' figure size, so it does not stand taller
 * than the numbers around it (Anthony's audit, 2026-10-04: eighteen screens
 * wrote their own dash and left it at the page's 16px).
 */
export function NoFigure({ className }: { className?: string }) {
  return <span className={cn("text-[12px] text-muted", className)}>–</span>;
}
