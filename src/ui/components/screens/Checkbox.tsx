"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";

/**
 * A tick box, said once.
 *
 * The kit covered tables, fields, buttons and headings, and the screen-kit
 * check enforced all four — but it deliberately skipped tick boxes, because
 * flagging one would have been a build failure with no correct fix: there was
 * no shared part to move onto. Nineteen screens drew their own in the meantime
 * and drifted exactly as far as you would expect, in the size of the box, the
 * weight of the label beside it and whether the label was tied to it at all.
 *
 * Anthony found it on the workspace Features screen, 2026-08-22: *"this is not
 * our standard table and looks like a new style."* That screen is a table now,
 * and this is what sits in its last column.
 *
 * The label is tied to the box by id rather than by wrapping it, for the same
 * reason `Field` ties its own: the association is the part screens skip, and an
 * untied label is silent to a screen reader and does not focus the box when
 * clicked. `labelHidden` keeps that tie while dropping the visible text, for a
 * box inside a table cell whose row already says what it is.
 */

type CheckboxProps = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * Keep the label for whoever is listening, but not for whoever is looking.
   *
   * As on `Field`: for a box whose meaning is already on screen beside it — a
   * column of tick boxes in a table whose other columns name the row. The label
   * still exists and is still tied to the box; only the visible text goes.
   */
  labelHidden?: boolean;
  className?: string;
  id?: string;
};

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  labelHidden,
  className,
  id,
}: CheckboxProps) {
  const generatedId = useId();
  const boxId = id ?? generatedId;

  const box = (
    <input
      type="checkbox"
      id={boxId}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="accent-brand"
    />
  );

  if (labelHidden) {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <label htmlFor={boxId} className="sr-only">{label}</label>
        {box}
      </span>
    );
  }

  return (
    <label
      htmlFor={boxId}
      className={cn(
        "flex w-fit items-center gap-2 text-[13px] text-foreground",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      {box}
      {label as ReactNode}
    </label>
  );
}
