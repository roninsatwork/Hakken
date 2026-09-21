"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import {
  ModalField,
  ModalFormActions,
} from "@/src/ui/components/screens/ModalForm";

type WorkflowFormData = {
  name: string;
  description: string;
};

type WorkflowDialogsProps = {
  editorOpen: boolean;
  formData: WorkflowFormData;
  setFormData: Dispatch<SetStateAction<WorkflowFormData>>;
  submitError: string;
  isSubmitting: boolean;
  onEditorClose: () => void;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  deletingWorkflowName: string | null;
  onDeleteClose: () => void;
  onDeleteConfirm: () => void | Promise<void>;
};

export function WorkflowDialogs({
  editorOpen,
  formData,
  setFormData,
  submitError,
  isSubmitting,
  onEditorClose,
  onSubmit,
  deletingWorkflowName,
  onDeleteClose,
  onDeleteConfirm,
}: WorkflowDialogsProps) {
  const t = useTranslations("admin.workflows");

  return (
    <>
      <HakkenModal
        isOpen={editorOpen}
        onClose={onEditorClose}
        title={t("modal.initTitle")}
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px]">{t("modal.initDesc")}</p>
          {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <ModalField
            label={t("modal.name")}
            required
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            placeholder={t("placeholders.name")}
          />

          <ModalField
            label={t("modal.description")}
            value={formData.description}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
            placeholder={t("placeholders.description")}
          />

          <ModalFormActions
            cancelLabel={t("buttons.cancel")}
            submitLabel={isSubmitting ? t("buttons.creating") : t("buttons.create")}
            isSubmitting={isSubmitting}
            onCancel={onEditorClose}
          />
        </form>
      </HakkenModal>

      <ConfirmationModal
        isOpen={deletingWorkflowName !== null}
        onClose={onDeleteClose}
        title={t("modal.deleteTitle")}
        cancelLabel={t("buttons.cancel")}
        confirmLabel={isSubmitting ? t("buttons.deleting") : t("buttons.delete")}
        isSubmitting={isSubmitting}
        onConfirm={onDeleteConfirm}
        error={submitError}
      >
        <p>{t("modal.deleteConfirm", { name: deletingWorkflowName ?? "" })}</p>
        <p className="text-[13px] text-muted">{t("modal.undone")}</p>
      </ConfirmationModal>
    </>
  );
}
