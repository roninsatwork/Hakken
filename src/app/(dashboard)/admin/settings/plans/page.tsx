"use client";

import { useMutation } from "convex/react";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import {
  CreditCard,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Info
} from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import type { Doc } from "@/convex/_generated/dataModel";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { RowActions, RowIconButton, SearchBar } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import {
  TABLE_PAGE_SIZE,
} from "@/src/ui/components/screens/pagination";

type Plan = Doc<"plans">;

export default function SubscriptionPlansPage() {
  const t = useTranslations('admin.plans');
  const tCommon = useTranslations('common');
  
  const createPlan = useMutation(api.plans.createPlan);
  const updatePlan = useMutation(api.plans.updatePlan);
  const deletePlan = useMutation(api.plans.deletePlan);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);

  const [formData, setFormData] = useState({ 
    name: "", 
    description: "", 
    messageLimit: 1000, 
    priceGBP: 0,
    isActive: true 
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const itemsPerPage = TABLE_PAGE_SIZE;
  const plans = useServerPagedTable(api.plans.getPaginatedPlans, { searchTerm }, itemsPerPage);
  const paginatedPlans = plans.rows;
  const isLoading = plans.isLoading;

  const handleSearch = (v: string) => {
    setSearchTerm(v);
  };

  const handleOpenAdd = () => {
    setFormData({ name: "", description: "", messageLimit: 1000, priceGBP: 0, isActive: true });
    setEditingPlan(null);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (plan: Plan) => {
    setFormData({ 
        name: plan.name, 
        description: plan.description || "", 
        messageLimit: plan.messageLimit,
        priceGBP: plan.priceGBP,
        isActive: plan.isActive
    });
    setEditingPlan(plan);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingPlan) {
        await updatePlan({ 
            id: editingPlan._id, 
            name: formData.name, 
            description: formData.description,
            messageLimit: Number(formData.messageLimit),
            priceGBP: Number(formData.priceGBP),
            isActive: formData.isActive
        });
      } else {
        await createPlan({ 
            name: formData.name, 
            description: formData.description,
            messageLimit: Number(formData.messageLimit),
            priceGBP: Number(formData.priceGBP),
            isActive: formData.isActive
        });
      }
      setIsAddModalOpen(false);
    } catch {
      setSubmitError(t("errors.saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingPlan) {
      setIsSubmitting(true);
      try {
        await deletePlan({ id: deletingPlan._id });
        setDeletingPlan(null);
      } catch {
        setSubmitError(t("errors.deleteFailed"));
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
            <CreditCard className="w-6 h-6 text-brand" />
            {t('title')}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t('subtitle')}</p>
        </div>

        <WriteButton
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
        >
          <Plus className="w-4 h-4" />
          <span>{t('newPlan')}</span>
        </WriteButton>
      </div>

      {/* Explanation Notice */}
      <div className="flex items-start gap-4 p-4 bg-foreground/[0.015] border border-border-dim/50 rounded-[12px] text-secondary">
         <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted" />
         <div className="flex flex-col gap-0.5">
            <h3 className="text-[13px] font-medium text-foreground tracking-wide">{t('infoTitle')}</h3>
            <p className="text-[12.5px] leading-relaxed text-secondary opacity-80 tracking-wide">
              {t('infoDesc')}
            </p>
         </div>
      </div>

      <SearchBar value={searchTerm} onChange={handleSearch} placeholder={t('searchPlaceholder')} />

      {/* Table */}
      <DataTable
        rows={isLoading ? undefined : paginatedPlans}
        rowKey={(plan) => plan._id}
        minWidthClassName="min-w-[900px]"
        empty={{ icon: <CreditCard className="w-8 h-8 text-muted/30" />, label: t('emptyState') }}
        footer={{
          mode: "paged",
          page: plans.page,
          totalPages: plans.totalPages,
          totalCount: plans.loadedCount,
          pageSize: itemsPerPage,
          isLoading: plans.isBusy,
          onPageChange: plans.goToPage,
          labels: { empty: t('emptyState') },
        }}
        columns={[
          {
            key: "name",
            header: t('table.name'),
            cell: (plan) => (
              <div className="flex flex-col">
                <span className="font-medium text-[13px] text-foreground block leading-tight">
                  {plan.name}
                </span>
                {plan.description && (
                  <span className="text-[11px] text-secondary mt-0.5">{plan.description}</span>
                )}
              </div>
            ),
          },
          {
            key: "limit",
            header: t('table.limit'),
            cell: (plan) =>
              plan.messageLimit === -1 ? (
                <span className="text-brand bg-brand/10 px-2 py-0.5 rounded-full text-[11px]">
                  {t('unlimited')}
                </span>
              ) : (
                <span className="text-[13px] text-foreground font-mono">
                  {plan.messageLimit.toLocaleString()}
                </span>
              ),
          },
          {
            key: "price",
            header: t('table.price'),
            cell: (plan) => (
              <span className="text-[13px] text-foreground font-mono">
                £{plan.priceGBP.toFixed(2)}/mo
              </span>
            ),
          },
          {
            key: "status",
            header: t('table.status'),
            /* The word carries the state; the tick and cross are decoration
               beside it rather than the signal. */
            cell: (plan) =>
              plan.isActive ? (
                <div className="flex items-center gap-1.5 text-[11px] text-foreground font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-secondary font-medium">
                  <XCircle className="w-3.5 h-3.5" /> Inactive
                </div>
              ),
          },
          {
            key: "actions",
            header: t('table.actions'),
            align: "right",
            cell: (plan) => (
              <RowActions>
                <RowIconButton onClick={() => handleOpenEdit(plan)} label={t('table.editPlan')}>
                  <Edit2 className="w-4 h-4" />
                </RowIconButton>
                <RowIconButton onClick={() => setDeletingPlan(plan)} tone="danger" label={t('table.deletePlan')}>
                  <Trash2 className="w-4 h-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      {/* Add/Edit Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingPlan ? t('editTitle') : t('createTitle')}
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px]">{editingPlan ? t('editSubtitle') : t('createSubtitle')}</p>
          {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field
            label={t('nameLabel')}
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('namePlaceholder')}
          />

          <TextAreaField
            label={t('descLabel')}
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            placeholder={t('descPlaceholder')}
            className="min-h-[80px] resize-y"
          />

          <div className="grid grid-cols-2 gap-4">
              <Field
                label={t('limitLabel')}
                type="number"
                required
                value={formData.messageLimit}
                onChange={e => setFormData({ ...formData, messageLimit: Number(e.target.value) })}
                placeholder={t('limitPlaceholder')}
                className="font-mono"
              />

              <Field
                label={t('priceLabel')}
                type="number"
                step="0.01"
                required
                value={formData.priceGBP}
                onChange={e => setFormData({ ...formData, priceGBP: Number(e.target.value) })}
                placeholder={t('pricePlaceholder')}
                className="font-mono"
              />
          </div>

          <div className="flex items-center gap-3 pt-2">
              <input
                 type="checkbox"
                 id="isActive"
                 checked={formData.isActive}
                 onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                 className="w-4 h-4 rounded border-border-dim text-brand focus:ring-brand"
              />
              <label htmlFor="isActive" className="text-[13px] font-medium text-foreground tracking-wide cursor-pointer">{t('activeLabel')}</label>
          </div>

          <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-border-dim">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
              disabled={isSubmitting}
            >
              {tCommon('cancel')}
            </button>
            <WriteButton
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? tCommon('saving') : (editingPlan ? t('savePlan') : t('newPlan'))}
            </WriteButton>
          </div>
        </form>
      </SonaeModal>

      <ConfirmationModal
        isOpen={!!deletingPlan}
        onClose={() => {
          setDeletingPlan(null);
          setSubmitError("");
        }}
        title={t('deleteTitle')}
        cancelLabel={tCommon('cancel')}
        confirmLabel={tCommon('actions.delete')}
        isSubmitting={isSubmitting}
        onConfirm={confirmDelete}
        error={submitError}
        warning={{ description: t('deleteWarning') }}
      >
        <p>
          {t.rich('deleteConfirm', { name: () => <strong className="text-foreground font-semibold">{deletingPlan?.name}</strong> })}
        </p>
      </ConfirmationModal>
    </div>
  );
}
