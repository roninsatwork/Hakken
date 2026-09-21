"use client";

import type { ClientInvite } from "@/convex/invites";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalField, ModalFormField } from "@/src/ui/components/screens/ModalForm";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { useTranslations } from "next-intl";
import type { Dispatch, FormEventHandler, SetStateAction } from "react";

export type SuperAdminFormData = {
  name: string;
  email: string;
  role: "SUPER_ADMIN";
  image: string;
};

type SuperAdminDialogsProps = {
  isEditOpen: boolean;
  editingUser: Doc<"users"> | null;
  deletingUser: Doc<"users"> | null;
  deletingInvite: ClientInvite | null;
  formData: SuperAdminFormData;
  setFormData: Dispatch<SetStateAction<SuperAdminFormData>>;
  isSubmitting: boolean;
  submitError: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCloseEdit: () => void;
  onCloseDelete: () => void;
  onCloseRevoke: () => void;
  onConfirmDelete: () => void;
  onConfirmRevoke: () => void;
};

export function SuperAdminDialogs({
  isEditOpen,
  editingUser,
  deletingUser,
  deletingInvite,
  formData,
  setFormData,
  isSubmitting,
  submitError,
  onSubmit,
  onCloseEdit,
  onCloseDelete,
  onCloseRevoke,
  onConfirmDelete,
  onConfirmRevoke,
}: SuperAdminDialogsProps) {
  const t = useTranslations("admin.superAdmins");

  return (
    <>
      <HakkenModal
        isOpen={isEditOpen}
        onClose={onCloseEdit}
        title={editingUser ? t("editTitle") : t("inviteTitle")}
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px]">
            {editingUser ? t("editSubtitle") : t("inviteSubtitle")}
          </p>
          {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <ModalField
            label={t("nameLabel")}
            type="text"
            required
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            placeholder={t("namePlaceholder")}
          />

          <ModalField
            label={t("emailLabel")}
            type="email"
            required
            value={formData.email}
            onChange={(event) => setFormData({ ...formData, email: event.target.value })}
            placeholder={t("emailPlaceholder")}
          />

          <ModalFormField label={t("roleLabel")} htmlFor="super-admin-role">
            <select
              id="super-admin-role"
              value={formData.role}
              disabled
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground outline-none text-sm appearance-none opacity-50 cursor-not-allowed"
            >
              <option value="SUPER_ADMIN">{t("systemSuperAdmin")}</option>
            </select>
          </ModalFormField>

          <ModalField
            label={t("avatarLabel")}
            type="url"
            value={formData.image}
            onChange={(event) => setFormData({ ...formData, image: event.target.value })}
            placeholder="https://example.com/avatar.jpg"
          >
            <p className="text-[11px] text-muted">{t("avatarHint")}</p>
          </ModalField>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={onCloseEdit}
              className="rounded-[10px] text-sm hover:bg-foreground/5"
            >
              {t("cancel")}
            </Button>
            <WriteButton
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? t("saving") : editingUser ? t("updateUser") : t("sendInvite")}
            </WriteButton>
          </div>
        </form>
      </HakkenModal>

      <ConfirmationModal
        isOpen={!!deletingUser}
        onClose={onCloseDelete}
        title={t("deleteTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={isSubmitting ? t("deleting") : t("deleteTitle")}
        isSubmitting={isSubmitting}
        onConfirm={onConfirmDelete}
        error={submitError}
      >
        <p>
          {t.rich("deleteBody", {
            name: deletingUser?.name ?? "",
            b: (chunks) => <strong className="text-foreground font-semibold">{chunks}</strong>,
          })}
        </p>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={!!deletingInvite}
        onClose={onCloseRevoke}
        title={t("revokeTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={isSubmitting ? t("revoking") : t("revokeTitle")}
        isSubmitting={isSubmitting}
        onConfirm={onConfirmRevoke}
        error={submitError}
      >
        <p>
          {t.rich("revokeBody", {
            email: deletingInvite?.email ?? "",
            b: (chunks) => <strong className="text-foreground font-semibold">{chunks}</strong>,
          })}
        </p>
      </ConfirmationModal>
    </>
  );
}
