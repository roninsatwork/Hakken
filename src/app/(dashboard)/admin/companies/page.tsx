"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { 
  Building2, 
  Plus, 
  Search, 
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight
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

  const [formData, setFormData] = useState({ name: "", systemPrompt: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const filteredCompanies = companies.filter((c: any) => 
    (c.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalItems = filteredCompanies.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedCompanies = filteredCompanies.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSearch = (v: string) => {
    setSearchTerm(v);
    setCurrentPage(1);
  };

  const handleOpenAdd = () => {
    setFormData({ name: "", systemPrompt: "" });
    setEditingCompany(null);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (company: any) => {
    setFormData({ name: company.name, systemPrompt: company.systemPrompt || "" });
    setEditingCompany(company);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingCompany) {
        await updateCompany({ id: editingCompany._id, name: formData.name, systemPrompt: formData.systemPrompt });
      } else {
        await createCompany({ name: formData.name, systemPrompt: formData.systemPrompt });
      }
      setIsAddModalOpen(false);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to save company");
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
        setSubmitError(err.message || "Failed to delete company");
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
            onChange={e => handleSearch(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl overflow-hidden shadow-sm flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
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
                {paginatedCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                      No companies match your search or no companies created yet.
                    </td>
                  </tr>
                ) : (
                  <>
                    {paginatedCompanies.map((company) => (
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
                            <button onClick={() => setDeletingCompany(company)} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title="Delete Company & Wipe Data">
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
        
        {/* Pagination Footer */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border-dim bg-sidebar/50">
            <div className="flex items-center gap-2 text-[12px] text-muted">
                <span>Showing</span>
                <span className="font-medium text-foreground">{Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}</span>
                <span>to</span>
                <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, totalItems)}</span>
                <span>of</span>
                <span className="font-medium text-foreground">{totalItems}</span>
                <span>companies</span>
            </div>
            <div className="flex items-center gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingCompany ? "Edit Company" : "Create Company Tenant"}
      >
        <div className="flex flex-col gap-2 mb-6">
           <p className="text-secondary text-[15px]">{editingCompany ? "Update workspace details." : "Initialize a brand new organizational workspace."}</p>
           {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
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

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-secondary tracking-wide">Company Profile & AI Rules</label>
              <span className="text-[11px] text-muted">Optional</span>
            </div>
            <textarea 
              value={formData.systemPrompt}
              onChange={e => setFormData({...formData, systemPrompt: e.target.value})}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm min-h-[120px] resize-y custom-scrollbar leading-relaxed"
              placeholder="e.g. Ronins is a boutique CRM firm. Our top competitors are HubSpot and Salesforce. We prioritize relationship intelligence over mass outreach."
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
        onClose={() => { setDeletingCompany(null); setSubmitError(""); }}
        title="Delete Company Workspace"
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>
            Are you sure you want to permanently delete <strong className="text-foreground font-semibold">{deletingCompany?.name}</strong>? This action cannot be undone.
          </p>
          <div className="bg-red-500/10 border border-red-500/20 rounded-[10px] p-4 text-red-500/90 text-[13px]">
            <strong className="font-semibold block mb-1 uppercase tracking-widest text-[11px]">Warning: Cascade Nuke Active</strong>
            This will permanently erase the company along with ALL of its assigned users, system logic, analytics, and historical chat logs to comply with GDPR.
          </div>
          {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
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
