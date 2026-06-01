"use client";

import type { ReactNode } from "react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { AdminModalFormError } from "@/src/app/(dashboard)/admin/_components/AdminModalForm";

type AdminConfirmationWarningProps = {
  title: ReactNode;
  description: ReactNode;
};

type AdminConfirmationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  cancelLabel: ReactNode;
  confirmLabel: ReactNode;
  isSubmitting: boolean;
  onConfirm: () => void;
  error?: ReactNode;
  warning?: AdminConfirmationWarningProps;
};

export function AdminConfirmationModal({
  isOpen,
  onClose,
  title,
  children,
  cancelLabel,
  confirmLabel,
  isSubmitting,
  onConfirm,
  error,
  warning,
}: AdminConfirmationModalProps) {
  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <SonaeModal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
        {children}
        {warning ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-[10px] p-4 text-red-500/90 text-[13px]">
            <strong className="font-semibold block mb-1 uppercase tracking-widest text-[11px]">
              {warning.title}
            </strong>
            {warning.description}
          </div>
        ) : null}
        <AdminModalFormError>{error}</AdminModalFormError>
      </div>

      <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
        <button
          type="button"
          onClick={handleClose}
          className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
          disabled={isSubmitting}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </SonaeModal>
  );
}
