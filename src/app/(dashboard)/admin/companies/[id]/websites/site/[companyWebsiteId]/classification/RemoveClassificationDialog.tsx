"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";

/** The classification about to be removed, with what goes with it. */
export type RemovingClassification = { _id: Id<"pageClassifications">; name: string; lines: number; byHand: number };

/**
 * Removing a classification — a yes or a no, so the one pop-up here
 * (AGENTS.md: a pop-up is only for a yes or a no). It says what goes with
 * it: its address lines, and the pages set to it by hand; its pages show as
 * Not sorted unless another classification's line catches them.
 */
export function RemoveClassificationDialog({ companyWebsiteId, removing, onClose, onRemoved }: {
  companyWebsiteId: Id<"companyWebsites">;
  removing: RemovingClassification | null;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("admin.siteView.classification.remove");
  const tCommon = useTranslations("common");
  const removeClassification = useMutation(api.pageClassifications.removePageClassification);
  const action = useAdminAction({ scope: "admin-page-classification-remove" });
  const [error, setError] = useState("");

  const close = () => {
    setError("");
    onClose();
  };

  const removeNow = async () => {
    if (!removing) return;
    setError("");
    const outcome = await action.run(
      () => removeClassification({ companyWebsiteId, classificationId: removing._id }),
      { suppressErrorToast: true, fallbackMessage: t("failed") },
    );
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
      {t("body", { lines: removing?.lines ?? 0, byHand: removing?.byHand ?? 0 })}
    </ConfirmationModal>
  );
}
