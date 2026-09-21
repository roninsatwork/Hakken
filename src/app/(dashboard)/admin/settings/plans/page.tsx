"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { useAdminAction } from "@/src/hooks/useAdminAction";
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
import type { Doc } from "@/convex/_generated/dataModel";
import { COMPANY_MODULES } from "@/convex/utils/companyModules";
import { useTranslations } from "next-intl";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton, SearchBar } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import {
  TABLE_PAGE_SIZE,
} from "@/src/ui/components/screens/pagination";

type Plan = Doc<"plans">;

const loadPlanDialogs = () => import("./PlanDialogs");
const PlanDialogs = dynamic(() => loadPlanDialogs().then((module) => module.PlanDialogs));

export default function SubscriptionPlansPage() {
  const t = useTranslations('admin.plans');
  const tModules = useTranslations('admin.companies.modules');
  
  const createPlan = useMutation(api.plans.createPlan);
  const updatePlan = useMutation(api.plans.updatePlan);
  const deletePlan = useMutation(api.plans.deletePlan);
  const action = useAdminAction({ scope: "admin-plans" });

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [dialogsRequested, setDialogsRequested] = useState(false);

  const [formData, setFormData] = useState({ 
    name: "", 
    description: "", 
    messageLimit: 1000, 
    seoPromptsPerWebsite: 10,
    priceGBP: 0,
    grantedModules: [] as string[],
    isActive: true 
  });
  
  const [submitError, setSubmitError] = useState("");

  const itemsPerPage = TABLE_PAGE_SIZE;
  const plans = useServerPagedTable(api.plans.getPaginatedPlans, { searchTerm }, itemsPerPage);
  const paginatedPlans = plans.rows;
  const isLoading = plans.isLoading;

  const handleSearch = (v: string) => {
    setSearchTerm(v);
  };

  const preparePlanDialogs = () => {
    setDialogsRequested(true);
    void loadPlanDialogs();
  };

  const handleOpenAdd = () => {
    preparePlanDialogs();
    setFormData({ name: "", description: "", messageLimit: 1000, seoPromptsPerWebsite: 10, priceGBP: 0, grantedModules: [], isActive: true });
    setEditingPlan(null);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (plan: Plan) => {
    preparePlanDialogs();
    setFormData({ 
        name: plan.name, 
        description: plan.description || "", 
        messageLimit: plan.messageLimit,
        seoPromptsPerWebsite: plan.seoPromptsPerWebsite ?? 10,
        priceGBP: plan.priceGBP,
        grantedModules: plan.grantedModules ?? [],
        isActive: plan.isActive
    });
    setEditingPlan(plan);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const outcome = await action.run(
      async () => {
        if (editingPlan) {
          await updatePlan({
              id: editingPlan._id,
              name: formData.name,
              description: formData.description,
              messageLimit: Number(formData.messageLimit),
              seoPromptsPerWebsite: Number(formData.seoPromptsPerWebsite),
              priceGBP: Number(formData.priceGBP),
              grantedModules: formData.grantedModules,
              isActive: formData.isActive
          });
        } else {
          await createPlan({
              name: formData.name,
              description: formData.description,
              messageLimit: Number(formData.messageLimit),
              seoPromptsPerWebsite: Number(formData.seoPromptsPerWebsite),
              priceGBP: Number(formData.priceGBP),
              grantedModules: formData.grantedModules,
              isActive: formData.isActive
          });
        }
      },
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );
    if (outcome.ok) {
      setIsAddModalOpen(false);
      return;
    }
    if (outcome.message) setSubmitError(outcome.message);
  };

  const confirmDelete = async () => {
    if (deletingPlan) {
      const outcome = await action.run(() => deletePlan({ id: deletingPlan._id }), {
        suppressErrorToast: true,
        fallbackMessage: t("errors.deleteFailed"),
      });
      if (outcome.ok) {
        setDeletingPlan(null);
        return;
      }
      if (outcome.message) setSubmitError(outcome.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<CreditCard className="w-6 h-6 text-brand" />}
        title={t('title')}
        description={t('subtitle')}
        action={
          <WriteButton
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-brand text-white font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span>{t('newPlan')}</span>
          </WriteButton>
        }
      />

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
                <Link href={`/admin/settings/plans/${plan._id}/billing`} className="text-[12px] text-secondary underline underline-offset-4">{t("stripePrice")}</Link>
                <RowIconButton onClick={() => handleOpenEdit(plan)} label={t('table.editPlan')}>
                  <Edit2 className="w-4 h-4" />
                </RowIconButton>
                <RowIconButton
                  onClick={() => {
                    preparePlanDialogs();
                    setDeletingPlan(plan);
                  }}
                  tone="danger"
                  label={t('table.deletePlan')}
                >
                  <Trash2 className="w-4 h-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      {dialogsRequested ? (
        <PlanDialogs
          editorOpen={isAddModalOpen}
          editing={Boolean(editingPlan)}
          formData={formData}
          setFormData={setFormData}
          submitError={submitError}
          isSubmitting={action.isBusy()}
          onEditorClose={() => setIsAddModalOpen(false)}
          onSubmit={handleSubmit}
          grantsControl={
            <div className="grid grid-cols-2 gap-2">
              {COMPANY_MODULES.map((module) => {
                const isOn = formData.grantedModules.includes(module.key);
                return (
                  <label key={module.key} className="flex items-center gap-2 text-[13px] text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() =>
                        setFormData({
                          ...formData,
                          grantedModules: isOn
                            ? formData.grantedModules.filter((key) => key !== module.key)
                            : [...formData.grantedModules, module.key],
                        })
                      }
                      className="w-4 h-4 rounded border-border-dim text-brand focus:ring-brand"
                    />
                    {tModules(`${module.key}.name`)}
                  </label>
                );
              })}
            </div>
          }
          activeControl={
            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })}
                className="w-4 h-4 rounded border-border-dim text-brand focus:ring-brand"
              />
              <label htmlFor="isActive" className="text-[13px] font-medium text-foreground tracking-wide cursor-pointer">
                {t('activeLabel')}
              </label>
            </div>
          }
          deletingPlanName={deletingPlan?.name ?? null}
          onDeleteClose={() => {
            setDeletingPlan(null);
            setSubmitError("");
          }}
          onDeleteConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}
