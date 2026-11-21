import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";

export type Fact = {
  label: string;
  value: ReactNode;
};

const COLUMNS = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
} as const;

/**
 * A few facts about one record, each label over its value: a wiki page's kind, when it was last verified and how
 * often it was used. For facts that are words or dates; a headline number is a `Figure`.
 *
 * A real description list, so each value is read with its label. Brought over from the upstream framework for a wiki
 * page's own screen (wiki-sonae-catch-up-plan-2026-11-21.md, S5), at Hakken's 13px with no capitals or typewriter face.
 * `columns` says how many across on a wide screen; `className` is for layout only, such as `lg:grid-cols-1` in a side
 * column.
 */
export function FactsList({ facts, columns = 3, className }: { facts: Fact[]; columns?: keyof typeof COLUMNS; className?: string }) {
  return (
    <dl data-part="facts" className={cn("m-0 grid gap-x-6 gap-y-4", COLUMNS[columns], className)}>
      {facts.map((fact) => (
        <div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[13px] text-secondary">{fact.label}</dt>
          <dd className="m-0 break-words text-[13px] text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
