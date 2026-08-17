"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { FormEvent } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  Network,
  Plus,
  Trash2,
  Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import {
  PageHeader,
  PagePrimaryAction,
} from "@/src/ui/components/screens/PageHeader";
import {
  ModalFormActions,
  ModalFormField,
  modalInputClassName,
} from "@/src/ui/components/screens/ModalForm";
import {
  LoadMoreFooter,
  RowActions,
  RowIconButton,
  SearchBar,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";

export default function WorkflowsPage() {
  const router = useRouter();
  const t = useTranslations('admin.workflows');
  const createWorkflow = useMutation(api.workflows.createWorkflow);
  const deleteWorkflow = useMutation(api.workflows.deleteWorkflow);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingWorkflow, setDeletingWorkflow] = useState<Doc<"workflows"> | null>(null);

  const [formData, setFormData] = useState({ name: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const itemsPerPage = TABLE_PAGE_SIZE;
  const {
    results: paginatedWorkflows,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.workflows.getPaginatedWorkflows,
    { searchTerm },
    { initialNumItems: itemsPerPage }
  );
  const isLoading = status === "LoadingFirstPage";
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
      <PageHeader
        icon={<Network className="w-6 h-6 text-brand" />}
        title={t('title')}
        description={t('description')}
        action={
          <PagePrimaryAction icon={<Plus className="w-4 h-4" />} onClick={handleOpenAdd}>
            {t('new')}
          </PagePrimaryAction>
        }
      />

      <SearchBar value={searchTerm} onChange={handleSearch} placeholder={t('searchPlaceholder')} />

      <TableShell
        footer={
          <LoadMoreFooter
            visibleCount={paginatedWorkflows.length}
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
              <TableHeaderRow>
                <TableHeaderCell>{t('table.name')}</TableHeaderCell>
                <TableHeaderCell>{t('table.trigger')}</TableHeaderCell>
                <TableHeaderCell>{t('table.status')}</TableHeaderCell>
                <TableHeaderCell align="right">{t('table.actions')}</TableHeaderCell>
              </TableHeaderRow>
            </thead>
            <tbody>
              <AnimatePresence>
                {isLoading ? (
                  <TableLoadingRow colSpan={4} />
                ) : paginatedWorkflows.length === 0 ? (
                  <TableEmptyRow
                    colSpan={4}
                    icon={<Network className="w-8 h-8 text-muted/30" />}
                    label={t('table.empty')}
                  />
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
                          <RowActions>
                            <RowIconButton navigates label={t('table.visualBuilder')} onClick={() => router.push(`/admin/workflows/${workflow._id}`)}>
                              <Settings className="w-4 h-4" />
                            </RowIconButton>
                            <RowIconButton label={t('buttons.delete')} tone="danger" onClick={() => setDeletingWorkflow(workflow)}>
                              <Trash2 className="w-4 h-4" />
                            </RowIconButton>
                          </RowActions>
                        </td>
                      </motion.tr>
                    ))}
                  </>
                )}
              </AnimatePresence>
            </tbody>
      </TableShell>

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
          <ModalFormField label={t('modal.name')}>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className={modalInputClassName}
              placeholder={t('placeholders.name')}
            />
          </ModalFormField>

          <ModalFormField label={t('modal.description')}>
            <input
              type="text"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className={modalInputClassName}
              placeholder={t('placeholders.description')}
            />
          </ModalFormField>

          <ModalFormActions
            cancelLabel={t('buttons.cancel')}
            submitLabel={isSubmitting ? t('buttons.creating') : t('buttons.create')}
            isSubmitting={isSubmitting}
            onCancel={() => setIsAddModalOpen(false)}
          />
        </form>
      </SonaeModal>

      <ConfirmationModal
        isOpen={!!deletingWorkflow}
        onClose={() => {
          setDeletingWorkflow(null);
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
          {t('modal.deleteConfirm', { name: deletingWorkflow?.name ?? "" })}
        </p>
        <p className="text-[13px] text-muted">{t('modal.undone')}</p>
      </ConfirmationModal>
    </div>
  );
}
