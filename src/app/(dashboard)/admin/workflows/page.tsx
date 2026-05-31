"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { FormEvent } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  Network,
  Plus,
  Search,
  Trash2,
  Settings,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";

export default function WorkflowsPage() {
  const router = useRouter();
  const t = useTranslations('admin.workflows');
  const workflows = (useQuery(api.workflows.list) || []) as Doc<"workflows">[];
  const createWorkflow = useMutation(api.workflows.createWorkflow);
  const deleteWorkflow = useMutation(api.workflows.deleteWorkflow);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingWorkflow, setDeletingWorkflow] = useState<Doc<"workflows"> | null>(null);

  const [formData, setFormData] = useState({ name: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = ADMIN_PAGE_SIZE;

  const filteredWorkflows = workflows.filter((w) =>
    (w.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalItems = filteredWorkflows.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedWorkflows = filteredWorkflows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSearch = (v: string) => {
    setSearchTerm(v);
    setCurrentPage(1);
  };

  const handleOpenAdd = () => {
    setFormData({ name: "", description: "" });
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const newWorkflowId = await createWorkflow({
        name: formData.name,
        description: formData.description
      });
      setIsAddModalOpen(false);
      router.push(`/admin/workflows/${newWorkflowId}`);
    } catch (err: unknown) {
      setSubmitError(getErrorMessage(err, t('errors.create')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingWorkflow) {
      setIsSubmitting(true);
      try {
        await deleteWorkflow({ id: deletingWorkflow._id });
        setDeletingWorkflow(null);
      } catch (err: unknown) {
        setSubmitError(getErrorMessage(err, t('errors.delete')));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Network className="w-6 h-6 text-brand" />
            {t('title')}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t('description')}</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
          <div className="flex-1 sm:w-[250px] flex items-center gap-2 px-3 py-2 bg-sidebar/50 border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all shadow-sm">
            <Search className="w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={e => handleSearch(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-[13px] placeholder:text-muted"
            />
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{t('new')}</span>
          </button>
        </div>
      </div>

      <div className="bg-sidebar/40 border border-border-dim rounded-[16px] backdrop-blur-xl overflow-hidden shadow-sm flex-1 flex flex-col w-full">
        <div className="overflow-x-auto flex-1 h-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">{t('table.name')}</th>
                <th className="px-4 py-3 font-medium">{t('table.trigger')}</th>
                <th className="px-4 py-3 font-medium">{t('table.status')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {paginatedWorkflows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                      {t('table.empty')}
                    </td>
                  </tr>
                ) : (
                  <>
                    {paginatedWorkflows.map((workflow) => (
                      <motion.tr
                        key={workflow._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onClick={() => router.push(`/admin/workflows/${workflow._id}`)}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-[8px] bg-card border border-border-dim flex items-center justify-center text-foreground">
                              <Network className="w-4 h-4 text-brand" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-[13px] text-foreground leading-tight">
                                {workflow.name}
                              </span>
                              {workflow.description && (
                                <span className="text-[11px] text-secondary mt-0.5 line-clamp-1 max-w-[300px]">
                                  {workflow.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-foreground/5 border border-border-dim w-fit">
                            <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                              {workflow.triggerType}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`flex items-center gap-2 text-[12px] font-medium ${workflow.isActive ? 'text-green-500' : 'text-neutral-500'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${workflow.isActive ? 'bg-green-500' : 'bg-neutral-500'}`} />
                            {workflow.isActive ? t('table.active') : t('table.draft')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); router.push(`/admin/workflows/${workflow._id}`); }} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors" title={t('table.visualBuilder')}>
                              <Settings className="w-4 h-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setDeletingWorkflow(workflow); }} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title={t('buttons.delete')}>
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
              <span>{t('pagination.showing')}</span>
              <span className="font-medium text-foreground">{Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}</span>
              <span>{t('pagination.to')}</span>
              <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, totalItems)}</span>
              <span>{t('pagination.of')}</span>
              <span className="font-medium text-foreground">{totalItems}</span>
              <span>{t('pagination.items')}</span>
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

      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('modal.initTitle')}
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px]">{t('modal.initDesc')}</p>
          {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary tracking-wide">{t('modal.name')}</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder={t('placeholders.name')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary tracking-wide">{t('modal.description')}</label>
            <input
              type="text"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder={t('placeholders.description')}
            />
          </div>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
              disabled={isSubmitting}
            >
              {t('buttons.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? t('buttons.creating') : t('buttons.create')}
            </button>
          </div>
        </form>
      </SonaeModal>

      <SonaeModal
        isOpen={!!deletingWorkflow}
        onClose={() => { setDeletingWorkflow(null); setSubmitError(""); }}
        title={t('modal.deleteTitle')}
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>
            {t('modal.deleteConfirm', { name: deletingWorkflow?.name ?? "" })}
          </p>
          <p className="text-[13px] text-muted">{t('modal.undone')}</p>
          {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button
            type="button"
            onClick={() => setDeletingWorkflow(null)}
            className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
            disabled={isSubmitting}
          >
            {t('buttons.cancel')}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20 disabled:opacity-50"
          >
            {isSubmitting ? t('buttons.deleting') : t('buttons.delete')}
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
