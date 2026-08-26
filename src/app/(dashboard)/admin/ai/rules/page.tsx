"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import dynamic from "next/dynamic";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  BrainCircuit,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SearchBar } from "@/src/ui/components/screens/Table";
import { AdminRulesTable } from "@/src/app/(dashboard)/admin/_components/AdminRulesTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";

const loadRuleDeleteDialog = () =>
  import("./RuleDeleteDialog").then((module) => module.RuleDeleteDialog);

const RuleDeleteDialog = dynamic(loadRuleDeleteDialog);

export default function RulesDashboard() {
  const t = useTranslations("ai.rules");
  const toggleActive = useMutation(api.aiRules.toggleRuleActive);
  const deleteRuleMutation = useMutation(api.aiRules.deleteRule);
  const action = useAdminAction({ scope: "admin-ai-rules" });

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const pageSize = TABLE_PAGE_SIZE;

  const [deleteId, setDeleteId] = useState<Id<"aiRules"> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const rulesData = useQuery(api.aiRules.getOffsetPaginatedRules, {
    searchTerm: debouncedSearch,
    page,
    pageSize
  });

  const isLoading = rulesData === undefined;
  const filteredRules = rulesData?.data || [];
  const totalCount = rulesData?.totalCount || 0;
  const totalPages = rulesData?.totalPages || 1;

  const handleDeleteRule = async () => {
    if (!deleteId || action.isBusy()) return;
    const outcome = await action.run(() => deleteRuleMutation({ id: deleteId }), {
      fallbackMessage: t("deleteFailed"),
    });
    if (outcome.ok) setDeleteId(null);
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      {/* Header Area */}
      <PageHeader
        icon={<BrainCircuit className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        divider
        action={
          <Link
            href="/admin/ai/rules/new"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t("addRule")}</span>
          </Link>
        }
      />

      <AiWorkspaceNav />

      <SearchBar value={searchTerm} onChange={handleSearchChange} placeholder={t("searchPlaceholder")} />

      <AdminRulesTable
        rules={filteredRules}
        isLoading={isLoading}
        emptyIcon={<BrainCircuit className="w-8 h-8 text-muted/30" />}
        emptyLabel={t("status.noRules")}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={setPage}
        getRowHref={(rule) => `/admin/ai/rules/${rule._id}`}
        getEditHref={(rule) => `/admin/ai/rules/${rule._id}`}
        onToggleActive={(rule) => {
          void action.run(() => toggleActive({ id: rule._id, isActive: !rule.isActive }), {
            key: rule._id,
            fallbackMessage: t("toggleFailed"),
          });
        }}
        onDelete={(rule) => {
          void loadRuleDeleteDialog();
          setDeleteId(rule._id);
        }}
        labels={{
          priority: t("table.priority"),
          rule: t("table.rule"),
          status: t("table.status"),
          activate: t("status.activate"),
          deactivate: t("status.deactivate"),
          edit: t("status.edit"),
          delete: t("status.delete"),
        }}
      />

      {deleteId !== null && (
        <RuleDeleteDialog
          isDeleting={action.isBusy()}
          onClose={() => setDeleteId(null)}
          onConfirm={handleDeleteRule}
          labels={{
            abort: t("deleteModal.abort"),
            confirm: t("deleteModal.confirm"),
            description: t("deleteModal.description"),
            title: t("deleteModal.title"),
            warning: t("deleteModal.warning"),
          }}
        />
      )}
    </div>
  );
}
