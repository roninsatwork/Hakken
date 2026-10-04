"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";

/**
 * The explanation box (docs/developer/screen-kit.md, "Anatomy Of A List
 * Screen": title and description, then an explanation box if needed): a line
 * or two above a list or in a panel that says what is going on — and, as a
 * `warning`, what needs doing. With its own button when it has one (an undo,
 * a connect). One part where Sites, Search Console and the websites admin
 * drew about five (2026-10-03 clean-up).
 *
 * The icon says which it is — an "i" or a warning triangle — so the meaning
 * never rests on colour alone (Anthony is red/green colour blind).
 */
export function Notice({ tone = "info", children, action, className }: {
  tone?: "info" | "warning";
  children: ReactNode;
  /** A button of its own, on the right. */
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <div
      data-part="notice"
      data-part-variant={tone}
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[12px] border p-4 text-secondary",
        tone === "warning" ? "border-warning/30 bg-warning/5" : "border-border-dim/50 bg-foreground/[0.015]",
        className,
      )}
    >
      <span className="flex min-w-0 items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", tone === "warning" ? "text-warning" : "text-muted")} aria-hidden="true" />
        <span className="text-[12.5px] leading-relaxed">{children}</span>
      </span>
      {action}
    </div>
  );
}
