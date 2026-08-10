import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";
import { STATUS_TONE_CLASSES, type StatusTone } from "./statusTone";

type StatusPillProps = {
  tone: StatusTone;
  children: ReactNode;
  /** sm matches the 10px badge used in tables; md the 11px drawer variant. */
  size?: "sm" | "md";
  icon?: ReactNode;
  className?: string;
};

/**
 * The status badge, drawn from theme tokens.
 *
 * One component instead of the `border-{colour}-500/20 bg-{colour}-500/10
 * text-{colour}-500` recipe copy-pasted ~400 times with hardcoded palette
 * colours — which is why the Status Colours on the Aesthetics screen used to
 * change nothing. Pick the tone with `toneForStatus` for status strings, or
 * pass it directly when the meaning is known at the call site.
 */
export function StatusPill({ tone, children, size = "sm", icon, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        STATUS_TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
