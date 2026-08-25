"use client";

import { useTranslations } from "next-intl";

import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";

export function AgentDeleteDialog({
  agentName,
  isOpen,
  isSubmitting,
  error,
  onClose,
  onConfirm,
}: {
  agentName: string;
  isOpen: boolean;
  isSubmitting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("admin.agents");

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      title={t("modal.deleteTitle")}
      cancelLabel={t("buttons.cancel")}
      confirmLabel={isSubmitting ? t("buttons.deleting") : t("buttons.delete")}
      isSubmitting={isSubmitting}
      onConfirm={onConfirm}
      error={error}
    >
      <p>{t("modal.deleteConfirm", { name: agentName })}</p>
      <p className="text-[13px] text-muted">{t("modal.undone")}</p>
    </ConfirmationModal>
  );
}
