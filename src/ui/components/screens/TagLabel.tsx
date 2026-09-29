import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";

type TagLabelProps = {
  children: ReactNode;
  /** Layout only — width, margin, alignment. Never a colour, a box or a font. */
  className?: string;
};

/**
 * A kind, not a status — "Wiki staff", a category, a count, a plan's name
 * beside a price: plain words in the quiet text colour, no icon and no box.
 * A status (done, failed, waiting, on, off) is a `StatusLabel` instead; the
 * two together replaced every pill on the platform (Anthony, 2026-09-29;
 * docs/plans/active/status-labels-plan.md).
 */
export function TagLabel({ children, className }: TagLabelProps) {
  return (
    <span className={cn("inline-flex w-fit items-center whitespace-nowrap text-[12px] font-normal leading-snug text-secondary", className)}>
      {children}
    </span>
  );
}
