"use client";

import { useQuery, useMutation } from "convex/react";
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
  Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";

export default function ManageUsersPage() {
  const users = useQuery(api.users.getAllUsers) || [];
  const deleteUser = useMutation(api.users.deleteUser);
  const addUser = useMutation(api.users.addUser);
  const updateUser = useMutation(api.users.updateUser);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [deletingUser, setDeletingUser] = useState<any | null>(null);

  const [formData, setFormData] = useState({ name: "", email: "", role: "USER", image: "" });

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setFormData({ name: "", email: "", role: "USER", image: "" });
    setEditingUser(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setFormData({ name: user.name, email: user.email, role: user.role || "USER", image: user.image || "" });
    setEditingUser(user);
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      await updateUser({ id: editingUser._id, ...formData });
    } else {
      await addUser(formData);
    }
    setIsAddModalOpen(false);
  };

  const confirmDelete = async () => {
    if (deletingUser) {
      await deleteUser({ id: deletingUser._id });
      setDeletingUser(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Users className="w-8 h-8 text-brand" />
            User Management
          </h1>
          <p className="text-secondary mt-1">Manage system administrators, editors, and read-only users.</p>
        </div>
        
        <button 
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-[14px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
        >
          <Plus className="w-4 h-4" />
          <span>Invite User</span>
        </button>
      </div>

      {/* Control Bar */}
      <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
        <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
          <Search className="w-[18px] h-[18px]" />
          <input 
            type="text" 
            placeholder="Search users by name or email..." 
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
              <tr className="border-b border-border-dim text-[12px] uppercase tracking-[0.1em] text-muted">
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Joined</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                      No users found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <motion.tr 
                      key={user._id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <img 
                            src={user.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${user.name}`} 
                            alt={user.name} 
                            className="w-10 h-10 rounded-full bg-card border border-border-dim"
                          />
                          <div>
                            <Link href={`/admin/users/${user._id}`} className="font-medium text-foreground hover:text-brand transition-colors block leading-tight">
                              {user.name}
                            </Link>
                            <span className="text-[13px] text-secondary">{user.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/5 border border-border-dim w-fit">
                          {user.role === 'ADMIN' ? <ShieldCheck className="w-3.5 h-3.5 text-brand" /> : <User className="w-3.5 h-3.5 text-foreground/70" />}
                          <span className="text-[11px] font-mono tracking-widest text-foreground/80 uppercase">
                            {user.role || 'USER'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[13px] text-secondary">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
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
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingUser ? "Edit User Profile" : "Invite System User"}
      >
        <p className="text-secondary mb-2 -mt-4 text-[13px]">{editingUser ? "Modify access protocols and details." : "Invite a new identity into the Sonae protocol."}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-secondary uppercase tracking-widest">Full Identity</label>
            <input 
              type="text" 
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="px-4 py-2.5 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all"
              placeholder="e.g. Aman"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-secondary uppercase tracking-widest">Communications (Email)</label>
            <input 
              type="email" 
              required
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="px-4 py-2.5 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all"
              placeholder="aman@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-secondary uppercase tracking-widest">Protocol Level (Role)</label>
            <select
              value={formData.role}
              onChange={e => setFormData({...formData, role: e.target.value})}
              className="px-4 py-2.5 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="USER">Standard User (USER)</option>
              <option value="ADMIN">System Administrator (ADMIN)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-secondary uppercase tracking-widest">Avatar URL (Optional)</label>
            <input 
              type="url" 
              value={formData.image}
              onChange={e => setFormData({...formData, image: e.target.value})}
              className="px-4 py-2.5 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all"
              placeholder="https://example.com/avatar.jpg"
            />
            <p className="text-[11px] text-muted">Leave blank to auto-generate from name.</p>
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border-dim">
            <button 
              type="button" 
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-[13px] font-medium"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-4 py-2 rounded-[10px] bg-brand text-white hover:bg-brand/90 transition-all text-[13px] font-medium shadow-lg shadow-brand/20"
            >
              {editingUser ? "Save Modifications" : "Send Invitation"}
            </button>
          </div>
        </form>
      </SonaeModal>

      {/* Delete Confirmation Modal */}
      <SonaeModal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        title="Eradicate Identity"
      >
        <p className="text-secondary mb-2 -mt-4 text-[13px]">Are you absolutely sure you want to permanently delete <strong className="text-foreground font-medium">{deletingUser?.name}</strong>? This action cannot be reversed.</p>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-dim">
          <button 
            type="button" 
            onClick={() => setDeletingUser(null)}
            className="px-4 py-2 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-[13px] font-medium"
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={confirmDelete}
            className="px-4 py-2 rounded-[10px] bg-red-500 text-white hover:bg-red-600 transition-all text-[13px] font-medium shadow-lg shadow-red-500/20"
          >
            Confirm Deletion
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
