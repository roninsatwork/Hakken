"use client";

import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import {
  Users,
  Plus,
  Search,
  ShieldCheck,
  User,
  Trash2,
  Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { useTranslations } from "next-intl";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatDate } from "@/src/lib/dates";

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

  const filteredInvites = pendingInvites.filter((inv) =>
    (inv.email || "").toLowerCase().includes(searchTerm.toLowerCase()) && inv.companyId === currentUser?.companyId
  );

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
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Users className="w-6 h-6 text-brand" />
            Manage Team
          </h1>
          <p className="text-[13px] text-secondary mt-1">Add, remove, or modify roles for users in your organization.</p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
        >
          <Plus className="w-4 h-4" />
          <span>{t('invite')}</span>
        </button>
      </div>

      {/* Control Bar */}
      <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
        <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
          <Search className="w-[18px] h-[18px]" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">{tCommon('table.user')}</th>
                <th className="px-4 py-3 font-medium">{tCommon('table.role')}</th>
                <th className="px-4 py-3 font-medium">{t('table.joined')}</th>
                <th className="px-4 py-3 font-medium text-right">{tCommon('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredUsers.length === 0 && filteredInvites.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-0 border-none">
                      <SonaeEmptyState 
                        title="Nessun Risultato" 
                        description={searchTerm.length > 0 ? "La query di ricerca non ha prodotto corrispondenze nel team." : t('table.noMatches')} 
                      />
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredInvites.map((inv) => (
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
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[11px] font-mono text-brand/50 uppercase tracking-widest mr-2">{t('table.awaiting')}</span>
                            <button onClick={() => setDeletingInvite(inv)} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title={t('buttons.revoke')}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}

                    {filteredUsers.map((user) => (
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
                              <span className="font-medium text-[13px] text-foreground block leading-tight">
                                {user.name}
                              </span>
                              <span className="text-[12px] text-secondary">{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                            {user.role === 'ADMIN' ? <ShieldCheck className="w-3 h-3 text-brand" /> : <User className="w-3 h-3 text-foreground/70" />}
                            <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                              {user.role === 'ADMIN' ? t('roles.admin') : t('roles.user')}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-secondary">
                          {formatDate(user.createdAt, { fallback: t('table.na') })}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {user._id !== currentUser?._id && (
                              <>
                                <button onClick={() => handleOpenEdit(user)} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setDeletingUser(user)} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        
        {status === "CanLoadMore" && (
          <div className="p-4 border-t border-border-dim flex justify-center bg-sidebar/10">
            <button
              onClick={() => loadMore(15)}
              className="px-6 py-2 rounded-full text-xs font-medium bg-foreground/5 hover:bg-foreground/10 text-foreground transition-all flex items-center gap-2"
            >
              Load More Identities
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingUser ? t('modal.editTitle') : t('modal.inviteTitle')}
      >
        <p className="text-secondary mb-6 text-[15px]">{editingUser ? t('modal.editDesc') : t('modal.inviteDesc')}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary tracking-wide">{t('modal.fullName')}</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder={t('modal.namePlaceholder')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary tracking-wide">{t('modal.email')}</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder={t('modal.emailPlaceholder')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary uppercase tracking-widest">{t('modal.role')}</label>
            <select
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value as TeamUserRole })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm appearance-none"
            >
              <option value="USER">{t('roles.user')}</option>
              <option value="ADMIN">{t('roles.admin')}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary uppercase tracking-widest">{t('modal.avatar')}</label>
            <input
              type="url"
              value={formData.image}
              onChange={e => setFormData({ ...formData, image: e.target.value })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder={t('modal.avatarPlaceholder')}
            />
            <p className="text-[11px] text-muted">{t('modal.avatarHint')}</p>
          </div>

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
