"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  BrainCircuit,
  Plus,
  Trash2,
  AlertOctagon,
  RefreshCcw,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/atoms/Button";
import { SearchBar } from "@/src/ui/components/screens/Table";
import { AdminRulesTable } from "@/src/app/(dashboard)/admin/_components/AdminRulesTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";

export default function RulesDashboard() {
  const t = useTranslations("ai.rules");
  const toggleActive = useMutation(api.aiRules.toggleRuleActive);
  const deleteRuleMutation = useMutation(api.aiRules.deleteRule);

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const pageSize = TABLE_PAGE_SIZE;

  const [deleteId, setDeleteId] = useState<Id<"aiRules"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    if (!deleteId || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteRuleMutation({ id: deleteId });
      setDeleteId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
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
        onToggleActive={(rule) => toggleActive({ id: rule._id, isActive: !rule.isActive })}
        onDelete={(rule) => setDeleteId(rule._id)}
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

      {/* Restricted Deletion Sonae Modal */}
      <SonaeModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title={t("deleteModal.title")}
        size="sm"
      >
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <AlertOctagon className="w-12 h-12 text-rose-500 mb-2 opacity-80" />
            <p className="text-[14px] text-secondary leading-relaxed">
              {t("deleteModal.description")}
            </p>
            <p className="text-[13px] font-bold text-foreground mt-2">
              {t("deleteModal.warning")}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-dim">
            <Button
              variant="quiet"
              onClick={() => setDeleteId(null)}
              className="px-5 py-2.5 rounded-full text-[13px] tracking-wide bg-transparent hover:bg-foreground/5"
            >
              {t("deleteModal.abort")}
            </Button>
            <WriteButton
              onClick={handleDeleteRule}
              disabled={isDeleting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-medium tracking-wide bg-rose-500 hover:bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all disabled:opacity-50"
            >
              {isDeleting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>{t("deleteModal.confirm")}</span>
            </WriteButton>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
