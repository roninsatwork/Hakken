"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";

export type SearchToRemove = { keywordId: Id<"websiteKeywords">; keyword: string };

type RemoveSearchDialogProps = {
  target: SearchToRemove | null;
  onClose: () => void;
};

/**
 * Stop checking one of the website's searches, asked first.
 *
 * Shared by "Your searches" and "What the AI searched", so removing a search
 * reads the same wherever it is done. The list belongs to the website, not to
 * this company's hold on it, so the dialog says that every company watching
 * the site loses the search too — and that rankings already collected stay.
 */
export function RemoveSearchDialog({ target, onClose }: RemoveSearchDialogProps) {
  const t = useTranslations("admin.siteView.removeSearch");
  const tCommon = useTranslations("common");
  const removeKeyword = useMutation(api.websiteCanonical.removeWebsiteKeyword);
  const action = useAdminAction({ scope: "admin-site-remove-search" });
  const [error, setError] = useState("");

  const close = () => {
    setError("");
    onClose();
  };

  const handleConfirm = async () => {
    if (!target) return;
    setError("");
    const outcome = await action.run(
      () => removeKeyword({ keywordId: target.keywordId }),
      { key: target.keywordId, suppressErrorToast: true, fallbackMessage: t("failed") },
    );
    if (outcome.ok) close();
    else setError(outcome.message);
  };

  const isSubmitting = target ? action.isBusy(target.keywordId) : false;

  return (
    <ConfirmationModal
      isOpen={target !== null}
      onClose={close}
      title={t("title")}
      cancelLabel={tCommon("cancel")}
      confirmLabel={isSubmitting ? t("removing") : t("confirm")}
      isSubmitting={isSubmitting}
      onConfirm={() => void handleConfirm()}
      error={error}
    >
      <p>
        {t.rich("body", {
          keyword: target?.keyword ?? "",
          highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </p>
      <p className="text-[13px] text-muted">{t("kept")}</p>
    </ConfirmationModal>
  );
}
