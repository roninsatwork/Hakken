"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { useCanWriteHere } from "./AdminAccessLevel";

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
  const canWriteHere = useCanWriteHere();

  // Nothing to save when nothing can be changed. The fields on the settings
  // screens above this button read fine on their own.
  if (!canWriteHere) return null;

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

type AdminSaveFeedbackProps = {
  status: "idle" | "success" | "error";
  successTitle: ReactNode;
  successMessage: ReactNode;
  errorTitle: ReactNode;
  errorMessage: ReactNode;
};

export function AdminSaveFeedback({
  status,
  successTitle,
  successMessage,
  errorTitle,
  errorMessage,
}: AdminSaveFeedbackProps) {
  return (
    <AnimatePresence mode="wait">
      {status === "success" ? (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-3 w-full bg-[#10b981]/10 border border-[#10b981]/20 rounded-[12px] p-4 text-[#10b981]">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold text-[13px] tracking-wide">{successTitle}</span>
              <span className="text-[12px] opacity-80">{successMessage}</span>
            </div>
          </div>
        </motion.div>
      ) : null}

      {status === "error" ? (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-3 w-full bg-red-500/10 border border-red-500/20 rounded-[12px] p-4 text-red-500">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold text-[13px] tracking-wide">{errorTitle}</span>
              <span className="text-[12px] opacity-80">{errorMessage}</span>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

type AdminFeedbackPillProps = {
  children: ReactNode;
  tone: "success" | "error";
};

export function AdminFeedbackPill({ children, tone }: AdminFeedbackPillProps) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  const toneClassName =
    tone === "success"
      ? "bg-[#10b981]/10 border-[#10b981]/20 rounded-full text-[#10b981] items-center gap-2"
      : "bg-red-500/10 border-red-500/20 rounded-[12px] text-red-500 items-start gap-2.5";

  return (
    <div
      className={`px-5 py-2 border text-[13px] flex animate-in slide-in-from-bottom-2 fade-in ${toneClassName}`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${tone === "error" ? "mt-0.5" : ""}`} />
      <span className={tone === "error" ? "leading-snug text-center" : ""}>{children}</span>
    </div>
  );
}
