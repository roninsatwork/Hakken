"use client";

import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/atoms/Button";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";

type PlanFormData = {
  name: string;
  description: string;
  messageLimit: number;
  priceGBP: number;
  grantedModules: string[];
  isActive: boolean;
};

type PlanDialogsProps = {
  editorOpen: boolean;
  editing: boolean;
  formData: PlanFormData;
  setFormData: Dispatch<SetStateAction<PlanFormData>>;
  grantsControl: ReactNode;
  activeControl: ReactNode;
  submitError: string;
  isSubmitting: boolean;
  onEditorClose: () => void;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  deletingPlanName: string | null;
  onDeleteClose: () => void;
  onDeleteConfirm: () => void | Promise<void>;
};

export function PlanDialogs({
  editorOpen,
  editing,
  formData,
  setFormData,
  grantsControl,
  activeControl,
  submitError,
  isSubmitting,
  onEditorClose,
  onSubmit,
  deletingPlanName,
  onDeleteClose,
  onDeleteConfirm,
}: PlanDialogsProps) {
  const t = useTranslations("admin.plans");
  const tCommon = useTranslations("common");

  return (
    <>
      <SonaeModal
        isOpen={editorOpen}
        onClose={onEditorClose}
        title={editing ? t("editTitle") : t("createTitle")}
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px]">
            {editing ? t("editSubtitle") : t("createSubtitle")}
          </p>
          {submitError ? <p className="text-red-500 text-[13px] font-medium">{submitError}</p> : null}
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <Field
            label={t("nameLabel")}
            required
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            placeholder={t("namePlaceholder")}
          />
          <TextAreaField
            label={t("descLabel")}
            value={formData.description}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
            placeholder={t("descPlaceholder")}
            className="min-h-[80px] resize-y"
          />
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t("limitLabel")}
              type="number"
              required
              value={formData.messageLimit}
              onChange={(event) => setFormData({ ...formData, messageLimit: Number(event.target.value) })}
              placeholder={t("limitPlaceholder")}
              className="font-mono"
            />
            <Field
              label={t("priceLabel")}
              type="number"
              step="0.01"
              required
              value={formData.priceGBP}
              onChange={(event) => setFormData({ ...formData, priceGBP: Number(event.target.value) })}
              placeholder={t("pricePlaceholder")}
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <span className="text-[13px] font-medium text-secondary tracking-wide">{t("grantsLabel")}</span>
            <p className="text-[12px] text-muted">{t("grantsHint")}</p>
            {grantsControl}
          </div>
          {activeControl}
          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={onEditorClose}
              className="rounded-[10px] text-sm hover:bg-foreground/5"
              disabled={isSubmitting}
            >
              {tCommon("cancel")}
            </Button>
            <WriteButton
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? tCommon("saving") : editing ? t("savePlan") : t("newPlan")}
            </WriteButton>
          </div>
        </form>
      </SonaeModal>

      <ConfirmationModal
        isOpen={deletingPlanName !== null}
        onClose={onDeleteClose}
        title={t("deleteTitle")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("actions.delete")}
        isSubmitting={isSubmitting}
        onConfirm={onDeleteConfirm}
        error={submitError}
        warning={{ description: t("deleteWarning") }}
      >
        <p>
          {t.rich("deleteConfirm", {
            name: () => <strong className="text-foreground font-semibold">{deletingPlanName}</strong>,
          })}
        </p>
      </ConfirmationModal>
    </>
  );
}
