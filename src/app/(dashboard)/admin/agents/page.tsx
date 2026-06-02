"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
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
import { AdminConfirmationModal } from "@/src/app/(dashboard)/admin/_components/AdminConfirmationModal";
import {
  AdminPageHeader,
  AdminPagePrimaryAction,
} from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminModalFormActions,
  AdminModalFormError,
  AdminModalFormField,
  adminModalInputClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import {
  AdminLoadMoreFooter,
  AdminRowActions,
  AdminRowIconButton,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";

type Agent = Doc<"agents">;


export default function AgentsPage() {
  const router = useRouter();
  const t = useTranslations('admin.agents');
  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "agent" });
  const activeModels = activeModelsData || [];
  const createAgent = useMutation(api.agents.createAgent);
  const deleteAgent = useMutation(api.agents.deleteAgent);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);

  const [formData, setFormData] = useState({ name: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const itemsPerPage = ADMIN_PAGE_SIZE;
  const {
    results: paginatedAgents,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.agents.getPaginatedAgents,
    { searchTerm },
    { initialNumItems: itemsPerPage }
  );
  const isLoading = status === "LoadingFirstPage" || activeModelsData === undefined;
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const handleSearch = (v: string) => {
    setSearchTerm(v);
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
      <AdminPageHeader
        icon={<Workflow className="w-6 h-6 text-brand" />}
        title={t('title')}
        description={t('description')}
        action={
          <AdminPagePrimaryAction icon={<Plus className="w-4 h-4" />} onClick={handleOpenAdd}>
            {t('new')}
          </AdminPagePrimaryAction>
        }
      />

      <AdminSearchBar value={searchTerm} onChange={handleSearch} placeholder={t('searchPlaceholder')} />

      {/* Table */}
      <AdminTableShell
        footer={
          <AdminLoadMoreFooter
            visibleCount={paginatedAgents.length}
            canLoadMore={canLoadMore}
            isLoading={isLoadingMore}
            onLoadMore={() => loadMore(itemsPerPage)}
            labels={{
              empty: t('table.empty'),
              showing: (count) => t('table.showingLoaded', { count }),
              loadMore: t('table.loadMore'),
              loading: t('table.loadingMore'),
            }}
          />
        }
        minWidthClassName="min-w-[800px]"
      >
            <thead>
              <AdminTableHeaderRow>
                <AdminTableHeaderCell>{t('table.agent')}</AdminTableHeaderCell>
                <AdminTableHeaderCell>{t('table.model')}</AdminTableHeaderCell>
                <AdminTableHeaderCell>{t('table.status')}</AdminTableHeaderCell>
                <AdminTableHeaderCell align="right">{t('table.actions')}</AdminTableHeaderCell>
              </AdminTableHeaderRow>
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
                          <AdminRowActions>
                            <AdminRowIconButton label={t('table.configure')} onClick={() => router.push(`/admin/agents/${agent._id}`)}>
                              <Settings className="w-4 h-4" />
                            </AdminRowIconButton>
                            <AdminRowIconButton label={t('buttons.delete')} tone="danger" onClick={() => setDeletingAgent(agent)}>
                              <Trash2 className="w-4 h-4" />
                            </AdminRowIconButton>
                          </AdminRowActions>
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
        <AdminModalFormError className="mb-4">{submitError}</AdminModalFormError>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <AdminModalFormField label={t('modal.name')}>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className={adminModalInputClassName}
              placeholder={t('placeholders.name')}
            />
          </AdminModalFormField>

          <AdminModalFormField label={t('modal.description')}>
            <input
              type="text"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className={adminModalInputClassName}
              placeholder={t('placeholders.description')}
            />
          </AdminModalFormField>

          <AdminModalFormActions
            cancelLabel={t('buttons.cancel')}
            submitLabel={isSubmitting ? t('buttons.creating') : t('buttons.create')}
            isSubmitting={isSubmitting}
            onCancel={() => setIsAddModalOpen(false)}
          />
        </form>
      </SonaeModal>

      <AdminConfirmationModal
        isOpen={!!deletingAgent}
        onClose={() => {
          setDeletingAgent(null);
          setSubmitError("");
        }}
        title={t('modal.deleteTitle')}
        cancelLabel={t('buttons.cancel')}
        confirmLabel={isSubmitting ? t('buttons.deleting') : t('buttons.delete')}
        isSubmitting={isSubmitting}
        onConfirm={confirmDelete}
        error={submitError}
      >
        <p>
          {t('modal.deleteConfirm', { name: deletingAgent?.name ?? "" })}
        </p>
        <p className="text-[13px] text-muted">{t('modal.undone')}</p>
      </AdminConfirmationModal>
    </div>
  );
}
