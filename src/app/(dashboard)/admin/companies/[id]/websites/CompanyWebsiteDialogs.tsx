"use client";

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";

import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalFormActions, ModalFormError } from "@/src/ui/components/screens/ModalForm";
import { HostField } from "@/src/app/(dashboard)/admin/_components/HostField";

type AddCompanyWebsiteDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  submitError: string;
};

/** Add one of a company's own websites. */
export function AddCompanyWebsiteDialog({
  isOpen,
  onClose,
  url,
  onUrlChange,
  onSubmit,
  isSubmitting,
  submitError,
}: AddCompanyWebsiteDialogProps) {
  const t = useTranslations("admin.companyWebsites");
  const tCommon = useTranslations("common");

  return (
    <HakkenModal isOpen={isOpen} onClose={onClose} title={t("addTitle")} size="md">
      <div className="mb-6 flex flex-col gap-2">
        <p className="text-[15px] text-secondary">{t("addSubtitle")}</p>
        <ModalFormError>{submitError}</ModalFormError>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <HostField
          label={t("urlLabel")}
          placeholder={t("urlPlaceholder")}
          value={url}
          onChange={onUrlChange}
          labels={{
            savedAs: (host) => t("savedAs", { host }),
            alreadyKnown: t("alreadyKnown"),
            newWebsite: t("newWebsite"),
            inherits: (counts) => t("inherits", counts),
          }}
        />

        <ModalFormActions
          cancelLabel={tCommon("cancel")}
          submitLabel={isSubmitting ? tCommon("saving") : t("add")}
          isSubmitting={isSubmitting}
          onCancel={onClose}
        />
      </form>
    </HakkenModal>
  );
}

type RemoveCompanyWebsiteDialogProps = {
  host: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
  error: string;
};

/**
 * Remove, which is not delete.
 *
 * The website record, its data and every competitor record survive — what goes
 * is this company's hold on them. The two actions read alike on a screen and
 * mean very different things, so this one says which it is.
 */
export function RemoveCompanyWebsiteDialog({
  host,
  onClose,
  onConfirm,
  isSubmitting,
  error,
}: RemoveCompanyWebsiteDialogProps) {
  const t = useTranslations("admin.companyWebsites");
  const tCommon = useTranslations("common");

  return (
    <ConfirmationModal
      isOpen={host !== null}
      onClose={onClose}
      title={t("removeTitle")}
      cancelLabel={tCommon("cancel")}
      confirmLabel={isSubmitting ? tCommon("deleting") : t("removeWebsite")}
      isSubmitting={isSubmitting}
      onConfirm={onConfirm}
      error={error}
      warning={{ title: t("removeWarningTitle"), description: t("removeWarningBody") }}
    >
      <p>
        {t.rich("removeConfirm", {
          host: host ?? "",
          highlight: (chunks) => (
            <strong className="font-semibold text-foreground">{chunks}</strong>
          ),
        })}
      </p>
    </ConfirmationModal>
  );
}
