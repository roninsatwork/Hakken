"use client";

import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { 
  Users, 
  Plus, 
  Search, 
  MoreVertical,
  ShieldCheck,
  User,
  Trash2,
  Edit2,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";

export default function CompanyUsersPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;

  const currentUser = useQuery(api.users.getMe);
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const companies = useQuery(api.companies.getCompanies) || [];

  const getCompanyName = (id: string) => companies.find((c: any) => c._id === id)?.name || "System Level";

  const { results: paginatedUsers, status, loadMore } = usePaginatedQuery(
    api.users.getUsersByCompany,
    { companyId },
    { initialNumItems: 15 }
  );

  const pendingInvites = useQuery(api.invites.getInvitesByCompany, { companyId }) || [];
  const deleteUser = useMutation(api.users.deleteUser);
  const revokeInvite = useMutation(api.invites.revokeInvite);
  const addUser = useMutation(api.users.addUser);
  const updateUser = useMutation(api.users.updateUser);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [deletingUser, setDeletingUser] = useState<any | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<any | null>(null);

  const [formData, setFormData] = useState({ name: "", email: "", role: "USER", image: "", companyId: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const filteredUsers = paginatedUsers.filter((u: any) => 
    (u.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredInvites = pendingInvites.filter((inv: any) => 
    (inv.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearch = (v: string) => {
    setSearchTerm(v);
  };

  const handleOpenAdd = () => {
    setFormData({ name: "", email: "", role: "USER", image: "", companyId: "" });
    setEditingUser(null);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setFormData({ name: user.name, email: user.email, role: user.role || "USER", image: user.image || "", companyId: user.companyId || "" });
    setEditingUser(user);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const payload = {
      ...formData,
      companyId
    };
    try {
      if (editingUser) {
        await updateUser({ id: editingUser._id, ...payload });
      } else {
        await addUser(payload);
      }
      setIsAddModalOpen(false);
    } catch (err: any) {
      setSubmitError(err.message || "Operation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingUser) {
      setIsSubmitting(true);
      try {
        await deleteUser({ id: deletingUser._id });
        setDeletingUser(null);
      } catch (err: any) {
        setSubmitError(err.message || "Failed to delete user.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const confirmRevoke = async () => {
    if (deletingInvite) {
      setIsSubmitting(true);
      try {
        await revokeInvite({ id: deletingInvite._id });
        setDeletingInvite(null);
      } catch (err: any) {
        setSubmitError(err.message || "Failed to revoke invite.");
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
            Workspace Directory
          </h1>
          <p className="text-[13px] text-secondary mt-1">Manage users strictly assigned to this tenant isolation.</p>
        </div>
        
        <Link 
          href={`/admin/companies/${companyId}/invites`}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
        >
          <Plus className="w-4 h-4" />
          <span>Invite User</span>
        </Link>
      </div>

      {/* Control Bar */}
      <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
        <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
          <Search className="w-[18px] h-[18px]" />
          <input 
            type="text" 
            placeholder="Search users by name or email..." 
            value={searchTerm}
            onChange={e => handleSearch(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl overflow-hidden shadow-sm flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredUsers.length === 0 && filteredInvites.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                      No users or pending invitations found matching your search.
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredInvites.map((inv: any) => (
                        <motion.tr 
                          key={`inv-${inv._id}`}
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
                                  Pending Invitation
                                </span>
                                <span className="text-[12px] text-secondary">{inv.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 w-fit">
                              <span className="text-[10px] font-mono tracking-widest text-brand uppercase">
                                PENDING {inv.role}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[12px] text-secondary">
                            {inv.invitedAt ? new Date(inv.invitedAt).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                               <span className="text-[11px] font-mono text-brand/50 uppercase tracking-widest mr-2">Awaiting Login</span>
                               <button onClick={() => setDeletingInvite(inv)} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title="Revoke Invitation">
                                 <Trash2 className="w-4 h-4" />
                               </button>
                            </div>
                          </td>
                        </motion.tr>
                    ))}

                    {filteredUsers.map((item: any) => (
                        <motion.tr 
                          key={`user-${item._id}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          onClick={() => router.push(`/admin/users/${item._id}`)}
                          className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group cursor-pointer"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <img 
                                src={item.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${item.name}`} 
                                alt={item.name} 
                                className="w-8 h-8 rounded-full bg-card border border-border-dim"
                              />
                              <div>
                                <span className="font-medium text-[13px] text-foreground group-hover:text-brand transition-colors block leading-tight">
                                  {item.name}
                                </span>
                                <span className="text-[12px] text-secondary">{item.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                              {item.role === 'ADMIN' ? <ShieldCheck className="w-3 h-3 text-brand" /> : <User className="w-3 h-3 text-foreground/70" />}
                              <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                                {item.role || 'USER'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-[12px] text-secondary">
                            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); handleOpenEdit(item); }} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setDeletingUser(item); }} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors">
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
          </table>
        </div>

        {status === "CanLoadMore" && (
          <div className="p-4 border-t border-border-dim flex justify-center bg-sidebar/10">
            <button
              onClick={() => loadMore(15)}
              className="px-6 py-2 rounded-full text-xs font-medium bg-foreground/5 hover:bg-foreground/10 text-foreground transition-all flex items-center gap-2"
            >
              Load More Users
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingUser ? "Edit User" : "Invite User"}
      >
        <div className="flex flex-col gap-2 mb-6">
           <p className="text-secondary text-[15px]">{editingUser ? "Update this user's details and roles." : "Invite a new user to the platform."}</p>
           {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {editingUser ? (
            <div className="flex flex-col gap-3 p-4 rounded-[10px] bg-foreground/[0.02] border border-border-dim/50 mb-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-secondary uppercase tracking-widest">User</span>
                <span className="text-[14px] text-foreground font-medium">{editingUser.name}</span>
                <span className="text-[13px] text-secondary">{editingUser.email}</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-[13px] font-medium text-secondary tracking-wide">Full Name</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
                  placeholder="e.g. Aman"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[13px] font-medium text-secondary tracking-wide">Email Address</label>
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
                  placeholder="aman@example.com"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary uppercase tracking-widest">System Role</label>
            <select 
              value={formData.role}
              onChange={e => setFormData({...formData, role: e.target.value})}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm appearance-none"
            >
              <option value="USER">User (Read-only)</option>
              <option value="ADMIN">Company Administrator</option>
            </select>
          </div>

          {!editingUser && (
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-secondary uppercase tracking-widest">Avatar URL (Optional)</label>
              <input 
                type="url" 
                value={formData.image}
                onChange={e => setFormData({...formData, image: e.target.value})}
                className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
                placeholder="https://example.com/avatar.jpg"
              />
              <p className="text-[11px] text-muted">Leave blank to auto-generate from name.</p>
            </div>
          )}

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <button 
              type="button" 
              onClick={() => setIsAddModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : (editingUser ? "Update User" : "Send Invite")}
            </button>
          </div>
        </form>
      </SonaeModal>

      {/* Delete Confirmation Modal */}
      <SonaeModal
        isOpen={!!deletingUser}
        onClose={() => { setDeletingUser(null); setSubmitError(""); }}
        title="Delete User"
      >
        <div className="flex flex-col gap-2 mb-6">
           <p className="text-secondary text-[15px] leading-relaxed">
             Are you sure you want to delete <strong className="text-foreground font-semibold">{deletingUser?.name}</strong>? This action cannot be undone.
           </p>
           {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button 
            type="button" 
            onClick={() => setDeletingUser(null)}
            className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={confirmDelete}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20 disabled:opacity-50"
          >
            {isSubmitting ? "Deleting..." : "Delete User"}
          </button>
        </div>
      </SonaeModal>

      {/* Revoke Invitation Modal */}
      <SonaeModal
        isOpen={!!deletingInvite}
        onClose={() => { setDeletingInvite(null); setSubmitError(""); }}
        title="Revoke Access"
      >
        <div className="flex flex-col gap-2 mb-6">
           <p className="text-secondary text-[15px] leading-relaxed">
             Are you sure you want to revoke the active invitation for <strong className="text-foreground font-semibold">{deletingInvite?.email}</strong>? This will permanently disable their sign-on link and delete their invitation record.
           </p>
           {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button 
            type="button" 
            onClick={() => setDeletingInvite(null)}
            className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={confirmRevoke}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20 disabled:opacity-50"
          >
            {isSubmitting ? "Revoking..." : "Revoke Access"}
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
