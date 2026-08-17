"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import Image from "next/image";
import type { FormEvent } from "react";
import {
  Users,
  Plus,
  MoreVertical,
  ShieldCheck,
  User,
  Trash2,
  Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalField, ModalFormField } from "@/src/ui/components/screens/ModalForm";
import { TableShell, TableHeaderRow, TableHeaderCell, PaginationFooter, SearchBar } from "@/src/ui/components/screens/Table";
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

  const pageInvites = paged.pageRows.flatMap((row) => (row.kind === "invite" ? [row.invite] : []));
  const pageUsers = paged.pageRows.flatMap((row) => (row.kind === "user" ? [row.user] : []));

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

      <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t('searchPlaceholder')} />

      {/* Users Table */}
      <TableShell
        footer={
          <PaginationFooter
            page={paged.page}
            totalPages={paged.totalPages}
            totalCount={paged.loadedCount}
            pageSize={paged.pageSize}
            isLoading={status === "LoadingMore"}
            onPageChange={paged.goToPage}
            labels={{ empty: t('table.noMatches') }}
          />
        }
      >
            <thead>
              <TableHeaderRow>
                <TableHeaderCell>{tCommon('table.user')}</TableHeaderCell>
                {isSuperAdmin && <TableHeaderCell>{t('table.workspace')}</TableHeaderCell>}
                <TableHeaderCell>{tCommon('table.role')}</TableHeaderCell>
                <TableHeaderCell>{t('table.joined')}</TableHeaderCell>
                <TableHeaderCell align="right">{tCommon('table.actions')}</TableHeaderCell>
              </TableHeaderRow>
            </thead>
            <tbody>
              <AnimatePresence>
                {paged.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 5 : 4} className="p-0 border-none">
                      <SonaeEmptyState 
                        title="Nessun Risultato" 
                        description={searchTerm.length > 0 ? "La query di ricerca non ha prodotto corrispondenze nel repository attivo." : t('table.noMatches')} 
                      />
                    </td>
                  </tr>
                ) : (
                  <>
                    {pageInvites.map((inv) => (
                      <motion.tr
                        key={inv._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="border-b border-border-dim/50 bg-brand/[0.03] hover:bg-brand/[0.05] transition-colors group opacity-80"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-black border border-brand/20 border-dashed flex items-center justify-center">
                              <span className="text-[9px] font-mono text-brand/50 uppercase tracking-widest">PND</span>
                            </div>
                            <div>
                              <span className="font-medium text-[13px] text-foreground/70 block leading-tight">
                                {t('table.pending')}
                              </span>
                              <span className="text-[12px] text-secondary">{inv.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 w-fit">
                            <span className="text-[10px] font-mono tracking-widest text-brand uppercase">
                              {t('table.pending')} {inv.role}
                            </span>
                          </div>
                        </td>
                        {isSuperAdmin && (
                          <td className="px-4 py-3">
                            <span className="text-[12px] text-secondary">{inv.companyId ? getCompanyName(inv.companyId) : t('table.systemLevel')}</span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-[12px] text-secondary">
                          {formatDate(inv.invitedAt, { fallback: t('table.na') })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[11px] font-mono text-brand/50 uppercase tracking-widest mr-2">{t('table.awaiting')}</span>
                            <button onClick={() => setDeletingInvite(inv)} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title={t('buttons.revoke')}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}

                    {pageUsers.map((user) => (
                      <motion.tr
                        key={user._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group"
                      >
                        <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                            <Image
                              src={user.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${user.name ?? user.email ?? user._id}`}
                              alt={user.name ?? user.email ?? tCommon('table.user')}
                              width={32}
                              height={32}
                              unoptimized
                              className="w-8 h-8 rounded-full bg-card border border-border-dim"
                            />
                            <div>
                              <Link href={`/admin/users/${user._id}`} className="font-medium text-[13px] text-foreground hover:text-brand transition-colors block leading-tight">
                                {user.name}
                              </Link>
                              <span className="text-[12px] text-secondary">{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                            {user.role === 'ADMIN' ? <ShieldCheck className="w-3 h-3 text-brand" /> : <User className="w-3 h-3 text-foreground/70" />}
                            <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                              {user.role === 'SUPER_ADMIN' ? t('roles.superAdmin') : user.role === 'ADMIN' ? t('roles.admin') : t('roles.user')}
                            </span>
                          </div>
                        </td>
                        {isSuperAdmin && (
                          <td className="px-4 py-2.5">
                            <span className="text-[12px] text-secondary">{user.companyId ? user.companyName ?? getCompanyName(user.companyId) : t('table.sonaeGlobal')}</span>
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-[12px] text-secondary">
                          {formatDate(user.createdAt, { fallback: t('table.na') })}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link href={`/admin/users/${user._id}`} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors">
                              <MoreVertical className="w-4 h-4" />
                            </Link>
                            <button onClick={() => handleOpenEdit(user)} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeletingUser(user)} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </>
                )}
              </AnimatePresence>
            </tbody>
      </TableShell>

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
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
            >
              {t('buttons.cancel')}
            </button>
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
