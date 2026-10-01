"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import type { ArticleForm } from "./articleForm";

/**
 * Writing a Knowledge article (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 1): its title and words in English and in Italian (A7), and
 * whether readers can see it yet. Publishing needs both languages whole; the
 * server says so if one is missing.
 */
export function KnowledgeArticleDialogs({
  editorOpen,
  editing,
  form,
  setForm,
  submitError,
  isSubmitting,
  onEditorClose,
  onSubmit,
  deletingTitle,
  onDeleteClose,
  onDeleteConfirm,
}: {
  editorOpen: boolean;
  editing: boolean;
  form: ArticleForm;
  setForm: Dispatch<SetStateAction<ArticleForm>>;
  submitError: string;
  isSubmitting: boolean;
  onEditorClose: () => void;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  deletingTitle: string | null;
  onDeleteClose: () => void;
  onDeleteConfirm: () => void | Promise<void>;
}) {
  const t = useTranslations("admin.knowledgeArticles");
  const tCommon = useTranslations("common");
  const set = (field: keyof ArticleForm) => (value: string) => setForm((before) => ({ ...before, [field]: value }));

  return (
    <>
      <HakkenModal isOpen={editorOpen} onClose={onEditorClose} title={editing ? t("editTitle") : t("createTitle")} size="xl">
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-[15px] text-secondary">{t("editorSubtitle")}</p>
          {submitError ? <p className="text-[13px] font-medium text-red-500">{submitError}</p> : null}
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="knowledge-article-status">{t("statusLabel")}</FieldLabel>
            <Select id="knowledge-article-status" value={form.status} onChange={set("status")} className="w-full sm:w-64">
              <option value="DRAFT">{t("draft")}</option>
              <option value="PUBLISHED">{t("published")}</option>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <Field label={t("titleEnLabel")} required value={form.titleEn} onChange={(event) => set("titleEn")(event.target.value)} />
              <TextAreaField
                label={t("bodyEnLabel")}
                hint={t("bodyHint")}
                value={form.bodyEn}
                onChange={(event) => set("bodyEn")(event.target.value)}
                className="min-h-[320px] resize-y font-mono text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-4">
              <Field label={t("titleItLabel")} value={form.titleIt} onChange={(event) => set("titleIt")(event.target.value)} />
              <TextAreaField
                label={t("bodyItLabel")}
                hint={t("bodyHint")}
                value={form.bodyIt}
                onChange={(event) => set("bodyIt")(event.target.value)}
                className="min-h-[320px] resize-y font-mono text-[13px]"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-4 border-t border-border-dim pt-6">
            <Button variant="ghost" onClick={onEditorClose} className="rounded-[10px] text-sm hover:bg-foreground/5" disabled={isSubmitting}>
              {tCommon("cancel")}
            </Button>
            <WriteButton
              type="submit"
              disabled={isSubmitting}
              className="rounded-[10px] bg-foreground px-6 py-2.5 text-sm font-medium text-background shadow-xl shadow-foreground/10 transition-all hover:bg-foreground/90 disabled:opacity-50"
            >
              {isSubmitting ? tCommon("saving") : editing ? t("save") : t("create")}
            </WriteButton>
          </div>
        </form>
      </HakkenModal>

      <ConfirmationModal
        isOpen={deletingTitle !== null}
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
            title: deletingTitle ?? "",
            highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
          })}
        </p>
      </ConfirmationModal>
    </>
  );
}
