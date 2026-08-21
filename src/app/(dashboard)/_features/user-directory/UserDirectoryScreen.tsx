"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Users } from "lucide-react";
import {
  DirectoryInviteAwaitingActions,
  DirectoryInviteIdentityCell,
  DirectoryInviteRolePill,
  DirectoryTextCell,
  DirectoryUserIdentityCell,
  DirectoryUserRolePill,
} from "./DirectoryTableCells";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/atoms/Button";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalField } from "@/src/ui/components/screens/ModalForm";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDate } from "@/src/lib/dates";
import type { UserRole } from "@/src/lib/userRoles";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

/**
 * The people directory whole, shared the same way its cells already were:
 * one table listing people and the invitations that are not people yet, the
 * search box that filters both, the shared page count, and the add/edit,
 * delete and revoke modals.
 *
 * Two screens draw it — the platform's user screen (`admin/users`) and a
 * company's own team screen (`app/settings/team`) — and everything one of
 * them decides alone arrives as a prop or a slot:
 *
 * - every word comes through `t`/`tCommon`, so each page keeps its own
 *   translation namespaces, exactly as the cells do;
 * - the header is a slot, because each page owns its title and its invite
 *   control (a link to the invite desk on one; a button opening the add
 *   modal on the other — `openAdd` is handed to the slot for that);
 * - which columns exist beyond the shared four is the page's call
 *   (`extraColumns`, after Role — the platform adds Workspace);
 * - a row's action buttons are a slot, because the pages disagree about
 *   them (a profile link on one; your own row bare on the other) and
 *   because a page's raw buttons must stay inside that page's screen-kit
 *   budget, as `InviteDispatchScreen` established;
 * - the modal's role control is a slot for the same reason the invite
 *   desk's is: each page owns the one control that says what a person will
 *   be, and the workspace picker rides along in it;
 * - what a saved form means (`submitPayload`) and what an opened person
 *   puts back into it (`editFormData`) stay with the page, which is where
 *   the scope rules live.
 */

export type DirectoryUser = Doc<"users"> & { companyName?: string | null };

export type UserDirectoryFormData = {
  name: string;
  email: string;
  role: UserRole;
  image: string;
  companyId: string;
};

export type UserDirectoryRow =
  | { kind: "invite"; invite: Doc<"invitations"> }
  | { kind: "user"; user: DirectoryUser };

/** A page's translator, passed in so the screen owns no namespace of its own. */
type Translator = (key: string, values?: Record<string, string | number>) => string;

const EMPTY_FORM: UserDirectoryFormData = { name: "", email: "", role: "USER", image: "", companyId: "" };

