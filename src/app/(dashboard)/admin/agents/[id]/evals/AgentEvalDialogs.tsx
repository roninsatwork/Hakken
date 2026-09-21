"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/src/ui/components/screens/Button";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import {
  ModalField,
  ModalFormError,
  ModalFormField,
  modalInputClassName,
  modalTextareaClassName,
} from "@/src/ui/components/screens/ModalForm";

type EvalForm = {
  objective: string;
  rubric: string;
  tools: string;
  mustPass: boolean;
  sampleCount: number;
};

export function AgentEvalDialogs({
  form,
  setForm,
  mustPassControl,
  isFormOpen,
  isEditing,
  formError,
  formBusy,
  archiveOpen,
  archiveBusy,
  onCloseForm,
  onSave,
  onCloseArchive,
  onArchive,
}: {
  form: EvalForm;
  setForm: Dispatch<SetStateAction<EvalForm>>;
  mustPassControl: ReactNode;
  isFormOpen: boolean;
  isEditing: boolean;
  formError?: string | null;
  formBusy: boolean;
  archiveOpen: boolean;
  archiveBusy: boolean;
  onCloseForm: () => void;
  onSave: () => void;
  onCloseArchive: () => void;
  onArchive: () => void;
}) {
  const t = useTranslations("admin.agents.details.evals");

  return (
    <>
      <HakkenModal
        isOpen={isFormOpen}
        onClose={onCloseForm}
        title={isEditing ? t("form.editTitle") : t("form.newTitle")}
        size="lg"
      >
        <div className="flex flex-col gap-5 pt-2">
          <ModalFormError>{formError}</ModalFormError>

          <ModalFormField label={t("form.objectiveLabel")}>
            <textarea
              className={`${modalTextareaClassName} min-h-[110px]`}
              value={form.objective}
              onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
              placeholder={t("form.objectivePlaceholder")}
            />
          </ModalFormField>

          <ModalFormField label={t("form.rubricLabel")} hint={t("form.rubricHint")}>
            <textarea
              className={`${modalTextareaClassName} min-h-[130px]`}
              value={form.rubric}
              onChange={(event) => setForm((current) => ({ ...current, rubric: event.target.value }))}
              placeholder={t("form.rubricPlaceholder")}
            />
          </ModalFormField>

          {mustPassControl}

          <details className="rounded-[8px] border border-border-dim px-3 py-2.5">
            <summary className="cursor-pointer text-[13px] font-semibold text-foreground">{t("form.advanced")}</summary>
            <div className="mt-4 flex flex-col gap-5">
              <ModalFormField label={t("form.sampleLabel")} hint={t("form.sampleHint")}>
                <select
                  className={modalInputClassName}
                  value={String(form.sampleCount)}
                  onChange={(event) => setForm((current) => ({ ...current, sampleCount: Number(event.target.value) }))}
                >
                  <option value="1">{t("form.once")}</option>
                  <option value="3">{t("form.three")}</option>
                  <option value="5">{t("form.five")}</option>
                </select>
              </ModalFormField>
              <ModalField
                label={t("form.toolsLabel")}
                hint={t("form.toolsHint")}
                value={form.tools}
                onChange={(event) => setForm((current) => ({ ...current, tools: event.target.value }))}
                placeholder={t("form.toolsPlaceholder")}
              />
            </div>
          </details>

          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <Button variant="ghost" onClick={onCloseForm} disabled={formBusy} className="px-4 py-2 font-semibold hover:bg-foreground/5">
              {t("form.cancel")}
            </Button>
            <WriteButton type="button" onClick={onSave} disabled={formBusy} className="inline-flex items-center gap-2 rounded-[8px] bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50">
              {formBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? t("form.saveCheck") : t("form.createCheck")}
            </WriteButton>
          </div>
        </div>
      </HakkenModal>

      <HakkenModal isOpen={archiveOpen} onClose={onCloseArchive} title={t("removeModal.title")} size="sm">
        <div className="flex flex-col gap-6">
          <p className="text-[13px] leading-relaxed text-secondary">{t("removeModal.body")}</p>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <Button variant="ghost" onClick={onCloseArchive} disabled={archiveBusy} className="px-4 py-2 font-semibold hover:bg-foreground/5">
              {t("removeModal.cancel")}
            </Button>
            <WriteButton type="button" onClick={onArchive} disabled={archiveBusy} className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {archiveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("removeModal.confirm")}
            </WriteButton>
          </div>
        </div>
      </HakkenModal>
    </>
  );
}
