"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { BrainCircuit, Plus, Trash2, AlertOctagon, RefreshCcw } from "lucide-react";
import Link from "next/link";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useTranslations } from "next-intl";
import { SearchBar } from "@/src/ui/components/screens/Table";
import { AdminRulesTable } from "@/src/app/(dashboard)/admin/_components/AdminRulesTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";

export default function AgentRulesPage() {
  const t = useTranslations("admin.agents.details.rules");
  const params = useParams();
  const agentId = (params?.id as Id<"agents">) || undefined;

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

  const rulesData = useQuery(api.aiRules.getOffsetPaginatedRules, agentId ? {
    agentId,
    searchTerm: debouncedSearch,
    page,
    pageSize
  } : "skip");

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
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* Header Area */}
      <PageHeader
        icon={<BrainCircuit className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <Link
            href={`/admin/agents/${agentId}/rules/new`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t("addButton")}</span>
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
        getRowHref={(rule) => `/admin/agents/${agentId}/rules/${rule._id}`}
        getEditHref={(rule) => `/admin/agents/${agentId}/rules/${rule._id}`}
        onToggleActive={(rule) => toggleActive({ id: rule._id, isActive: !rule.isActive })}
        onDelete={(rule) => setDeleteId(rule._id)}
        labels={{
          priority: "Priority",
          rule: "Rule Name / Trigger",
          status: "Status",
          activate: t("table.tooltips.activate"),
          deactivate: t("table.tooltips.deactivate"),
          edit: t("table.tooltips.edit"),
          delete: t("table.tooltips.delete"),
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
            {/* Raw: bordered rounded-full cancel with a foreground/5 hover — neither ghost nor quiet matches its pixels. */}
            <button
              onClick={() => setDeleteId(null)}
              className="px-5 py-2.5 rounded-full text-[13px] font-medium tracking-wide text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors border border-border-dim"
            >
              {t("deleteModal.abort")}
            </button>
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
