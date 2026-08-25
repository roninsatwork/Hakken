"use client";

import type { FormEvent } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalField } from "@/src/ui/components/screens/ModalForm";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import type {
  DirectoryUser,
  Translator,
  UserDirectoryFormData,
  UserDirectoryRoleFields,
} from "./UserDirectoryScreen";

export default function UserDirectoryDialogs({
  t,
  tCommon,
  platformName,
  isAddModalOpen,
  editingUser,
  deletingUser,
  deletingInvite,
  formData,
  isSubmitting,
  submitError,
  roleFields,
  onSubmit,
  onUpdateForm,
  onCloseAdd,
  onCloseDelete,
  onCloseRevoke,
  onConfirmDelete,
  onConfirmRevoke,
}: {
  t: Translator;
  tCommon: Translator;
  platformName: string;
  isAddModalOpen: boolean;
  editingUser: DirectoryUser | null;
  deletingUser: DirectoryUser | null;
  deletingInvite: Doc<"invitations"> | null;
  formData: UserDirectoryFormData;
  isSubmitting: boolean;
  submitError: string;
  roleFields: UserDirectoryRoleFields;
  onSubmit: (event: FormEvent) => void;
  onUpdateForm: (patch: Partial<UserDirectoryFormData>) => void;
  onCloseAdd: () => void;
  onCloseDelete: () => void;
  onCloseRevoke: () => void;
  onConfirmDelete: () => Promise<void>;
  onConfirmRevoke: () => Promise<void>;
}) {
  return (
    <>
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={onCloseAdd}
        title={editingUser ? t("modal.editTitle") : t("modal.inviteTitle")}
      >
        <p className="text-secondary mb-6 text-[15px]">
          {editingUser ? t("modal.editDesc") : t("modal.inviteDesc", { platformName })}
        </p>
        {submitError && <p className="text-red-500 text-[13px] font-medium mb-4">{submitError}</p>}
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <ModalField
            label={t("modal.fullName")}
            type="text"
            required
            value={formData.name}
            onChange={(event) => onUpdateForm({ name: event.target.value })}
            placeholder={t("modal.namePlaceholder")}
          />

          <ModalField
            label={t("modal.email")}
            type="email"
            required
            value={formData.email}
            onChange={(event) => onUpdateForm({ email: event.target.value })}
            placeholder={t("modal.emailPlaceholder")}
          />

          {roleFields({ data: formData, update: onUpdateForm })}

          <ModalField
            label={t("modal.avatar")}
            type="url"
            value={formData.image}
            onChange={(event) => onUpdateForm({ image: event.target.value })}
            placeholder={t("modal.avatarPlaceholder")}
          >
            <p className="text-[11px] text-muted">{t("modal.avatarHint")}</p>
          </ModalField>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={onCloseAdd}
              disabled={isSubmitting}
              className="rounded-[10px] text-sm hover:bg-foreground/5"
            >
              {t("buttons.cancel")}
            </Button>
            <WriteButton
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting
                ? tCommon("saving")
                : editingUser
                  ? t("buttons.updateUser")
                  : t("buttons.sendInvite")}
            </WriteButton>
          </div>
        </form>
      </SonaeModal>

      <ConfirmationModal
        isOpen={!!deletingUser}
        onClose={onCloseDelete}
        title={t("modal.deleteTitle")}
        cancelLabel={t("buttons.cancel")}
        confirmLabel={isSubmitting ? tCommon("deleting") : t("buttons.delete")}
        isSubmitting={isSubmitting}
        onConfirm={onConfirmDelete}
        error={submitError}
      >
        <p>{t("modal.deleteConfirm", { name: deletingUser?.name ?? "" })}</p>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={!!deletingInvite}
        onClose={onCloseRevoke}
        title={t("modal.revokeTitle")}
        cancelLabel={t("buttons.cancel")}
        confirmLabel={isSubmitting ? tCommon("deleting") : t("buttons.revoke")}
        isSubmitting={isSubmitting}
        onConfirm={onConfirmRevoke}
        error={submitError}
      >
        <p>{t("modal.revokeConfirm", { email: deletingInvite?.email ?? "" })}</p>
      </ConfirmationModal>
    </>
  );
}
