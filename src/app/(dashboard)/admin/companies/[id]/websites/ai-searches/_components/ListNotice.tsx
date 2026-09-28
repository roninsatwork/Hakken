"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";

/**
 * One line of news above a list, with its own button when it has one — an
 * undo, say: the kit's explanation box, spoken as a status. Shared by a
 * prompt's fan-out queries and Your prompts, the two lists that say what a
 * change just did.
 */
export function ListNotice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="flex items-center justify-between gap-4 rounded-[12px] border border-border-dim/50 bg-foreground/[0.015] p-4 text-secondary">
      <span className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
        <span className="text-[12.5px] leading-relaxed">{children}</span>
      </span>
      {action}
    </div>
  );
}
