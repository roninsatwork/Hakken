"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { CheckCircle2, Save } from "lucide-react";

type AdminSaveActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  isSaving: boolean;
  label: ReactNode;
  savingLabel: ReactNode;
  successLabel?: ReactNode;
  showSuccess?: boolean;
};

export function AdminSaveAction({
  isSaving,
  label,
  savingLabel,
  successLabel,
  showSuccess = false,
  type = "button",
  ...buttonProps
}: AdminSaveActionProps) {
  return (
    <div className="flex items-center gap-3">
      {showSuccess && successLabel ? (
        <span className="text-[#10b981] text-[12px] font-medium flex items-center gap-1.5 animate-in fade-in">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {successLabel}
        </span>
      ) : null}
      <button
        type={type}
        disabled={isSaving || buttonProps.disabled}
        className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-white/5 hover:bg-white/10 text-foreground text-[12px] font-medium border border-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        {...buttonProps}
      >
        <Save className="w-3.5 h-3.5" />
        {isSaving ? savingLabel : label}
      </button>
    </div>
  );
}

type AdminSaveErrorProps = {
  children?: ReactNode;
};

export function AdminSaveError({ children }: AdminSaveErrorProps) {
  if (!children) return null;

  return (
    <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] font-medium text-red-400">
      {children}
    </div>
  );
}
