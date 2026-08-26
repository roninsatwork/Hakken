"use client";

import type { FormEvent, ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Doc } from "@/convex/_generated/dataModel";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import {
  ModalField,
  ModalFormActions,
  ModalFormError,
  ModalFormField,
  modalInputClassName,
  modalTextareaClassName,
} from "@/src/ui/components/screens/ModalForm";

type CompanyFormData = {
  name: string;
  systemPrompt: string;
  planId: string;
  enabledModules: string[];
};

type CompanyDialogsProps = {
  isFormOpen: boolean;
  onCloseForm: () => void;
  isEditing: boolean;
  formData: CompanyFormData;
  onFormDataChange: (formData: CompanyFormData) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  activePlans: ReadonlyArray<Doc<"plans">>;
  renderModuleOptions: () => ReactNode;
  isSubmitting: boolean;
  submitError: string;
  deletingCompanyName: string | null;
  onCloseDelete: () => void;
  onConfirmDelete: () => Promise<void>;
};

export function CompanyDialogs({
  isFormOpen,
  onCloseForm,
  isEditing,
  formData,
  onFormDataChange,
  onSubmit,
  activePlans,
  renderModuleOptions,
  isSubmitting,
  submitError,
  deletingCompanyName,
  onCloseDelete,
  onConfirmDelete,
}: CompanyDialogsProps) {
  const t = useTranslations("admin.companies");
  const tCommon = useTranslations("common");
  const moduleOptions = renderModuleOptions();

  return (
    <>
      {/*
        Wide, and the fields laid out across it. As a single narrow column
        the seven module cards ran far past the fold: a form of four short
        fields that needed scrolling to reach its own Save button (Anthony,
        2026-08-20). The name, directives and plan take one column; the
        modules take the other and wrap into two of their own on a wide
        screen.
      */}
      <SonaeModal
        isOpen={isFormOpen}
        onClose={onCloseForm}
        title={isEditing ? t("editTitle") : t("createTitle")}
        size="lg"
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px]">
            {isEditing ? t("editSubtitle") : t("createSubtitle")}
          </p>
          <ModalFormError>{submitError}</ModalFormError>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="grid gap-5 md:grid-cols-2 md:items-start">
            <div className="flex flex-col gap-5">
              <ModalField
                label={t("nameLabel")}
                type="text"
                required
                value={formData.name}
                onChange={(event) => onFormDataChange({ ...formData, name: event.target.value })}
                placeholder={t("namePlaceholder")}
              />

              <ModalFormField label={t("promptLabel")} hint={t("promptOptional")}>
                <textarea
                  value={formData.systemPrompt}
                  onChange={(event) => onFormDataChange({ ...formData, systemPrompt: event.target.value })}
                  className={modalTextareaClassName}
                  placeholder={t("promptPlaceholder")}
                />
              </ModalFormField>

              <ModalFormField label={t("planLabel")}>
                <select
                  value={formData.planId}
                  onChange={(event) => onFormDataChange({ ...formData, planId: event.target.value })}
                  className={modalInputClassName}
                >
                  <option value="">No Plan (Unlimited / System Default)</option>
                  {activePlans.map((plan) => (
                    <option key={plan._id} value={plan._id}>
                      {plan.name} {plan.messageLimit === -1 ? "(Unlimited)" : `(${plan.messageLimit} msgs)`} - £{plan.priceGBP}/mo
                    </option>
                  ))}
                </select>
              </ModalFormField>
            </div>

            {moduleOptions ? (
              <ModalFormField label={t("modulesLabel")} hint={t("modulesHint")}>
                {moduleOptions}
              </ModalFormField>
            ) : null}
          </div>

          <ModalFormActions
            cancelLabel={tCommon("cancel")}
            submitLabel={isSubmitting
              ? tCommon("saving")
              : isEditing ? t("editTitle") : t("provisionTenant")}
            isSubmitting={isSubmitting}
            onCancel={onCloseForm}
          />
        </form>
      </SonaeModal>

      <ConfirmationModal
        isOpen={deletingCompanyName !== null}
        onClose={onCloseDelete}
        title={t("deleteTitle")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={isSubmitting ? tCommon("deleting") : t("deleteTenant")}
        isSubmitting={isSubmitting}
        onConfirm={onConfirmDelete}
        error={submitError}
        warning={{
          title: t("warningCascade"),
          description: t("warningDesc"),
        }}
      >
        <p>
          {t.rich("deleteConfirm", {
            name: deletingCompanyName ?? "",
            highlight: (chunks) => (
              <strong className="text-foreground font-semibold">{chunks}</strong>
            ),
          })}
        </p>
      </ConfirmationModal>
    </>
  );
}
