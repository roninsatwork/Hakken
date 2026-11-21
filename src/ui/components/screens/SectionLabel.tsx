import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";

/**
 * The small capitals heading over one part of a screen that has no card round it: "PINNED BY STAFF", "TAGS".
 *
 * The same words as a settings card's own title (`SettingsCard`), 13px, so a part keeps the heading it would have
 * worn in a card once the card is gone. Brought over from the upstream framework for a wiki page's own screen
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S5), in Hakken's face and size rather than the upstream's 11px typewriter.
 */
export function SectionLabel({
  as: Tag = "h2",
  id,
  className,
  children,
}: {
  as?: "h2" | "h3";
  id?: string;
  /** Layout only: margin, width, alignment. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag id={id} data-part="section-label" className={cn("text-[13px] font-semibold uppercase tracking-[0.12em] text-muted", className)}>
      {children}
    </Tag>
  );
}