export function UserDirectoryScreen({
  t,
  tCommon,
  header,
  emptySearchMessage,
  scope,
  filterInvite,
  minWidthClassName,
  extraColumns = [],
  userHref,
  userRoleLabel,
  userActions,
  roleFields,
  editFormData,
  submitPayload,
}: {
  t: Translator;
  tCommon: Translator;
  /** The page's own title and invite control. `openAdd` opens the blank add/edit modal. */
  header: (directory: { openAdd: () => void }) => ReactNode;
  /** What the empty state says when it is the search that emptied the table. */
  emptySearchMessage: string;
  /** `"platform"` on the admin screen, which ignores impersonation. See convex/users.ts. */
  scope?: "platform";
  /** A page's own narrowing of the invitation list, on top of the email search. */
  filterInvite?: (invite: Doc<"invitations">) => boolean;
  minWidthClassName?: string;
  /** The page's own columns, drawn between Role and Joined. */
  extraColumns?: DataTableColumn<UserDirectoryRow>[];
  /** Where a person's name links, on a page with a profile to open. */
  userHref?: (user: DirectoryUser) => string;
  /** The word in a person's role pill. */
  userRoleLabel: (user: DirectoryUser) => string;
  /** A person's row buttons; `edit` and `remove` open the shared modals. */
  userActions: (user: DirectoryUser, controls: { edit: () => void; remove: () => void }) => ReactNode;
  /** The modal's role control (and whatever targeting rides with it). */
  roleFields: (form: {
    data: UserDirectoryFormData;
    update: (patch: Partial<UserDirectoryFormData>) => void;
  }) => ReactNode;
  /** What an opened person puts back into the form. */
  editFormData: (user: DirectoryUser) => UserDirectoryFormData;
  /** What a saved form sends — companyId resolution is the page's scope rule. */
  submitPayload: (
    data: UserDirectoryFormData
  ) => Omit<UserDirectoryFormData, "companyId"> & { companyId?: Id<"companies"> };
}) {
  const { platformName } = useSystemSettings();
  const [searchTerm, setSearchTerm] = useState("");

  const pendingInvites = useQuery(api.invites.getPendingInvites) || [];

  const { results: filteredUsers, status, loadMore } = usePaginatedQuery(
    api.users.getPaginatedUsers,
    scope ? { searchTerm, scope } : { searchTerm },
    { initialNumItems: TABLE_PAGE_SIZE }
  );

  const deleteUser = useMutation(api.users.deleteUser);
  const revokeInvite = useMutation(api.invites.revokeInvite);
  const addUser = useMutation(api.users.addUser);
  const updateUser = useMutation(api.users.updateUser);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<DirectoryUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<DirectoryUser | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<Doc<"invitations"> | null>(null);

  const [formData, setFormData] = useState<UserDirectoryFormData>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const filteredInvites = pendingInvites.filter(
    (inv) =>
      (inv.email || "").toLowerCase().includes(searchTerm.toLowerCase()) &&
      (filterInvite?.(inv) ?? true)
  );

  // Invitations and people share one table, so they share one page count.
  // Paged together, then split again for rendering — the footer must report the
  // table, not one half of it.
  const directoryRows: UserDirectoryRow[] = [
    ...filteredInvites.map((invite) => ({ kind: "invite" as const, invite })),
    ...filteredUsers.map((user) => ({ kind: "user" as const, user })),
  ];

  const paged = usePagedRows(directoryRows, {
    canLoadMore: status === "CanLoadMore",
    loadMore,
    resetKey: searchTerm,
  });

  const updateForm = (patch: Partial<UserDirectoryFormData>) =>
    setFormData((previous) => ({ ...previous, ...patch }));

  const handleOpenAdd = () => {
    setFormData(EMPTY_FORM);
    setEditingUser(null);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user: DirectoryUser) => {
    setFormData(editFormData(user));
    setEditingUser(user);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError("");
    const payload = submitPayload(formData);
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
      {/* Header Section — the page's own words and invite control. */}
      {header({ openAdd: handleOpenAdd })}

      {/* Users Table */}
      <DataTable
        rows={status === "LoadingFirstPage" ? undefined : paged.pageRows}
        search={{ value: searchTerm, onChange: setSearchTerm, placeholder: t('searchPlaceholder') }}
        rowKey={(row) => (row.kind === "invite" ? `inv_${row.invite._id}` : row.user._id)}
        minWidthClassName={minWidthClassName}
        /* A pending invitation is not a person yet. */
        rowClassName={(row) => (row.kind === "invite" ? "bg-brand/[0.03] hover:bg-brand/[0.05] opacity-80" : "")}
        empty={{
          icon: <Users className="w-8 h-8 text-muted/30" />,
          label: t('table.noOneFound'),
          action: (
            <p className="text-[13px] text-secondary">
              {searchTerm.length > 0 ? emptySearchMessage : t('table.noMatches')}
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
                  href={userHref?.(row.user)}
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
                  label={userRoleLabel(row.user)}
                />
              ),
          },
          ...extraColumns,
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
                userActions(row.user, {
                  edit: () => handleOpenEdit(row.user),
                  remove: () => setDeletingUser(row.user),
                })
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
        <p className="text-secondary mb-6 text-[15px]">{editingUser ? t('modal.editDesc') : t('modal.inviteDesc', { platformName })}</p>
        {submitError && <p className="text-red-500 text-[13px] font-medium mb-4">{submitError}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <ModalField
            label={t('modal.fullName')}
            type="text"
            required
            value={formData.name}
            onChange={e => updateForm({ name: e.target.value })}
            placeholder={t('modal.namePlaceholder')}
          />

          <ModalField
            label={t('modal.email')}
            type="email"
            required
            value={formData.email}
            onChange={e => updateForm({ email: e.target.value })}
            placeholder={t('modal.emailPlaceholder')}
          />

          {roleFields({ data: formData, update: updateForm })}

          <ModalField
            label={t('modal.avatar')}
            type="url"
            value={formData.image}
            onChange={e => updateForm({ image: e.target.value })}
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
