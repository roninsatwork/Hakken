"use client";

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/src/ui/lib/utils";
import { FieldHint, FieldLabel, fieldClassName, textAreaClassName } from "./SettingsCard";

/**
 * A form field, said once.
 *
 * The kit already owned the styling — `fieldClassName` and `FieldLabel` — but
 * only as loose parts, so every screen still wrote its own `<input>` and wired
 * its own label. 88 of them did, and the wiring is the part that gets skipped:
 * a label that is not tied to its input reads as unlabelled to a screen reader
 * and does not focus the input when clicked, which is silent and invisible to
 * whoever built the screen.
 *
 * So the association is not optional here. The id is generated when the caller
 * does not supply one, and `htmlFor` always matches it. That is the whole
 * reason this is a component and not one more exported class name.
 *
 * The look is unchanged from the loose parts, deliberately — screens moving
 * onto this should not shift by a pixel.
 */

type FieldProps = {
  label: string;
  hint?: ReactNode;
  /** Rendered under the field, in place of the hint, when set. */
  error?: ReactNode;
  /**
   * Keep the label for whoever is listening, but not for whoever is looking.
   *
   * For a field whose purpose is already obvious on screen — a quick-add row, a
   * search box under a heading that names it. The label still exists and is
   * still tied to the input; it is only the visible text that goes. Never reach
   * for this to tidy a form up: an unlabelled-looking form is harder for
   * everyone, and this is for the cases where the label would be a repetition.
   */
  labelHidden?: boolean;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

export function Field({ label, hint, error, labelHidden, className, id, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedById = hint || error ? `${fieldId}-description` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {labelHidden ? (
        <label htmlFor={fieldId} className="sr-only">{label}</label>
      ) : (
        <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      )}
      <input
        {...inputProps}
        id={fieldId}
        aria-describedby={describedById}
        aria-invalid={error ? true : undefined}
        className={cn(fieldClassName, className)}
      />
      {error ? (
        <p id={describedById} className="text-[11px] leading-relaxed text-red-500">
          {error}
        </p>
      ) : hint ? (
        <FieldHint id={describedById}>{hint}</FieldHint>
      ) : null}
    </div>
  );
}

type TextAreaFieldProps = {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export function TextAreaField({ label, hint, error, className, id, ...textAreaProps }: TextAreaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedById = hint || error ? `${fieldId}-description` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <textarea
        {...textAreaProps}
        id={fieldId}
        aria-describedby={describedById}
        aria-invalid={error ? true : undefined}
        className={cn(textAreaClassName, className)}
      />
      {error ? (
        <p id={describedById} className="text-[11px] leading-relaxed text-red-500">
          {error}
        </p>
      ) : hint ? (
        <FieldHint id={describedById}>{hint}</FieldHint>
      ) : null}
    </div>
  );
}
