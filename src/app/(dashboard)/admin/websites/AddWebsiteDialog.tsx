"use client";

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";

import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { ModalFormActions, ModalFormError } from "@/src/ui/components/screens/ModalForm";
import { HostField } from "@/src/app/(dashboard)/admin/_components/HostField";

type AddWebsiteDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  submitError: string;
};

/**
 * Add a host to the system, attached to nobody yet.
 *
 * Shares `HostField` with the two company-side add forms: all three ask the
 * same question and echo the same key back, and three copies of that would
 * drift. Only the wording differs, which is passed in.
 */
export function AddWebsiteDialog({
  isOpen,
  onClose,
  url,
  onUrlChange,
  onSubmit,
  isSubmitting,
  submitError,
}: AddWebsiteDialogProps) {
  const t = useTranslations("admin.websites");
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
