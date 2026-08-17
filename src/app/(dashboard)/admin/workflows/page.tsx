"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useMutation } from "convex/react";
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
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import {
  PageHeader,
  PagePrimaryAction,
} from "@/src/ui/components/screens/PageHeader";
import {
  ModalField,
  ModalFormActions,
} from "@/src/ui/components/screens/ModalForm";
import {
  RowActions,
  RowIconButton,
} from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
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
  // The house footer, over a query that pages on the server. This screen used to
  // draw a lone "Load more" button, which meant a short list — one workflow —
  // showed a count and no controls at all, and looked nothing like the other
  // list screens.
  const workflows = useServerPagedTable(api.workflows.getPaginatedWorkflows, { searchTerm }, itemsPerPage);

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

      <DataTable
        rows={workflows.isLoading ? undefined : workflows.rows}
        rowKey={(workflow) => workflow._id}
        onRowClick={(workflow) => router.push(`/admin/workflows/${workflow._id}`)}
        minWidthClassName="min-w-[800px]"
        search={{ value: searchTerm, onChange: handleSearch, placeholder: t('searchPlaceholder') }}
        empty={{ icon: <Network className="w-8 h-8 text-muted/30" />, label: t('table.empty') }}
        footer={{
          mode: "paged",
          page: workflows.page,
          totalPages: workflows.totalPages,
          totalCount: workflows.loadedCount,
          pageSize: itemsPerPage,
          isLoading: workflows.isLoadingMore,
          onPageChange: workflows.goToPage,
          labels: { empty: t('table.empty') },
        }}
        columns={[
          {
            key: "name",
            header: t('table.name'),
            cell: (workflow) => (
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
            ),
          },
          {
            key: "trigger",
            header: t('table.trigger'),
            cell: (workflow) => (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-foreground/5 border border-border-dim w-fit">
                <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                  {workflow.triggerType}
                </span>
              </div>
            ),
          },
          {
            key: "status",
            header: t('table.status'),
            cell: (workflow) => (
              <div className={`flex items-center gap-2 text-[12px] font-medium ${workflow.isActive ? 'text-green-500' : 'text-neutral-500'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${workflow.isActive ? 'bg-green-500' : 'bg-neutral-500'}`} />
                {workflow.isActive ? t('table.active') : t('table.draft')}
              </div>
            ),
          },
          {
            key: "actions",
            header: t('table.actions'),
            align: "right",
            cell: (workflow) => (
              <RowActions>
                <RowIconButton navigates label={t('table.visualBuilder')} onClick={() => router.push(`/admin/workflows/${workflow._id}`)}>
                  <Settings className="w-4 h-4" />
                </RowIconButton>
                <RowIconButton label={t('buttons.delete')} tone="danger" onClick={() => setDeletingWorkflow(workflow)}>
                  <Trash2 className="w-4 h-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

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
          <ModalField
            label={t('modal.name')}
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('placeholders.name')}
          />

          <ModalField
            label={t('modal.description')}
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            placeholder={t('placeholders.description')}
          />

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
