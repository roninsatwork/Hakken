"use client";

import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";

type DeleteCompanyDialogProps = {
  /** The company being deleted; null when the dialog is closed. */
  companyName: string | null;
  isSubmitting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

/**
 * Manage Companies' one pop-up: yes or no to deleting a company. Adding a
 * company is its own page and editing one is its Overview tab
 * (docs/plans/active/add-company-page-plan.md, AC1 and AC5).
 */
export function DeleteCompanyDialog({ companyName, isSubmitting, error, onClose, onConfirm }: DeleteCompanyDialogProps) {
  const t = useTranslations("admin.companies");
  const tCommon = useTranslations("common");

  return (
    <ConfirmationModal
      isOpen={companyName !== null}
      onClose={onClose}
      title={t("deleteTitle")}
      cancelLabel={tCommon("cancel")}
      confirmLabel={isSubmitting ? tCommon("deleting") : t("deleteTenant")}
      isSubmitting={isSubmitting}
      onConfirm={onConfirm}
      error={error}
      warning={{
        title: t("warningCascade"),
        description: t("warningDesc"),
      }}
    >
      <p>
        {t.rich("deleteConfirm", {
          name: companyName ?? "",
          highlight: (chunks) => (
            <strong className="text-foreground font-semibold">{chunks}</strong>
          ),
        })}
      </p>
    </ConfirmationModal>
  );
}
