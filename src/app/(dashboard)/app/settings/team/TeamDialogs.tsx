"use client";

import type { FormEvent, ReactNode } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { useTranslations } from "next-intl";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { ModalField } from "@/src/ui/components/screens/ModalForm";

type TeamUserFormData = {
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  image: string;
  companyId: string;
};

export function TeamDialogs({
  isAddModalOpen,
  editingUser,
  deletingUser,
  deletingInvite,
  formData,
  onFormDataChange,
  onCloseEditor,
  onSubmit,
  onCloseDelete,
  onCloseRevoke,
  editorRoleField,
  editorActions,
  deleteActions,
  revokeActions,
}: {
  isAddModalOpen: boolean;
  editingUser: Doc<"users"> | null;
  deletingUser: Doc<"users"> | null;
  deletingInvite: Doc<"invitations"> | null;
  formData: TeamUserFormData;
  onFormDataChange: (formData: TeamUserFormData) => void;
  onCloseEditor: () => void;
  onSubmit: (event: FormEvent) => void;
  onCloseDelete: () => void;
  onCloseRevoke: () => void;
  editorRoleField: ReactNode;
  editorActions: ReactNode;
  deleteActions: ReactNode;
  revokeActions: ReactNode;
}) {
  const t = useTranslations("admin.users");

  return (
    <>
      <SonaeModal isOpen={isAddModalOpen} onClose={onCloseEditor} title={editingUser ? t("modal.editTitle") : t("modal.inviteTitle")}>
        <p className="text-secondary mb-6 text-[15px]">{editingUser ? t("modal.editDesc") : t("modal.inviteDesc")}</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <ModalField label={t("modal.fullName")} type="text" required value={formData.name} onChange={(event) => onFormDataChange({ ...formData, name: event.target.value })} placeholder={t("modal.namePlaceholder")} />
          <ModalField label={t("modal.email")} type="email" required value={formData.email} onChange={(event) => onFormDataChange({ ...formData, email: event.target.value })} placeholder={t("modal.emailPlaceholder")} />
          {editorRoleField}
          <ModalField label={t("modal.avatar")} type="url" value={formData.image} onChange={(event) => onFormDataChange({ ...formData, image: event.target.value })} placeholder={t("modal.avatarPlaceholder")}>
            <p className="text-[11px] text-muted">{t("modal.avatarHint")}</p>
          </ModalField>
          {editorActions}
        </form>
      </SonaeModal>
      <SonaeModal isOpen={deletingUser !== null} onClose={onCloseDelete} title={t("modal.deleteTitle")}>
        <p className="text-secondary mb-6 text-[15px] leading-relaxed">{t("modal.deleteConfirm", { name: deletingUser?.name ?? "" })}</p>
        {deleteActions}
      </SonaeModal>
      <SonaeModal isOpen={deletingInvite !== null} onClose={onCloseRevoke} title={t("modal.revokeTitle")}>
        <p className="text-secondary mb-6 text-[15px] leading-relaxed">{t("modal.revokeConfirm", { email: deletingInvite?.email ?? "" })}</p>
        {revokeActions}
      </SonaeModal>
    </>
  );
}
