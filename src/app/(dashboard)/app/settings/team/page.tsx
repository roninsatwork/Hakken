"use client";

import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  Users,
  Plus,
  ShieldCheck,
  User,
  Trash2,
  Edit2
} from "lucide-react";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { useTranslations } from "next-intl";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatDate } from "@/src/lib/dates";
import { ModalFormField } from "@/src/ui/components/screens/ModalForm";
import { usePagedRows } from "@/src/hooks/usePagedRows";

type TeamUserRole = "USER" | "ADMIN";

type TeamUserFormData = {
  name: string;
  email: string;
  role: TeamUserRole;
  image: string;
  companyId: string;
};

const loadTeamDialogs = () => import("./TeamDialogs");
const TeamDialogs = dynamic(() => loadTeamDialogs().then((module) => module.TeamDialogs));

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
  const [hasOpenedDialogs, setHasOpenedDialogs] = useState(false);

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

  const handleOpenAdd = () => {
    void loadTeamDialogs();
    setHasOpenedDialogs(true);
    setFormData({ name: "", email: "", role: "USER", image: "", companyId: currentUser?.companyId || "" });
    setEditingUser(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user: Doc<"users">) => {
    void loadTeamDialogs();
    setHasOpenedDialogs(true);
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

  const handleOpenDelete = (user: Doc<"users">) => {
    void loadTeamDialogs();
    setHasOpenedDialogs(true);
    setDeletingUser(user);
  };

  const handleOpenRevoke = (invite: Doc<"invitations">) => {
    void loadTeamDialogs();
    setHasOpenedDialogs(true);
    setDeletingInvite(invite);
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
      <PageHeader
        icon={<Users className="w-6 h-6 text-brand" />}
        title={t('team.title')}
        description={t('team.description')}
        action={
          <PagePrimaryAction onClick={handleOpenAdd} icon={<Plus className="w-4 h-4" />}>
            {t('invite')}
          </PagePrimaryAction>
        }
      />

      <DataTable
        rows={status === "LoadingFirstPage" ? undefined : paged.pageRows}
        search={{ value: searchTerm, onChange: setSearchTerm, placeholder: t('searchPlaceholder') }}
        rowKey={(row) => (row.kind === "invite" ? `inv_${row.invite._id}` : row.user._id)}
        minWidthClassName="min-w-[720px]"
        /* A pending invitation is not a person yet, and the tint is what says
           so before the row's words do. */
        rowClassName={(row) => (row.kind === "invite" ? "bg-brand/[0.03] hover:bg-brand/[0.05] opacity-80" : "")}
        empty={{
          icon: <Users className="w-8 h-8 text-muted/30" />,
          label: t('team.emptyLabel'),
          action: (
            <p className="text-[13px] text-secondary">
              {searchTerm.length > 0 ? t('team.noMatches') : t('table.noMatches')}
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
        columns={[
          {
            key: "user",
            header: tCommon('table.user'),
            cell: (row) =>
              row.kind === "invite" ? (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-black border border-brand/20 border-dashed flex items-center justify-center">
                    <span className="text-[9px] font-mono text-brand/50 uppercase tracking-widest">PND</span>
                  </div>
                  <div>
                    <span className="font-medium text-[13px] text-foreground/70 block leading-tight">
                      {t('table.pending')}
                    </span>
                    <span className="text-[12px] text-secondary">{row.invite.email}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Image
                    src={row.user.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${row.user.name ?? row.user.email ?? row.user._id}`}
                    alt={row.user.name ?? row.user.email ?? tCommon('table.user')}
                    width={32}
                    height={32}
                    unoptimized
                    className="w-8 h-8 rounded-full bg-card border border-border-dim"
                  />
                  <div>
                    <span className="font-medium text-[13px] text-foreground block leading-tight">
                      {row.user.name}
                    </span>
                    <span className="text-[12px] text-secondary">{row.user.email}</span>
                  </div>
                </div>
              ),
          },
          {
            key: "role",
            header: tCommon('table.role'),
            cell: (row) =>
              row.kind === "invite" ? (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 w-fit">
                  <span className="text-[10px] font-mono tracking-widest text-brand uppercase">
                    {t('table.pending')} {row.invite.role}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                  {row.user.role === 'ADMIN' ? <ShieldCheck className="w-3 h-3 text-brand" /> : <User className="w-3 h-3 text-foreground/70" />}
                  <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                    {row.user.role === 'ADMIN' ? t('roles.admin') : t('roles.user')}
                  </span>
                </div>
              ),
          },
          {
            key: "joined",
            header: t('table.joined'),
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.kind === "invite"
                  ? formatDate(row.invite.invitedAt, { fallback: t('table.na') })
                  : formatDate(row.user.createdAt, { fallback: t('table.na') })}
              </span>
            ),
          },
          {
            key: "actions",
            header: tCommon('table.actions'),
            align: "right",
            cell: (row) =>
              row.kind === "invite" ? (
                <RowActions>
                  <span className="text-[11px] font-mono text-brand/50 uppercase tracking-widest mr-2">
                    {t('table.awaiting')}
                  </span>
                  <RowIconButton onClick={() => handleOpenRevoke(row.invite)} tone="danger" label={t('buttons.revoke')}>
                    <Trash2 className="w-4 h-4" />
                  </RowIconButton>
                </RowActions>
              ) : (
                <RowActions>
                  {row.user._id !== currentUser?._id && (
                    <>
                      {/* These two carried no label at all, so they read as
                          "button, button" to a screen reader and showed no
                          tooltip. RowIconButton makes the label required. */}
                      <RowIconButton onClick={() => handleOpenEdit(row.user)} label={tCommon('actions.edit')}>
                        <Edit2 className="w-4 h-4" />
                      </RowIconButton>
                      <RowIconButton onClick={() => handleOpenDelete(row.user)} tone="danger" label={t('buttons.delete')}>
                        <Trash2 className="w-4 h-4" />
                      </RowIconButton>
                    </>
                  )}
                </RowActions>
              ),
          },
        ]}
      />

      {hasOpenedDialogs && (
        <TeamDialogs
          isAddModalOpen={isAddModalOpen}
          editingUser={editingUser}
          deletingUser={deletingUser}
          deletingInvite={deletingInvite}
          formData={formData}
          onFormDataChange={setFormData}
          onCloseEditor={() => setIsAddModalOpen(false)}
          onSubmit={handleSubmit}
          onCloseDelete={() => setDeletingUser(null)}
          onCloseRevoke={() => setDeletingInvite(null)}
          editorRoleField={
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
          }
          editorActions={
            <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium">
                {t('buttons.cancel')}
              </button>
              <button type="submit" className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm">
                {editingUser ? t('buttons.updateUser') : t('buttons.sendInvite')}
              </button>
            </div>
          }
          deleteActions={
            <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
              <button type="button" onClick={() => setDeletingUser(null)} className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium">
                {t('buttons.cancel')}
              </button>
              <button type="button" onClick={confirmDelete} className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20">
                {t('buttons.delete')}
              </button>
            </div>
          }
          revokeActions={
            <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
              <button type="button" onClick={() => setDeletingInvite(null)} className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium">
                {t('buttons.cancel')}
              </button>
              <button type="button" onClick={confirmRevoke} className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20">
                {t('buttons.revoke')}
              </button>
            </div>
          }
        />
      )}
    </div>
  );
}
