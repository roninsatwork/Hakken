"use client";

import type { ReactNode } from "react";
import { useCanWriteHere } from "./AdminAccessLevel";

export const adminModalInputClassName =
  "px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm";

export const adminModalTextareaClassName = `${adminModalInputClassName} min-h-[120px] resize-y custom-scrollbar leading-relaxed`;

type AdminModalFormErrorProps = {
  children?: ReactNode;
  className?: string;
};

export function AdminModalFormError({ children, className = "" }: AdminModalFormErrorProps) {
  if (!children) return null;

  return <p className={`text-red-500 text-[13px] font-medium ${className}`}>{children}</p>;
}

type AdminModalFormFieldProps = {
  children: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
};

export function AdminModalFormField({ children, label, hint }: AdminModalFormFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-medium text-secondary tracking-wide">{label}</label>
        {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

type AdminModalFormActionsProps = {
  cancelLabel: ReactNode;
  submitLabel: ReactNode;
  isSubmitting: boolean;
  onCancel: () => void;
};

export function AdminModalFormActions({
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
