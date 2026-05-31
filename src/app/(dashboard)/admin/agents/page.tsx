"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  Bot,
  Workflow,
  Plus,
  Trash2,
  Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AdminPaginationFooter,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import {
  ADMIN_PAGE_SIZE,
  matchesAdminSearchTerm,
  paginateAdminItems,
} from "@/src/app/(dashboard)/admin/_lib/pagination";

type Agent = Doc<"agents">;


export default function AgentsPage() {
  const router = useRouter();
  const t = useTranslations('admin.agents');
  const agentsData = useQuery(api.agents.list);
  const activeModelsData = useQuery(api.aiModels.getModels);
  const agents = agentsData || [];
  const activeModels = activeModelsData || [];
  const createAgent = useMutation(api.agents.createAgent);
  const deleteAgent = useMutation(api.agents.deleteAgent);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);

  const [formData, setFormData] = useState({ name: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = ADMIN_PAGE_SIZE;
  const isLoading = agentsData === undefined || activeModelsData === undefined;

  const filteredAgents = agents.filter((agent) =>
    matchesAdminSearchTerm(searchTerm, [agent.name, agent.description])
  );

  const {
    items: paginatedAgents,
    totalItems,
    totalPages,
  } = paginateAdminItems(filteredAgents, currentPage, itemsPerPage);

  const handleSearch = (v: string) => {
    setSearchTerm(v);
    setCurrentPage(1);
  };

  const handleOpenAdd = () => {
    setFormData({ name: "", description: "" });
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const newAgentId = await createAgent({
        name: formData.name,
        description: formData.description
      });
      setIsAddModalOpen(false);
      // Navigate straight to the new agent's config page
      router.push(`/admin/agents/${newAgentId}`);
    } catch (err: unknown) {
      setSubmitError(getErrorMessage(err, t('errors.create')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingAgent) {
      setIsSubmitting(true);
      try {
        await deleteAgent({ id: deletingAgent._id });
        setDeletingAgent(null);
      } catch (err: unknown) {
        setSubmitError(getErrorMessage(err, t('errors.delete')));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Workflow className="w-6 h-6 text-brand" />
            {t('title')}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t('description')}</p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{t('new')}</span>
        </button>
      </div>

      <AdminSearchBar value={searchTerm} onChange={handleSearch} placeholder={t('searchPlaceholder')} />

      {/* Table */}
      <AdminTableShell
        footer={
          <AdminPaginationFooter
            page={currentPage}
            totalPages={totalPages}
            totalCount={totalItems}
            pageSize={itemsPerPage}
            isLoading={isLoading}
            onPageChange={setCurrentPage}
            labels={{
              empty: t('table.empty'),
              showing: (start, end, total) => `Showing ${start} to ${end} of ${total} agents`,
            }}
          />
        }
        minWidthClassName="min-w-[800px]"
      >
            <thead>
              <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">{t('table.agent')}</th>
                <th className="px-4 py-3 font-medium">{t('table.model')}</th>
                <th className="px-4 py-3 font-medium">{t('table.status')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {isLoading ? (
                  <AdminTableLoadingRow colSpan={4} />
                ) : paginatedAgents.length === 0 ? (
                  <AdminTableEmptyRow
                    colSpan={4}
                    icon={<Bot className="w-8 h-8 text-muted/30" />}
                    label={t('table.empty')}
                  />
                ) : (
                  <>
                    {paginatedAgents.map((agent) => (
                      <motion.tr
                        key={agent._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onClick={() => router.push(`/admin/agents/${agent._id}`)}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {agent.avatar ? (
                              <Image
                                src={agent.avatar}
                                alt={agent.name}
                                width={32}
                                height={32}
                                unoptimized
                                className="w-8 h-8 rounded-full border border-border-dim object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-card border border-border-dim flex items-center justify-center text-foreground">
                                <Bot className="w-4 h-4 text-brand" />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-medium text-[13px] text-foreground leading-tight">
                                {agent.name}
                              </span>
                              {agent.description && (
                                <span className="text-[11px] text-secondary mt-0.5 line-clamp-1 max-w-[300px]">
                                  {agent.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                            <span className="text-[10px] font-mono tracking-widest text-foreground/80 lowercase">
                              {activeModels.find((m) => m.modelId === agent.modelId)?.friendlyName || activeModels.find((m) => m.modelId === agent.modelId)?.displayName || agent.modelId}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`flex items-center gap-2 text-[12px] font-medium ${agent.isActive ? 'text-green-500' : 'text-neutral-500'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${agent.isActive ? 'bg-green-500' : 'bg-neutral-500'}`} />
                            {agent.isActive ? t('table.active') : t('table.draft')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); router.push(`/admin/agents/${agent._id}`); }} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors" title={t('table.configure')}>
                              <Settings className="w-4 h-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setDeletingAgent(agent); }} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title={t('buttons.delete')}>
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
      </AdminTableShell>

      {/* Add Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('modal.initTitle')}
      >
        <p className="text-secondary mb-6 text-[15px]">{t('modal.initDesc')}</p>
        {submitError && <p className="text-red-500 text-[13px] font-medium mb-4">{submitError}</p>}
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

      {/* Delete Confirmation Modal */}
      <SonaeModal
        isOpen={!!deletingAgent}
        onClose={() => setDeletingAgent(null)}
        title={t('modal.deleteTitle')}
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>
            {t('modal.deleteConfirm', { name: deletingAgent?.name ?? "" })}
          </p>
          <p className="text-[13px] text-muted">{t('modal.undone')}</p>
          {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button
            type="button"
            onClick={() => setDeletingAgent(null)}
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
