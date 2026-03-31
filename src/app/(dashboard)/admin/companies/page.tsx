"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { 
  Building2, 
  Plus, 
  Search, 
  Trash2,
  Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";

export default function CompaniesPage() {
  const router = useRouter();
  const companies = useQuery(api.companies.getCompanies) || [];
  const createCompany = useMutation(api.companies.createCompany);
  const updateCompany = useMutation(api.companies.updateCompany);
  const deleteCompany = useMutation(api.companies.deleteCompany);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<any | null>(null);

  const [formData, setFormData] = useState({ name: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredCompanies = companies.filter((c: any) => 
    (c.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setFormData({ name: "" });
    setEditingCompany(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (company: any) => {
    setFormData({ name: company.name });
    setEditingCompany(company);
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingCompany) {
        await updateCompany({ id: editingCompany._id, name: formData.name });
      } else {
        await createCompany({ name: formData.name });
      }
      setIsAddModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Failed to save company");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingCompany) {
      setIsSubmitting(true);
      try {
        await deleteCompany({ id: deletingCompany._id });
        setDeletingCompany(null);
      } catch (err: any) {
        alert(err.message || "Failed to delete company");
        setDeletingCompany(null); // Close anyway so they can see alert
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
            <Building2 className="w-6 h-6 text-brand" />
            Company Administration
          </h1>
          <p className="text-[13px] text-secondary mt-1">Super Admin Dashboard to manage SaaS tenant workspaces.</p>
        </div>
        
        <button 
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
        >
          <Plus className="w-4 h-4" />
          <span>New Company</span>
        </button>
      </div>

      {/* Control Bar */}
      <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
        <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
          <Search className="w-[18px] h-[18px]" />
          <input 
            type="text" 
            placeholder="Search companies by name..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">Tenant Name</th>
                <th className="px-4 py-3 font-medium">Provisioned Date</th>
                <th className="px-4 py-3 font-medium">Assigned Users</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                      No companies found matching your query.
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredCompanies.map((company) => (
                      <motion.tr 
                        key={company._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onClick={() => router.push(`/admin/companies/${company._id}`)}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group cursor-pointer"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-card border border-border-dim flex items-center justify-center text-foreground font-semibold text-[13px]">
                               {company.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-[13px] text-foreground block leading-tight">
                              {company.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-secondary">
                          {company.createdAt ? new Date(company.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-4 py-2.5">
                           <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                              <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                                {company.userCount || 0} USERS
                              </span>
                            </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button onClick={() => handleOpenEdit(company)} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {company.userCount === 0 && (
                                <button onClick={() => setDeletingCompany(company)} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title="Delete Empty Company">
                                    <Trash2 className="w-4 h-4" />
                                </button>
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
      </div>

      {/* Add/Edit Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingCompany ? "Edit Company" : "Create Company Tenant"}
      >
        <p className="text-secondary mb-6 text-[15px]">{editingCompany ? "Update workspace details." : "Initialize a brand new organizational workspace."}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary tracking-wide">Company Name</label>
            <input 
              type="text" 
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder="e.g. Sonae LLC"
            />
          </div>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <button 
              type="button" 
              onClick={() => setIsAddModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : (editingCompany ? "Update Company" : "Provision Tenant")}
            </button>
          </div>
        </form>
      </SonaeModal>

      {/* Delete Confirmation Modal */}
      <SonaeModal
        isOpen={!!deletingCompany}
        onClose={() => setDeletingCompany(null)}
        title="Delete Company Workspace"
      >
        <p className="text-secondary mb-6 text-[15px] leading-relaxed">
          Are you sure you want to permanently delete <strong className="text-foreground font-semibold">{deletingCompany?.name}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button 
            type="button" 
            onClick={() => setDeletingCompany(null)}
            className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={confirmDelete}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20 disabled:opacity-50"
          >
            {isSubmitting ? "Deleting..." : "Delete Tenant"}
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
