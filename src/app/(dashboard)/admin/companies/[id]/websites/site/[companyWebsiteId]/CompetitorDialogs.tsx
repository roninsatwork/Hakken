"use client";

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";

import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalFormActions, ModalFormError } from "@/src/ui/components/screens/ModalForm";
import { HostField } from "@/src/app/(dashboard)/admin/_components/HostField";

type AddCompetitorDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  submitError: string;
};

/**
 * Track a competitor against this website.
 *
 * The line under the field says whether the host is already in the system, and
 * here that is worth reading as good news: a rival two customers both watch is
 * one record and one DataForSEO pull, so adding it a second time costs nothing.
 */
export function AddCompetitorDialog({
  isOpen,
  onClose,
  url,
  onUrlChange,
  onSubmit,
  isSubmitting,
  submitError,
}: AddCompetitorDialogProps) {
  const t = useTranslations("admin.companyWebsiteDetail");
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

type RemoveCompetitorDialogProps = {
  host: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
  error: string;
};

/** Stop tracking here. The competitor's record and its data stay. */
export function RemoveCompetitorDialog({
  host,
  onClose,
  onConfirm,
  isSubmitting,
  error,
}: RemoveCompetitorDialogProps) {
  const t = useTranslations("admin.companyWebsiteDetail");
  const tCommon = useTranslations("common");

  return (
    <ConfirmationModal
      isOpen={host !== null}
      onClose={onClose}
      title={t("removeTitle")}
      cancelLabel={tCommon("cancel")}
      confirmLabel={isSubmitting ? tCommon("deleting") : t("removeCompetitor")}
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
