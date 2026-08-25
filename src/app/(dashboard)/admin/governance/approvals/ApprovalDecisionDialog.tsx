"use client";

import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";

export function ApprovalDecisionDialog({
  isOpen,
  onClose,
  title,
  cancelLabel,
  confirmLabel,
  isSubmitting,
  onConfirm,
  warningTitle,
  warningBody,
  body,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  cancelLabel: string;
  confirmLabel: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  warningTitle: string;
  warningBody: string;
  body: string;
}) {
  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      isSubmitting={isSubmitting}
      onConfirm={onConfirm}
      warning={{ title: warningTitle, description: warningBody }}
    >
      <p>{body}</p>
    </ConfirmationModal>
  );
}
