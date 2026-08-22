"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  Building2,
  Plus,
  Trash2,
  Edit2,
} from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import {
  PageHeader,
  PagePrimaryAction,
} from "@/src/ui/components/screens/PageHeader";
import {
  ModalField,
  ModalFormActions,
  ModalFormError,
  ModalFormField,
  modalInputClassName,
  modalTextareaClassName,
} from "@/src/ui/components/screens/ModalForm";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import {
  TABLE_PAGE_SIZE,
} from "@/src/ui/components/screens/pagination";
import { formatDate } from "@/src/lib/dates";
import { COMPANY_MODULES } from "@/convex/utils/companyModules";
import { DEFAULT_COMPANY_MODULE_KEYS } from "@/convex/utils/coreModules";

type CompanyRow = Doc<"companies"> & { userCount: number; userCountIsCapped?: boolean };
type CompanyFormData = {
  name: string;
  systemPrompt: string;
  planId: string;
  enabledModules: string[];
};

export default function CompaniesPage() {
  const router = useRouter();
  const t = useTranslations('admin.companies');
  const tCommon = useTranslations('common');
  const createCompany = useMutation(api.companies.createCompany);
  const updateCompany = useMutation(api.companies.updateCompany);
  const deleteCompany = useMutation(api.companies.deleteCompany);
  const assignPlanToCompany = useMutation(api.companies.assignPlanToCompany);
  const activePlans = (useQuery(api.plans.getActivePlans) || []) as Doc<"plans">[];

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyRow | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<CompanyRow | null>(null);

  const [formData, setFormData] = useState<CompanyFormData>({ name: "", systemPrompt: "", planId: "", enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS] });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const itemsPerPage = TABLE_PAGE_SIZE;
  // The house footer — Previous, Page X of Y, Next — over a query that still
  // pages on the server.
  const companiesTable = useServerPagedTable(
    api.companies.getPaginatedCompanies,
    { searchTerm },
    itemsPerPage
  );
  const paginatedCompanies = companiesTable.rows;
  const isLoading = companiesTable.isLoading;

  const handleSearch = (v: string) => {
    setSearchTerm(v);
  };

  const handleOpenAdd = () => {
    setFormData({ name: "", systemPrompt: "", planId: "", enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS] });
    setEditingCompany(null);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (company: CompanyRow) => {
    setFormData({
      name: company.name,
      systemPrompt: company.systemPrompt || "",
      planId: company.planId || "",
      enabledModules: company.enabledModules ?? [],
    });
    setEditingCompany(company);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const toggleModule = (key: string) => {
    setFormData((previous) => ({
      ...previous,
      enabledModules: previous.enabledModules.includes(key)
        ? previous.enabledModules.filter((enabled) => enabled !== key)
        : [...previous.enabledModules, key],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingCompany) {
        await updateCompany({
          id: editingCompany._id,
          name: formData.name,
          systemPrompt: formData.systemPrompt,
          enabledModules: formData.enabledModules,
        });
        if (formData.planId) await assignPlanToCompany({ id: editingCompany._id, planId: formData.planId as Id<"plans"> });
        else await assignPlanToCompany({ id: editingCompany._id, planId: undefined });
      } else {
        const newCompanyId = await createCompany({
          name: formData.name,
          systemPrompt: formData.systemPrompt,
          enabledModules: formData.enabledModules,
        });
        if (formData.planId) await assignPlanToCompany({ id: newCompanyId, planId: formData.planId as Id<"plans"> });
      }
      setIsAddModalOpen(false);
    } catch {
      setSubmitError(t("errors.saveFailed"));
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
      } catch {
        setSubmitError(t("errors.deleteFailed"));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<Building2 className="w-6 h-6 text-brand" />}
        title={t('title')}
        description={t('subtitle')}
        action={
          <PagePrimaryAction variant="brand" icon={<Plus className="w-4 h-4" />} onClick={handleOpenAdd}>
            {t('newCompany')}
          </PagePrimaryAction>
        }
      />

      {/* Table */}
      <DataTable
        rows={isLoading ? undefined : paginatedCompanies}
        rowKey={(company) => company._id}
        minWidthClassName="min-w-[800px]"
        search={{ value: searchTerm, onChange: handleSearch, placeholder: t('searchPlaceholder') }}
        onRowClick={(company) => router.push(`/admin/companies/${company._id}`)}
        empty={{ icon: <Building2 className="w-8 h-8 text-muted/30" />, label: t('emptyState') }}
        footer={{
          mode: "paged",
          page: companiesTable.page,
          totalPages: companiesTable.totalPages,
          totalCount: companiesTable.loadedCount,
          pageSize: itemsPerPage,
          isLoading: companiesTable.isBusy,
          onPageChange: companiesTable.goToPage,
          labels: { empty: t('emptyState') },
        }}
        columns={[
          {
            key: "name",
            header: t('tenantName'),
            cell: (company) => (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-card border border-border-dim flex items-center justify-center text-foreground font-semibold text-[13px]">
                  {company.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-[13px] text-foreground block leading-tight">
                  {company.name}
                </span>
              </div>
            ),
          },
          {
            key: "created",
            header: t('provisionedDate'),
            cell: (company) => (
              <span className="text-[12px] text-secondary">{formatDate(company.createdAt)}</span>
            ),
          },
          {
            key: "users",
            header: t('assignedUsers'),
            cell: (company) => (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                  {t('users', { count: company.userCount || 0 })}{company.userCountIsCapped ? "+" : ""}
                </span>
              </div>
            ),
          },
          {
            key: "actions",
            header: t('actions'),
            align: "right",
            cell: (company) => (
              <RowActions>
                <RowIconButton label={t('editTitle')} onClick={() => handleOpenEdit(company)}>
                  <Edit2 className="w-4 h-4" />
                </RowIconButton>
                <RowIconButton label={t('deleteAndWipe')} tone="danger" onClick={() => setDeletingCompany(company)}>
                  <Trash2 className="w-4 h-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      {/* Add/Edit Modal */}
      {/*
        Wide, and the fields laid out across it. As a single narrow column
        the seven module cards ran far past the fold: a form of four short
        fields that needed scrolling to reach its own Save button (Anthony,
        2026-08-20). The name, directives and plan take one column; the
        modules take the other and wrap into two of their own on a wide
        screen.
      */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingCompany ? t('editTitle') : t('createTitle')}
        size="lg"
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px]">{editingCompany ? t('editSubtitle') : t('createSubtitle')}</p>
          <ModalFormError>{submitError}</ModalFormError>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-5 md:grid-cols-2 md:items-start">
          <div className="flex flex-col gap-5">
          <ModalField
            label={t('nameLabel')}
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('namePlaceholder')}
          />

          <ModalFormField label={t('promptLabel')} hint={t('promptOptional')}>
            <textarea
              value={formData.systemPrompt}
              onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })}
              className={modalTextareaClassName}
              placeholder={t('promptPlaceholder')}
            />
          </ModalFormField>

          <ModalFormField label={t('planLabel')}>
             <select
                 value={formData.planId}
                 onChange={e => setFormData({ ...formData, planId: e.target.value })}
                 className={modalInputClassName}
              >
                  <option value="">No Plan (Unlimited / System Default)</option>
                  {activePlans.map(plan => (
                     <option key={plan._id} value={plan._id}>
                         {plan.name} {plan.messageLimit === -1 ? '(Unlimited)' : `(${plan.messageLimit} msgs)`} - £{plan.priceGBP}/mo
                     </option>
                  ))}
             </select>
          </ModalFormField>
          </div>

          {COMPANY_MODULES.length > 0 && (
            <ModalFormField label={t('modulesLabel')} hint={t('modulesHint')}>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                {COMPANY_MODULES.map((module) => (
                  <label
                    key={module.key}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-[10px] border border-border-dim bg-background cursor-pointer hover:border-brand/40 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formData.enabledModules.includes(module.key)}
                      onChange={() => toggleModule(module.key)}
                      className="mt-0.5 accent-brand"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[14px] text-foreground">
                        {t(`modules.${module.key}.name`)}
                      </span>
                      <span className="text-[12px] text-secondary">
                        {t(`modules.${module.key}.description`)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </ModalFormField>
          )}
          </div>

          <ModalFormActions
            cancelLabel={tCommon('cancel')}
            submitLabel={isSubmitting ? tCommon('saving') : (editingCompany ? t('editTitle') : t('provisionTenant'))}
            isSubmitting={isSubmitting}
            onCancel={() => setIsAddModalOpen(false)}
          />
        </form>
      </SonaeModal>

      <ConfirmationModal
        isOpen={!!deletingCompany}
        onClose={() => { setDeletingCompany(null); setSubmitError(""); }}
        title={t('deleteTitle')}
        cancelLabel={tCommon('cancel')}
        confirmLabel={isSubmitting ? tCommon('deleting') : t('deleteTenant')}
        isSubmitting={isSubmitting}
        onConfirm={confirmDelete}
        error={submitError}
        warning={{
          title: t('warningCascade'),
          description: t('warningDesc'),
        }}
      >
        <p>
          {t.rich('deleteConfirm', { name: () => <strong className="text-foreground font-semibold">{deletingCompany?.name}</strong> })}
        </p>
      </ConfirmationModal>
    </div>
  );
}
