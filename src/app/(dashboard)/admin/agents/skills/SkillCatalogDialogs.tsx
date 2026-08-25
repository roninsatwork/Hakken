"use client";

import type { FormEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/atoms/Button";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import {
  ModalField,
  ModalFormField,
  ModalTextAreaField,
} from "@/src/ui/components/screens/ModalForm";

type DeleteTarget = { id: Id<"agentSkills">; name: string };

type SkillCatalogDialogsProps = {
  editTarget: Doc<"agentSkills"> | null;
  editName: string;
  editDescription: string;
  onEditNameChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onEditFileChange: (file: File | null) => void;
  onCloseEdit: () => void;
  onSaveEdit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  isEditBusy: boolean;
  deleteTarget: DeleteTarget | null;
  onCloseDelete: () => void;
  onConfirmDelete: () => void | Promise<void>;
  isDeleteBusy: boolean;
  isMarkdownOpen: boolean;
  newName: string;
  newDescription: string;
  onNewNameChange: (value: string) => void;
  onNewDescriptionChange: (value: string) => void;
  onNewFileChange: (file: File | null) => void;
  onCloseMarkdown: () => void;
  onAddSkill: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  isAddBusy: boolean;
  error: string | null;
};

export function SkillCatalogDialogs({
  editTarget,
  editName,
  editDescription,
  onEditNameChange,
  onEditDescriptionChange,
  onEditFileChange,
  onCloseEdit,
  onSaveEdit,
  isEditBusy,
  deleteTarget,
  onCloseDelete,
  onConfirmDelete,
  isDeleteBusy,
  isMarkdownOpen,
  newName,
  newDescription,
  onNewNameChange,
  onNewDescriptionChange,
  onNewFileChange,
  onCloseMarkdown,
  onAddSkill,
  isAddBusy,
  error,
}: SkillCatalogDialogsProps) {
  const t = useTranslations("admin.agents.skillCenter");

  return (
    <>
      {editTarget && (
        <SonaeModal isOpen onClose={onCloseEdit} title={t("editTitle")} size="lg">
          <form onSubmit={onSaveEdit} className="flex flex-col gap-4 px-1 pb-2">
            {error && <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}
            <ModalField
              label={t("nameLabel")}
              value={editName}
              onChange={(event) => onEditNameChange(event.target.value)}
            />
            <ModalTextAreaField
              label={t("descriptionLabel")}
              value={editDescription}
              onChange={(event) => onEditDescriptionChange(event.target.value)}
              rows={3}
              placeholder={t("descriptionPlaceholder")}
            />
            <ModalFormField label={t("replaceFile")} htmlFor="skill-edit-file">
              <input
                id="skill-edit-file"
                type="file"
                accept=".md,.markdown,text/markdown"
                onChange={(event) => onEditFileChange(event.target.files?.[0] ?? null)}
                className="text-[13px] text-secondary file:mr-3 file:rounded-[8px] file:border-0 file:bg-foreground/10 file:px-3 file:py-2 file:text-[12px] file:text-foreground"
              />
              <span className="text-[11px] text-muted">
                {editTarget.sourceFilename
                  ? t("currently", { filename: editTarget.sourceFilename })
                  : t("noFile")}
              </span>
            </ModalFormField>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onCloseEdit} className="h-10 rounded-[8px]">
                {t("cancel")}
              </Button>
              <WriteButton type="submit" disabled={isEditBusy} className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {isEditBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("save")}
              </WriteButton>
            </div>
          </form>
        </SonaeModal>
      )}

      {deleteTarget && (
        <SonaeModal isOpen onClose={onCloseDelete} title={t("deleteTitle")} size="sm">
          <div className="flex flex-col gap-5 px-1 pb-2">
            <p className="text-[13px] leading-relaxed text-secondary">
              {t.rich("deleteBody", {
                name: () => <span className="text-foreground font-semibold">{deleteTarget.name}</span>,
              })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCloseDelete} className="h-10 rounded-[8px]">
                {t("cancel")}
              </Button>
              <WriteButton
                type="button"
                onClick={onConfirmDelete}
                disabled={isDeleteBusy}
                className="h-10 px-4 rounded-[8px] bg-red-500 text-white text-[13px] font-medium hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t("deleteConfirm")}
              </WriteButton>
            </div>
          </div>
        </SonaeModal>
      )}

      {isMarkdownOpen && (
        <SonaeModal isOpen onClose={onCloseMarkdown} title={t("addTitle")} size="lg">
          <form onSubmit={onAddSkill} className="flex flex-col gap-4 px-1 pb-2">
            {error && <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}
            <ModalField
              label={t("nameLabel")}
              value={newName}
              onChange={(event) => onNewNameChange(event.target.value)}
              placeholder={t("newNamePlaceholder")}
            />
            <ModalTextAreaField
              label={t("descriptionLabel")}
              value={newDescription}
              onChange={(event) => onNewDescriptionChange(event.target.value)}
              rows={3}
              placeholder={t("descriptionPlaceholder")}
            />
            <ModalFormField label={t("fileLabel")} htmlFor="skill-new-file">
              <input
                id="skill-new-file"
                type="file"
                accept=".md,.markdown,text/markdown"
                onChange={(event) => onNewFileChange(event.target.files?.[0] ?? null)}
                className="text-[13px] text-secondary file:mr-3 file:rounded-[8px] file:border-0 file:bg-foreground/10 file:px-3 file:py-2 file:text-[12px] file:text-foreground"
              />
              <span className="text-[11px] text-muted">{t("fileHint")}</span>
            </ModalFormField>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onCloseMarkdown} className="h-10 rounded-[8px]">
                {t("cancel")}
              </Button>
              <WriteButton type="submit" disabled={isAddBusy} className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {isAddBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("addSkill")}
              </WriteButton>
            </div>
          </form>
        </SonaeModal>
      )}
    </>
  );
}
