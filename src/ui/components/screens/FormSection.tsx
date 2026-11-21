import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";
import { SectionLabel } from "./SectionLabel";

const COLUMNS = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
} as const;

/**
 * One part of a page with no card round it: a small capitals heading
 * (`SectionLabel`), a rule above, an optional plain line under the heading,
 * and what the part holds in a grid.
 *
 * Brought over from the upstream framework on 2026-11-21 for the wiki's
 * Waiting on you page (wiki-sonae-catch-up-plan-2026-11-21.md, S6), as a shared
 * part on Anthony's word. The first part on a page drops its rule and top
 * space, so the parts read as one block under the page's header. A field that
 * should run the full width passes `sm:col-span-2` (or `col-span-full`) on its
 * own wrapper.
 *
 * - `hint`: one plain line under the heading about what's below.
 * - `action`: a status word or a small button at the right of the heading.
 * - No `title`: a part with no heading, still divided from the rest by its rule.
 */
export function FormSection({
  title,
  hint,
  action,
  columns = 2,
  children,
  className,
}: {
  title?: string;
  hint?: ReactNode;
  action?: ReactNode;
  columns?: keyof typeof COLUMNS;
  children: ReactNode;
  /** Layout only: margin, width. */
  className?: string;
}) {
  const heading = title ? <SectionLabel>{title}</SectionLabel> : null;
  return (
    <section data-part="form-section" className={cn("flex flex-col gap-4 border-t border-border-dim py-6 first:border-t-0 first:pt-0", className)}>
      {hint || action ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-1.5">
            {heading}
            {hint ? <p className="max-w-[72ch] text-[13px] leading-relaxed text-secondary">{hint}</p> : null}
          </div>
          {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      ) : (
        heading
      )}
      <div className={cn("grid gap-x-6 gap-y-4", COLUMNS[columns])}>{children}</div>
    </section>
  );
}
