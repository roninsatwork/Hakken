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
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AdminPageHeader,
  AdminPagePrimaryAction,
} from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminPaginationFooter,
  AdminRowActions,
  AdminRowIconButton,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import {
  ADMIN_PAGE_SIZE,
  matchesAdminSearchTerm,
  paginateAdminItems,
} from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDate } from "@/src/lib/dates";

type CompanyRow = Doc<"companies"> & { userCount: number };
type CompanyFormData = { name: string; systemPrompt: string; planId: string };

export default function CompaniesPage() {
  const router = useRouter();
  const t = useTranslations('admin.companies');
  const tCommon = useTranslations('common');
  const companiesData = useQuery(api.companies.getCompanies) as CompanyRow[] | undefined;
  const companies = companiesData || [];
  const createCompany = useMutation(api.companies.createCompany);
  const updateCompany = useMutation(api.companies.updateCompany);
  const deleteCompany = useMutation(api.companies.deleteCompany);
  const assignPlanToCompany = useMutation(api.companies.assignPlanToCompany);
  const activePlans = (useQuery(api.plans.getActivePlans) || []) as Doc<"plans">[];

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyRow | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<CompanyRow | null>(null);

  const [formData, setFormData] = useState<CompanyFormData>({ name: "", systemPrompt: "", planId: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = ADMIN_PAGE_SIZE;
  const isLoading = companiesData === undefined;

  const filteredCompanies = companies.filter((c) =>
    matchesAdminSearchTerm(searchTerm, [c.name])
  );

  const {
    items: paginatedCompanies,
    totalItems,
    totalPages,
  } = paginateAdminItems(filteredCompanies, currentPage, itemsPerPage);

  const handleSearch = (v: string) => {
    setSearchTerm(v);
    setCurrentPage(1);
  };

  const handleOpenAdd = () => {
    setFormData({ name: "", systemPrompt: "", planId: "" });
    setEditingCompany(null);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (company: CompanyRow) => {
    setFormData({ name: company.name, systemPrompt: company.systemPrompt || "", planId: company.planId || "" });
    setEditingCompany(company);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingCompany) {
        await updateCompany({ id: editingCompany._id, name: formData.name, systemPrompt: formData.systemPrompt });
        if (formData.planId) await assignPlanToCompany({ id: editingCompany._id, planId: formData.planId as Id<"plans"> });
        else await assignPlanToCompany({ id: editingCompany._id, planId: undefined });
      } else {
        const newCompanyId = await createCompany({ name: formData.name, systemPrompt: formData.systemPrompt });
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
      <AdminPageHeader
        icon={<Building2 className="w-6 h-6 text-brand" />}
        title={t('title')}
        description={t('subtitle')}
        action={
          <AdminPagePrimaryAction icon={<Plus className="w-4 h-4" />} onClick={handleOpenAdd}>
            {t('newCompany')}
          </AdminPagePrimaryAction>
        }
      />

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
              empty: t('emptyState'),
              showing: (start, end, total) => `${t('showing')} ${start} ${t('to')} ${end} ${t('of')} ${total} ${t('companies')}`,
            }}
          />
        }
        minWidthClassName="min-w-[800px]"
      >
            <thead>
              <AdminTableHeaderRow>
                <AdminTableHeaderCell>{t('tenantName')}</AdminTableHeaderCell>
                <AdminTableHeaderCell>{t('provisionedDate')}</AdminTableHeaderCell>
                <AdminTableHeaderCell>{t('assignedUsers')}</AdminTableHeaderCell>
                <AdminTableHeaderCell align="right">{t('actions')}</AdminTableHeaderCell>
              </AdminTableHeaderRow>
            </thead>
            <tbody>
              <AnimatePresence>
                {isLoading ? (
                  <AdminTableLoadingRow colSpan={4} />
                ) : paginatedCompanies.length === 0 ? (
                  <AdminTableEmptyRow
                    colSpan={4}
                    icon={<Building2 className="w-8 h-8 text-muted/30" />}
                    label={t('emptyState')}
                  />
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
                          {formatDate(company.createdAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                            <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                              {t('users', { count: company.userCount || 0 })}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <AdminRowActions>
                            <AdminRowIconButton label={t('editTitle')} onClick={() => handleOpenEdit(company)}>
                              <Edit2 className="w-4 h-4" />
                            </AdminRowIconButton>
                            <AdminRowIconButton label="Delete Company & Wipe Data" tone="danger" onClick={() => setDeletingCompany(company)}>
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

      {/* Add/Edit Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingCompany ? t('editTitle') : t('createTitle')}
      >
        <div className="flex flex-col gap-2 mb-6">
          <p className="text-secondary text-[15px]">{editingCompany ? t('editSubtitle') : t('createSubtitle')}</p>
          {submitError && <p className="text-red-500 text-[13px] font-medium">{submitError}</p>}
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-secondary tracking-wide">{t('nameLabel')}</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              placeholder={t('namePlaceholder')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-secondary tracking-wide">{t('promptLabel')}</label>
              <span className="text-[11px] text-muted">{t('promptOptional')}</span>
            </div>
            <textarea
              value={formData.systemPrompt}
              onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm min-h-[120px] resize-y custom-scrollbar leading-relaxed"
              placeholder={t('promptPlaceholder')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-secondary tracking-wide">Subscription Plan</label>
            </div>
             <select
                 value={formData.planId}
                 onChange={e => setFormData({ ...formData, planId: e.target.value })}
                 className="px-4 py-3 bg-background border border-border-dim rounded-[10px] text-foreground focus:border-brand/50 outline-none transition-all text-sm"
              >
                  <option value="">No Plan (Unlimited / System Default)</option>
                  {activePlans.map(plan => (
                     <option key={plan._id} value={plan._id}>
                         {plan.name} {plan.messageLimit === -1 ? '(Unlimited)' : `(${plan.messageLimit} msgs)`} - £{plan.priceGBP}/mo
                     </option>
                  ))}
             </select>
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
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-sm disabled:opacity-50"
            >
              {isSubmitting ? tCommon('saving') : (editingCompany ? t('editTitle') : t('provisionTenant'))}
            </button>
          </div>
        </form>
      </SonaeModal>

      {/* Delete Confirmation Modal */}
      <SonaeModal
        isOpen={!!deletingCompany}
        onClose={() => { setDeletingCompany(null); setSubmitError(""); }}
        title={t('deleteTitle')}
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>
            {t.rich('deleteConfirm', { name: () => <strong className="text-foreground font-semibold">{deletingCompany?.name}</strong> })}
          </p>
          <div className="bg-red-500/10 border border-red-500/20 rounded-[10px] p-4 text-red-500/90 text-[13px]">
            <strong className="font-semibold block mb-1 uppercase tracking-widest text-[11px]">{t('warningCascade')}</strong>
            {t('warningDesc')}
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
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20 disabled:opacity-50"
          >
            {isSubmitting ? tCommon('deleting') : t('deleteTenant')}
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
