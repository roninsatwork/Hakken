"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  Users,
  Plus,
  MoreVertical,
  Trash2,
  Edit2
} from "lucide-react";
import {
  DirectoryInviteAwaitingActions,
  DirectoryInviteIdentityCell,
  DirectoryInviteRolePill,
  DirectoryTextCell,
  DirectoryUserIdentityCell,
  DirectoryUserRolePill,
} from "@/src/app/(dashboard)/_features/user-directory/DirectoryTableCells";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/atoms/Button";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalField, ModalFormField } from "@/src/ui/components/screens/ModalForm";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDate } from "@/src/lib/dates";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTION_KEYS, ROLE_LABEL_KEYS, type UserRole } from "@/src/lib/userRoles";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

type UserRow = Doc<"users"> & { companyName?: string | null };

type UserFormData = {
  name: string;
  email: string;
  role: UserRole;
  image: string;
  companyId: string;
};

export default function ManageUsersPage() {
  const currentUser = useQuery(api.users.getMe);
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const companyOptions = useQuery(api.companies.getCompanyOptions, isSuperAdmin ? {} : "skip") || [];
  const t = useTranslations('admin.users');
  const tCommon = useTranslations('common');

  const getCompanyName = (id: string) => companyOptions.find((c) => c._id === id)?.name || t('table.systemLevel');

  const [searchTerm, setSearchTerm] = useState("");
  
  const pendingInvites = useQuery(api.invites.getPendingInvites) || [];

  const { results: filteredUsers, status, loadMore } = usePaginatedQuery(
    api.users.getPaginatedUsers,
    // The admin section is not scoped by the impersonated workspace —
    // impersonation is a front-end device. See convex/users.ts.
    { searchTerm, scope: "platform" as const },
    { initialNumItems: TABLE_PAGE_SIZE }
  );

  const deleteUser = useMutation(api.users.deleteUser);
  const revokeInvite = useMutation(api.invites.revokeInvite);
  const addUser = useMutation(api.users.addUser);
  const updateUser = useMutation(api.users.updateUser);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<Doc<"invitations"> | null>(null);

  const [formData, setFormData] = useState<UserFormData>({ name: "", email: "", role: "USER", image: "", companyId: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const filteredInvites = pendingInvites.filter((inv) =>
    (inv.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Invitations and people share one table, so they share one page count.
  // Paged together, then split again for rendering — the footer must report the
  // table, not one half of it.
  const directoryRows = [
    ...filteredInvites.map((invite) => ({ kind: "invite" as const, invite })),
    ...filteredUsers.map((user) => ({ kind: "user" as const, user })),
  ];

  const paged = usePagedRows(directoryRows, {
    canLoadMore: status === "CanLoadMore",
    loadMore,
    resetKey: searchTerm,
  });

  type DirectoryRow = (typeof directoryRows)[number];

  const handleOpenEdit = (user: UserRow) => {
    setFormData({ name: user.name ?? "", email: user.email ?? "", role: user.role || "USER", image: user.image || "", companyId: user.companyId || "" });
    setEditingUser(user);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError("");
    const payload = {
      ...formData,
      companyId: isSuperAdmin && formData.companyId ? (formData.companyId as Id<"companies">) : undefined
    };
    try {
      if (editingUser) {
        await updateUser({ id: editingUser._id, ...payload });
      } else {
        await addUser(payload);
      }
      setIsAddModalOpen(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Failed to save user."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingUser && !isSubmitting) {
      setIsSubmitting(true);
      setSubmitError("");
      try {
      await deleteUser({ id: deletingUser._id });
      setDeletingUser(null);
      } catch (error) {
        setSubmitError(getErrorMessage(error, "Failed to delete user."));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const confirmRevoke = async () => {
    if (deletingInvite && !isSubmitting) {
      setIsSubmitting(true);
      setSubmitError("");
      try {
      await revokeInvite({ id: deletingInvite._id });
      setDeletingInvite(null);
      } catch (error) {
        setSubmitError(getErrorMessage(error, "Failed to revoke invitation."));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Users className="w-6 h-6 text-brand" />
            {t('title')}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t('description')}</p>
        </div>

        <Link
          href="/admin/users/invite"
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
        >
          <Plus className="w-4 h-4" />
          <span>{t('invite')}</span>
        </Link>
      </div>

      {/* Users Table */}
      <DataTable
        rows={status === "LoadingFirstPage" ? undefined : paged.pageRows}
        search={{ value: searchTerm, onChange: setSearchTerm, placeholder: t('searchPlaceholder') }}
        rowKey={(row) => (row.kind === "invite" ? `inv_${row.invite._id}` : row.user._id)}
        /* A pending invitation is not a person yet. */
        rowClassName={(row) => (row.kind === "invite" ? "bg-brand/[0.03] hover:bg-brand/[0.05] opacity-80" : "")}
        empty={{
          icon: <Users className="w-8 h-8 text-muted/30" />,
          label: "No one found",
          action: (
            <p className="text-[13px] text-secondary">
              {searchTerm.length > 0 ? "Nobody matches that search." : t('table.noMatches')}
            </p>
          ),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.loadedCount,
          pageSize: paged.pageSize,
          isLoading: status === "LoadingMore" || status === "LoadingFirstPage",
          onPageChange: paged.goToPage,
          labels: { empty: t('table.noMatches') },
        }}
        /*
          The header used to read User / Workspace / Role while every row read
          User / Role / Workspace, so on a super admin's screen the column
          headed "Workspace scope" listed roles and the one headed "Role"
          listed workspaces. Two loops and one header block, each written at a
          different time — exactly the drift a single column list makes
          impossible, because the heading and the cell are now the same entry.
        */
        columns={[
          {
            key: "user",
            header: tCommon('table.user'),
            cell: (row) =>
              row.kind === "invite" ? (
                <DirectoryInviteIdentityCell pendingLabel={t('table.pending')} email={row.invite.email} />
              ) : (
                <DirectoryUserIdentityCell
                  user={row.user}
                  alt={row.user.name ?? row.user.email ?? tCommon('table.user')}
                  href={`/admin/users/${row.user._id}`}
                />
              ),
          },
          {
            key: "role",
            header: tCommon('table.role'),
            cell: (row) =>
              row.kind === "invite" ? (
                <DirectoryInviteRolePill>
                  {t('table.pending')} {row.invite.role}
                </DirectoryInviteRolePill>
              ) : (
                <DirectoryUserRolePill
                  isAdmin={row.user.role === 'ADMIN'}
                  label={row.user.role === 'SUPER_ADMIN' ? t('roles.superAdmin') : row.user.role === 'ADMIN' ? t('roles.admin') : t('roles.user')}
                />
              ),
          },
          ...(isSuperAdmin
            ? [
                {
                  key: "workspace",
                  header: t('table.workspace'),
                  cell: (row: DirectoryRow) => (
                    <DirectoryTextCell>
                      {row.kind === "invite"
                        ? row.invite.companyId
                          ? getCompanyName(row.invite.companyId)
                          : t('table.systemLevel')
                        : row.user.companyId
                          ? row.user.companyName ?? getCompanyName(row.user.companyId)
                          : t('table.sonaeGlobal')}
                    </DirectoryTextCell>
                  ),
                },
              ]
            : []),
          {
            key: "joined",
            header: t('table.joined'),
            cell: (row) => (
              <DirectoryTextCell>
                {row.kind === "invite"
                  ? formatDate(row.invite.invitedAt, { fallback: t('table.na') })
                  : formatDate(row.user.createdAt, { fallback: t('table.na') })}
              </DirectoryTextCell>
            ),
          },
          {
            key: "actions",
            header: tCommon('table.actions'),
            align: "right",
            cell: (row) =>
              row.kind === "invite" ? (
                <DirectoryInviteAwaitingActions
                  awaitingLabel={t('table.awaiting')}
                  revokeLabel={t('buttons.revoke')}
                  onRevoke={() => setDeletingInvite(row.invite)}
                />
              ) : (
                <RowActions>
                  {/* These carried no label at all, so they read as "button,
                      button, button" to a screen reader. */}
                  <Link
                    href={`/admin/users/${row.user._id}`}
                    aria-label={t('table.openProfile')}
                    className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Link>
                  <RowIconButton onClick={() => handleOpenEdit(row.user)} label={tCommon('actions.edit')}>
                    <Edit2 className="w-4 h-4" />
                  </RowIconButton>
                  <RowIconButton onClick={() => setDeletingUser(row.user)} tone="danger" label={t('buttons.delete')}>
                    <Trash2 className="w-4 h-4" />
                  </RowIconButton>
                </RowActions>
              ),
          },
        ]}
      />

      {/* Add/Edit Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => !isSubmitting && setIsAddModalOpen(false)}
        title={editingUser ? t('modal.editTitle') : t('modal.inviteTitle')}
      >
        <p className="text-secondary mb-6 text-[15px]">{editingUser ? t('modal.editDesc') : t('modal.inviteDesc')}</p>
        {submitError && <p className="text-red-500 text-[13px] font-medium mb-4">{submitError}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <ModalField
            label={t('modal.fullName')}
            type="text"
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('modal.namePlaceholder')}
          />

          <ModalField
            label={t('modal.email')}
            type="email"
            required
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            placeholder={t('modal.emailPlaceholder')}
          />

          <ModalFormField label={t('modal.role')} htmlFor="user-role">
            <select
              id="user-role"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm appearance-none"
            >
              {ASSIGNABLE_ROLES
                .filter(role => role !== "SUPER_ADMIN" || isSuperAdmin)
                .map(role => (
                  <option key={role} value={role}>{t(`roles.${ROLE_LABEL_KEYS[role]}`)}</option>
                ))}
            </select>
            <p className="text-[13px] text-secondary">
              {t(`roles.${ROLE_DESCRIPTION_KEYS[formData.role]}`)}
            </p>
          </ModalFormField>

          {isSuperAdmin && (
            <ModalFormField label={t('modal.workspace')} htmlFor="user-workspace">
              <select
                id="user-workspace"
                value={formData.companyId}
                onChange={e => setFormData({ ...formData, companyId: e.target.value })}
                className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm appearance-none"
              >
                <option value="">{t('table.systemLevel')}</option>
                {companyOptions.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </ModalFormField>
          )}

          <ModalField
            label={t('modal.avatar')}
            type="url"
            value={formData.image}
            onChange={e => setFormData({ ...formData, image: e.target.value })}
            placeholder={t('modal.avatarPlaceholder')}
          >
            <p className="text-[11px] text-muted">{t('modal.avatarHint')}</p>
          </ModalField>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isSubmitting}
              className="rounded-[10px] text-sm hover:bg-foreground/5"
            >
              {t('buttons.cancel')}
            </Button>
            <WriteButton
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? tCommon('saving') : editingUser ? t('buttons.updateUser') : t('buttons.sendInvite')}
            </WriteButton>
          </div>
        </form>
      </SonaeModal>

      <ConfirmationModal
        isOpen={!!deletingUser}
        onClose={() => {
          setDeletingUser(null);
          setSubmitError("");
        }}
        title={t('modal.deleteTitle')}
        cancelLabel={t('buttons.cancel')}
        confirmLabel={isSubmitting ? tCommon('deleting') : t('buttons.delete')}
        isSubmitting={isSubmitting}
        onConfirm={confirmDelete}
        error={submitError}
      >
        <p>
          {t('modal.deleteConfirm', { name: deletingUser?.name ?? "" })}
        </p>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={!!deletingInvite}
        onClose={() => {
          setDeletingInvite(null);
          setSubmitError("");
        }}
        title={t('modal.revokeTitle')}
        cancelLabel={t('buttons.cancel')}
        confirmLabel={isSubmitting ? tCommon('deleting') : t('buttons.revoke')}
        isSubmitting={isSubmitting}
        onConfirm={confirmRevoke}
        error={submitError}
      >
        <p>
          {t('modal.revokeConfirm', { email: deletingInvite?.email ?? "" })}
        </p>
      </ConfirmationModal>
    </div>
  );
}
