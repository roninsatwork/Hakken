"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { lazy, Suspense, useState } from "react";
import {
  Building2,
  Plus,
  Trash2,
  Edit2,
} from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import {
  PageHeader,
  PagePrimaryAction,
} from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { toneForStatus } from "@/src/ui/components/screens/statusTone";
import {
  TABLE_PAGE_SIZE,
} from "@/src/ui/components/screens/pagination";
import { useScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";
import { useRunFormat } from "@/src/app/(dashboard)/admin/companies/[id]/websites/runs/runFormat";

const loadDeleteCompanyDialog = () => import("./DeleteCompanyDialog");
const DeleteCompanyDialog = lazy(() =>
  loadDeleteCompanyDialog().then((module) => ({ default: module.DeleteCompanyDialog })),
);

/**
 * A company's data collection, from `companies.getPaginatedCompanies`: its
 * switch and schedule, its newest collection, and when its work is next sent
 * — after the Planner's run and then the Collector's, not at the company's own
 * time, since that wakes nothing (2026-09-25).
 */
type CompanyCollection = {
  isActive: boolean;
  intervalStr: string | null;
  last: { startedAt: number; status: string } | null;
  nextAt: number | null;
  nextWhy: "OFF" | "NOT_SCHEDULED" | null;
};

type CompanyRow = Doc<"companies"> & { userCount: number; userCountIsCapped?: boolean; collection: CompanyCollection };

export default function CompaniesPage() {
  const router = useRouter();
  const t = useTranslations('admin.companies');
  // A collection's status in the words its own Collection runs screens use.
  const tCollection = useTranslations("admin.seoCollection");
  const scheduleSummary = useScheduleSummary();
  const { when } = useRunFormat();
  const action = useAdminAction({ scope: "admin-companies" });
  const deleteCompany = useMutation(api.companies.deleteCompany);

  const [searchTerm, setSearchTerm] = useState("");
  const [deletingCompany, setDeletingCompany] = useState<CompanyRow | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [dialogActivated, setDialogActivated] = useState(false);
  const isSubmitting = action.isBusy();

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

  const confirmDelete = async () => {
    if (!deletingCompany) return;
    setSubmitError("");
    const outcome = await action.run(() => deleteCompany({ id: deletingCompany._id }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.deleteFailed"),
    });
    if (outcome.ok) setDeletingCompany(null);
    else setSubmitError(outcome.message);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<Building2 className="w-6 h-6 text-brand" />}
        title={t('title')}
        description={t('subtitle')}
        action={
          <PagePrimaryAction variant="brand" icon={<Plus className="w-4 h-4" />} onClick={() => router.push("/admin/companies/new")}>
            {t('newCompany')}
          </PagePrimaryAction>
        }
      />

      {/* Table */}
      <DataTable
        rows={isLoading ? undefined : paginatedCompanies}
        rowKey={(company) => company._id}
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
            key: "collection",
            header: t('collection'),
            cell: (company) => (
              <span className="flex flex-col gap-1.5">
                <StatusLabel tone={company.collection.isActive ? "success" : "neutral"}>
                  {company.collection.isActive ? t('collectionOn') : t('collectionOff')}
                </StatusLabel>
                {company.collection.intervalStr ? (
                  <span className="text-[12px] text-secondary">{scheduleSummary(company.collection.intervalStr)}</span>
                ) : null}
              </span>
            ),
          },
          {
            key: "lastCollection",
            header: t('lastCollection'),
            cell: (company) => company.collection.last ? (
              <span className="flex flex-col gap-1.5">
                <span className="text-[12px] text-foreground">{when(company.collection.last.startedAt)}</span>
                <StatusLabel tone={toneForStatus(company.collection.last.status)}>
                  {tCollection(`status.${company.collection.last.status}`)}
                </StatusLabel>
              </span>
            ) : (
              <span className="text-[12px] text-secondary">{t('neverCollected')}</span>
            ),
          },
          {
            key: "nextCollection",
            header: t('nextCollection'),
            cell: (company) => company.collection.nextAt !== null ? (
              <span className="text-[12px] text-foreground">{when(company.collection.nextAt)}</span>
            ) : (
              <span className="text-[12px] text-secondary">
                {company.collection.nextWhy === "NOT_SCHEDULED" ? t('notScheduled') : t('collectionOff')}
              </span>
            ),
          },
          {
            key: "users",
            header: t('assignedUsers'),
            cell: (company) => (
              <TagLabel>
                {t('users', { count: company.userCount || 0 })}{company.userCountIsCapped ? "+" : ""}
              </TagLabel>
            ),
          },
          {
            key: "actions",
            header: t('actions'),
            align: "right",
            cell: (company) => (
              <RowActions>
                {/* Its Overview tab edits its name and plan (add-company-page-plan.md, AC5). */}
                <RowIconButton label={t('editTitle')} onClick={() => router.push(`/admin/companies/${company._id}/overview`)}>
                  <Edit2 className="w-4 h-4" />
                </RowIconButton>
                <RowIconButton label={t('deleteAndWipe')} tone="danger" onClick={() => {
                  void loadDeleteCompanyDialog();
                  setDialogActivated(true);
                  setDeletingCompany(company);
                }}>
                  <Trash2 className="w-4 h-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      {dialogActivated ? (
        <Suspense fallback={null}>
          <DeleteCompanyDialog
            companyName={deletingCompany?.name ?? null}
            isSubmitting={isSubmitting}
            error={submitError}
            onClose={() => {
              setDeletingCompany(null);
              setSubmitError("");
            }}
            onConfirm={confirmDelete}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
