"use client";

import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import {
  Users,
  Plus,
  ShieldCheck,
  User,
  Trash2,
  Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import {
  PaginationFooter,
  RowActions,
  RowIconButton,
  SearchBar,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { useTranslations } from "next-intl";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatDate } from "@/src/lib/dates";
import { ModalField, ModalFormField } from "@/src/ui/components/screens/ModalForm";
import { usePagedRows } from "@/src/hooks/usePagedRows";

type TeamUserRole = "USER" | "ADMIN";

type TeamUserFormData = {
  name: string;
  email: string;
  role: TeamUserRole;
  image: string;
  companyId: string;
};

export default function CompanyTeamPage() {
  const currentUser = useQuery(api.users.getMe);
  const t = useTranslations('admin.users');
  const tCommon = useTranslations('common');

  const [searchTerm, setSearchTerm] = useState("");
  
  // Pending invites are also scoped by backend theoretically, but for now we filter locally to be safe 
  // if not handled. Actually `getPendingInvites` might not be scoped natively yet, but we will assume it is or adapt.
  const pendingInvites = useQuery(api.invites.getPendingInvites) || [];

  const { results: filteredUsers, status, loadMore } = usePaginatedQuery(
    api.users.getPaginatedUsers,
    { searchTerm },
    { initialNumItems: 15 }
  );

  const deleteUser = useMutation(api.users.deleteUser);
  const revokeInvite = useMutation(api.invites.revokeInvite);
  const addUser = useMutation(api.users.addUser);
  const updateUser = useMutation(api.users.updateUser);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Doc<"users"> | null>(null);
  const [deletingUser, setDeletingUser] = useState<Doc<"users"> | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<Doc<"invitations"> | null>(null);

  const [formData, setFormData] = useState<TeamUserFormData>({ name: "", email: "", role: "USER", image: "", companyId: "" });

  const teamRows = [
    // The company check is not optional: getPendingInvites is a platform query,
    // so without it this screen would list other companies' invitations.
    ...pendingInvites
      .filter((inv) =>
        (inv.email || "").toLowerCase().includes(searchTerm.toLowerCase()) &&
        inv.companyId === currentUser?.companyId
      )
      .map((invite) => ({ kind: "invite" as const, invite })),
    ...filteredUsers.map((user) => ({ kind: "user" as const, user })),
  ];

  const paged = usePagedRows(teamRows, {
    canLoadMore: status === "CanLoadMore",
    loadMore,
    resetKey: searchTerm,
  });

  const pageInvites = paged.pageRows.flatMap((row) => (row.kind === "invite" ? [row.invite] : []));
  const pageUsers = paged.pageRows.flatMap((row) => (row.kind === "user" ? [row.user] : []));


  const handleOpenAdd = () => {
    setFormData({ name: "", email: "", role: "USER", image: "", companyId: currentUser?.companyId || "" });
    setEditingUser(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user: Doc<"users">) => {
    setFormData({
      name: user.name ?? "",
      email: user.email ?? "",
      role: user.role === "ADMIN" ? "ADMIN" : "USER",
      image: user.image || "",
      companyId: user.companyId || currentUser?.companyId || "",
    });
    setEditingUser(user);
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      companyId: currentUser?.companyId
    };
    if (editingUser) {
      await updateUser({ id: editingUser._id, ...payload });
    } else {
      await addUser(payload);
    }
    setIsAddModalOpen(false);
  };

  const confirmDelete = async () => {
    if (deletingUser) {
      await deleteUser({ id: deletingUser._id });
      setDeletingUser(null);
    }
  };

  const confirmRevoke = async () => {
    if (deletingInvite) {
      await revokeInvite({ id: deletingInvite._id });
      setDeletingInvite(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* The words stay exactly as they were. `admin.users.title` reads
          "Access & Identity Control", which is the platform screen's wording
          and not this one's — swapping it in here would change the page while
          claiming to move it onto the kit. These two strings are hardcoded and
          so untranslated; that is recorded with the other copy findings. */}
      <PageHeader
        icon={<Users className="w-6 h-6 text-brand" />}
        title="Manage Team"
        description="Add, remove, or modify roles for users in your organization."
        action={
          <PagePrimaryAction onClick={handleOpenAdd} icon={<Plus className="w-4 h-4" />}>
            {t('invite')}
          </PagePrimaryAction>
        }
      />

      <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t('searchPlaceholder')} />

      <TableShell
        minWidthClassName="min-w-[720px]"
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
                <TableHeaderCell>{tCommon('table.role')}</TableHeaderCell>
                <TableHeaderCell>{t('table.joined')}</TableHeaderCell>
                <TableHeaderCell align="right">{tCommon('table.actions')}</TableHeaderCell>
              </TableHeaderRow>
            </thead>
            <tbody>
              <AnimatePresence>
                {/* Waiting and finding nothing are different answers. This went
                    straight to the empty panel while the first page was still
                    loading, so an ordinary page load flashed "no one here". */}
                {status === "LoadingFirstPage" ? (
                  <TableLoadingRow colSpan={4} />
                ) : paged.pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-0 border-none">
                      <SonaeEmptyState
                        title="No one found"
                        description={searchTerm.length > 0 ? "Nobody on the team matches that search." : t('table.noMatches')}
                      />
                    </td>
                  </tr>
                ) : (
                  <>
                    {pageInvites.map((inv) => (
                      <motion.tr
                        key={`inv_${inv._id}`}
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
                        <td className="px-4 py-3 text-[12px] text-secondary">
                          {formatDate(inv.invitedAt, { fallback: t('table.na') })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <RowActions>
                            <span className="text-[11px] font-mono text-brand/50 uppercase tracking-widest mr-2">{t('table.awaiting')}</span>
                            <RowIconButton
                              onClick={() => setDeletingInvite(inv)}
                              tone="danger"
                              label={t('buttons.revoke')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </RowIconButton>
                          </RowActions>
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
                        <td className="px-4 py-3">
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
                              <span className="font-medium text-[13px] text-foreground block leading-tight">
                                {user.name}
                              </span>
                              <span className="text-[12px] text-secondary">{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                            {user.role === 'ADMIN' ? <ShieldCheck className="w-3 h-3 text-brand" /> : <User className="w-3 h-3 text-foreground/70" />}
                            <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                              {user.role === 'ADMIN' ? t('roles.admin') : t('roles.user')}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-secondary">
                          {formatDate(user.createdAt, { fallback: t('table.na') })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <RowActions>
                            {user._id !== currentUser?._id && (
                              <>
                                {/* These two carried no label at all, so they
                                    read as "button, button" to a screen reader
                                    and showed no tooltip. RowIconButton makes
                                    the label a required argument. */}
                                <RowIconButton
                                  onClick={() => handleOpenEdit(user)}
                                  label={tCommon('actions.edit')}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </RowIconButton>
                                <RowIconButton
                                  onClick={() => setDeletingUser(user)}
                                  tone="danger"
                                  label={t('buttons.delete')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </RowIconButton>
                              </>
                            )}
                          </RowActions>
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
        onClose={() => setIsAddModalOpen(false)}
        title={editingUser ? t('modal.editTitle') : t('modal.inviteTitle')}
      >
        <p className="text-secondary mb-6 text-[15px]">{editingUser ? t('modal.editDesc') : t('modal.inviteDesc')}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <ModalField
            label={t('modal.fullName')}
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('modal.namePlaceholder')}
          />

          <ModalField
            label={t('modal.email')}
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder={t('modal.emailPlaceholder')}
          />

          <ModalFormField label={t('modal.role')} htmlFor="team-member-role">
            <select
              id="team-member-role"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value as TeamUserRole })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm appearance-none"
            >
              <option value="USER">{t('roles.user')}</option>
              <option value="ADMIN">{t('roles.admin')}</option>
            </select>
          </ModalFormField>

          <ModalField
            label={t('modal.avatar')}
            type="url"
            value={formData.image}
            onChange={(e) => setFormData({ ...formData, image: e.target.value })}
            placeholder={t('modal.avatarPlaceholder')}
          >
            <p className="text-[11px] text-muted">{t('modal.avatarHint')}</p>
          </ModalField>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
            >
              {t('buttons.cancel')}
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm"
            >
              {editingUser ? t('buttons.updateUser') : t('buttons.sendInvite')}
            </button>
          </div>
        </form>
      </SonaeModal>

      {/* Delete Confirmation Modal */}
      <SonaeModal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        title={t('modal.deleteTitle')}
      >
        <p className="text-secondary mb-6 text-[15px] leading-relaxed">
          {t('modal.deleteConfirm', { name: deletingUser?.name ?? "" })}
        </p>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button
            type="button"
            onClick={() => setDeletingUser(null)}
            className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
          >
            {t('buttons.cancel')}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20"
          >
            {t('buttons.delete')}
          </button>
        </div>
      </SonaeModal>

      {/* Revoke Invitation Modal */}
      <SonaeModal
        isOpen={!!deletingInvite}
        onClose={() => setDeletingInvite(null)}
        title={t('modal.revokeTitle')}
      >
        <p className="text-secondary mb-6 text-[15px] leading-relaxed">
          {t('modal.revokeConfirm', { email: deletingInvite?.email ?? "" })}
        </p>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button
            type="button"
            onClick={() => setDeletingInvite(null)}
            className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
          >
            {t('buttons.cancel')}
          </button>
          <button
            type="button"
            onClick={confirmRevoke}
            className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20"
          >
            {t('buttons.revoke')}
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
