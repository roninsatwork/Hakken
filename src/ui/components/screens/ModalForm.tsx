"use client";

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useCanWriteHere } from "./AccessLevel";

export const modalInputClassName =
  "px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm";

export const modalTextareaClassName = `${modalInputClassName} min-h-[120px] resize-y custom-scrollbar leading-relaxed`;

type AdminModalFormErrorProps = {
  children?: ReactNode;
  className?: string;
};

export function ModalFormError({ children, className = "" }: AdminModalFormErrorProps) {
  if (!children) return null;

  return <p className={`text-red-500 text-[13px] font-medium ${className}`}>{children}</p>;
}

type AdminModalFormFieldProps = {
  children: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  /**
   * The id of the control this label addresses.
   *
   * Optional because this wraps selects, pickers and groups as well as single
   * inputs, and a label pointing at nothing is worse than one pointing at
   * nothing in particular. Reach for `ModalField` instead where the field is one
   * input — it fills this in and cannot be wired up wrong.
   */
  htmlFor?: string;
};

export function ModalFormField({ children, label, hint, htmlFor }: AdminModalFormFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-secondary tracking-wide">
          {label}
        </label>
        {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

type ModalFieldProps = {
  label: ReactNode;
  /** Sits to the right of the label — a character count, an "optional". */
  hint?: ReactNode;
  /** Rendered under the input, in the caller's own words and styling. */
  children?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "children">;

/**
 * One input inside a modal, with its label tied to it.
 *
 * The pairing was written out by hand on every modal form in the app, and the
 * tie is the part that got dropped: a label that does not address its input is
 * unlabelled to a screen reader and does not focus the input when clicked, and
 * neither is visible to whoever wrote the screen. Here it cannot be dropped,
 * because the id is generated and used in both places.
 *
 * The styling is `modalInputClassName` unchanged, deliberately — a screen moving
 * onto this should not shift by a pixel.
 */
export function ModalField({ label, hint, children, id, ...inputProps }: ModalFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <ModalFormField label={label} hint={hint} htmlFor={fieldId}>
      <input {...inputProps} id={fieldId} className={modalInputClassName} />
      {children}
    </ModalFormField>
  );
}

type AdminModalFormActionsProps = {
  cancelLabel: ReactNode;
  submitLabel: ReactNode;
  isSubmitting: boolean;
  onCancel: () => void;
};

export function ModalFormActions({
  cancelLabel,
  submitLabel,
  isSubmitting,
  onCancel,
}: AdminModalFormActionsProps) {
  const canWriteHere = useCanWriteHere();

  return (
    <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
      <button
        type="button"
        onClick={onCancel}
        className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
        disabled={isSubmitting}
      >
        {cancelLabel}
      </button>
      {canWriteHere ? (
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
        >
          {submitLabel}
        </button>
      ) : null}
    </div>
  );
}
