"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";

/** The type about to be removed. */
export type RemovingType = { key: string; name: string };

/**
 * Removing an added type no classification uses — a yes or a no, so the one
 * pop-up here (AGENTS.md: a pop-up is only for a yes or a no;
 * classification-types-plan CT5). The server refuses a type in use as well.
 */
export function RemoveClassificationTypeDialog({ removing, onClose, onRemoved }: {
  removing: RemovingType | null;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("admin.classificationTypes.removeDialog");
  const tCommon = useTranslations("common");
  const removeType = useMutation(api.classificationTypes.removeClassificationType);
  const action = useAdminAction({ scope: "admin-classification-type-remove" });
  const [error, setError] = useState("");

  const close = () => {
    setError("");
    onClose();
  };

  const removeNow = async () => {
    if (!removing) return;
    setError("");
    const outcome = await action.run(() => removeType({ key: removing.key }), { suppressErrorToast: true, fallbackMessage: t("failed") });
    if (outcome.ok) onRemoved();
    else if (!outcome.deduplicated) setError(outcome.message);
  };

  return (
    <ConfirmationModal
      isOpen={removing !== null}
      onClose={close}
      title={t("title", { name: removing?.name ?? "" })}
      cancelLabel={tCommon("cancel")}
      confirmLabel={t("confirm")}
      isSubmitting={action.isBusy()}
      onConfirm={() => void removeNow()}
      error={error}
    >
      {t("body")}
    </ConfirmationModal>
  );
}
