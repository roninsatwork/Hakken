"use client";

import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "./Button";

export type CountFilter<Key extends string = string> = {
  key: Key;
  /** What the count is of, in a word or two: "All", "Needs attention". */
  label: ReactNode;
  /** The number itself, already drawn. A dash while it loads. */
  count: ReactNode;
  /**
   * This count asks for something, so it reads in the warning colour. The
   * caller decides, usually only while the number is above nought: a nought
   * against "Needs attention" is good news and reads as plain text.
   */
  attention?: boolean;
};

/**
 * Counts you can press to filter a table: a row of plain words, each with its
 * number (from Sonae, 2026-11-11; brought over on 2026-11-21 for the platform's
 * Unanswered list, wiki-sonae-catch-up-plan-2026-11-21.md, S7).
 *
 * Hakken's rule is no pills anywhere (screen-kit.md, "Status Labels"). So each is a word and a number with no border and no
 * fill. The one in force is in the reading colour with an underline, the rest
 * are quiet, and a count that asks for something is in the warning colour
 * whichever is pressed. They wrap onto a second line in a narrow window.
 *
 * Only one is pressed at a time, so each button says whether it is with
 * `aria-pressed`, and the row is a named group.
 */
export function CountFilters<Key extends string>({
  label,
  items,
  value,
  onChange,
  className,
}: {
  /** What the group is called for someone listening: "Show". */
  label: string;
  items: CountFilter<Key>[];
  /** The key of the count in force. */
  value: Key;
  onChange: (next: Key) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-x-5 gap-y-1", className)}>
      {items.map((item) => {
        const pressed = item.key === value;
        return (
          <Button
            key={item.key}
            variant="ghost"
            aria-pressed={pressed}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-none border-b-2 px-0 py-0 text-[13px] hover:bg-transparent",
              pressed
                ? "border-foreground font-medium text-foreground"
                : "border-transparent font-normal text-secondary hover:text-foreground",
            )}
          >
            <span>{item.label}</span>
            {/* Heard as "Needs attention 4", not "Needs attention4". A space
                between flex items takes no room on screen. */}{" "}
            <span
              className={cn(
                "font-semibold tabular-nums",
                item.attention ? "text-warning" : pressed ? "text-foreground" : "text-secondary",
              )}
            >
              {item.count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
