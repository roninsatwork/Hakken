"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/src/ui/components/screens/Button";

/**
 * The bar a Websites list is added to from: its field (and any picker) and
 * an Add button the field's own height, in a quiet card above the list — what
 * the company's searches, a website's searches, its competitors, its
 * questions and a question's fan-out searches each drew a copy of until the
 * 2026-10-03 clean-up. `above` holds what comes first (an allowance), `below`
 * what follows (a limit, a cost line, an error).
 *
 * A disabled button shows no tooltip of its own, so the reason it is
 * disabled (`disabledTip`) sits on what holds it.
 *
 * Extended for Page classification's ticked pages (page-groups-plan.md,
 * decision 6), drawn as this same bar: `icon` replaces the plus — `null` for
 * "Set for 3 pages", which adds nothing to a list — and `after` holds a
 * quieter second button on the same row ("Untick all").
 */
export function AddBar({ label, onAdd, disabled, disabledTip, above, below, icon, after, children }: {
  label: string;
  onAdd: () => void;
  disabled: boolean;
  disabledTip?: string;
  above?: ReactNode;
  below?: ReactNode;
  /** In place of the plus before the button's words; `null` for none. */
  icon?: ReactNode;
  /** After the button, on its row. */
  after?: ReactNode;
  /** The field, and any picker, before the button. */
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-card/40 p-4">
      {above}
      <div className="flex flex-wrap items-end gap-2">
        {children}
        <span title={disabled ? disabledTip : undefined}>
          <Button variant="quiet" className="h-[46px] px-4 text-[13px]" disabled={disabled} onClick={onAdd}>
            {icon === undefined ? <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> : icon}
            {label}
          </Button>
        </span>
        {after}
      </div>
      {below}
    </div>
  );
}
