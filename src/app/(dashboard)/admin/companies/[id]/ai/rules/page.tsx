"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { BrainCircuit, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { SearchBar } from "@/src/ui/components/screens/Table";
import { AdminRulesTable } from "@/src/app/(dashboard)/admin/_components/AdminRulesTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useTranslations } from "next-intl";

const loadCompanyRuleDeleteDialog = () => import("./CompanyRuleDeleteDialog");
const CompanyRuleDeleteDialog = dynamic(() =>
  loadCompanyRuleDeleteDialog().then((module) => module.CompanyRuleDeleteDialog),
);

export default function CompanyAiRulesPage() {
  const t = useTranslations("admin.companyDetails.rules");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const toggleActive = useMutation(api.aiRules.toggleRuleActive);
  const deleteRuleMutation = useMutation(api.aiRules.deleteRule);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const pageSize = TABLE_PAGE_SIZE;
  const [deleteId, setDeleteId] = useState<Id<"aiRules"> | null>(null);
  const [hasOpenedDeleteDialog, setHasOpenedDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const rulesData = useQuery(api.aiRules.getOffsetPaginatedRules, {
    companyId,
    searchTerm: debouncedSearch,
    page,
    pageSize
  });

  const isLoading = rulesData === undefined;
  const filteredRules = rulesData?.data || [];
  const totalCount = rulesData?.totalCount || 0;
  const totalPages = rulesData?.totalPages || 1;

  const handleDeleteRule = async () => {
    if (!deleteId || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteRuleMutation({ id: deleteId });
      setDeleteId(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      <PageHeader
        icon={<BrainCircuit className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <Link
            href={`/admin/companies/${companyId}/ai/rules/new`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t("createRule")}</span>
          </Link>
        }
      />

      <SearchBar value={searchTerm} onChange={handleSearchChange} placeholder={t("searchPlaceholder")} />
      
      <AdminRulesTable
        rules={filteredRules}
        isLoading={isLoading}
        emptyIcon={<BrainCircuit className="w-8 h-8 text-muted/30" />}
        emptyLabel={t("empty")}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={setPage}
        getRowHref={(rule) => `/admin/companies/${companyId}/ai/rules/${rule._id}`}
        getEditHref={(rule) => `/admin/companies/${companyId}/ai/rules/${rule._id}`}
        onToggleActive={(rule) => toggleActive({ id: rule._id, isActive: !rule.isActive })}
        onDelete={(rule) => {
          void loadCompanyRuleDeleteDialog();
          setHasOpenedDeleteDialog(true);
          setDeleteId(rule._id);
        }}
        labels={{
          priority: t("columnPriority"),
          rule: t("columnRule"),
          status: t("columnStatus"),
          activate: t("activate"),
          deactivate: t("deactivate"),
          edit: t("edit"),
          delete: t("delete"),
        }}
      />

      {hasOpenedDeleteDialog ? (
        <CompanyRuleDeleteDialog
          isOpen={deleteId !== null}
          isDeleting={isDeleting}
          onClose={() => !isDeleting && setDeleteId(null)}
          onConfirm={handleDeleteRule}
        />
      ) : null}
    </div>
  );
}
