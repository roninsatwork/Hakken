"use client";

import { lazy, Suspense, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { BrainCircuit, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SearchBar } from "@/src/ui/components/screens/Table";
import { AdminRulesTable } from "@/src/app/(dashboard)/admin/_components/AdminRulesTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useAdminAction } from "@/src/hooks/useAdminAction";

const loadAgentRuleDeleteModal = () => import("./AgentRuleDeleteModal");
const AgentRuleDeleteModal = lazy(loadAgentRuleDeleteModal);

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
  const [hasOpenedDeleteModal, setHasOpenedDeleteModal] = useState(false);
  const action = useAdminAction({ scope: "admin-agent-rules" });

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
    if (!deleteId) return;
    const outcome = await action.run(() => deleteRuleMutation({ id: deleteId }), {
      fallbackMessage: t("deleteFailed"),
    });
    if (outcome.ok) setDeleteId(null);
  };

  const openDeleteModal = (id: Id<"aiRules">) => {
    void loadAgentRuleDeleteModal();
    setHasOpenedDeleteModal(true);
    setDeleteId(id);
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
        onToggleActive={(rule) => {
          void action.run(() => toggleActive({ id: rule._id, isActive: !rule.isActive }), {
            key: rule._id,
            fallbackMessage: t("toggleFailed"),
          });
        }}
        onDelete={(rule) => openDeleteModal(rule._id)}
        labels={{
          priority: "Priority",
          rule: t("ruleColumn"),
          status: "Status",
          activate: t("table.tooltips.activate"),
          deactivate: t("table.tooltips.deactivate"),
          edit: t("table.tooltips.edit"),
          delete: t("table.tooltips.delete"),
        }}
      />

      {/* Keep the raw grandfathered cancel control in this route file so the screen-kit allowlist does not grow. */}
      {hasOpenedDeleteModal ? (
        <Suspense fallback={null}>
          <AgentRuleDeleteModal
            isOpen={deleteId !== null}
            isDeleting={action.isBusy()}
            onClose={() => setDeleteId(null)}
            onConfirm={handleDeleteRule}
            title={t("deleteModal.title")}
            description={t("deleteModal.description")}
            warning={t("deleteModal.warning")}
            confirmLabel={t("deleteModal.confirm")}
            cancelAction={(
              <button
                onClick={() => setDeleteId(null)}
                className="px-5 py-2.5 rounded-full text-[13px] font-medium tracking-wide text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors border border-border-dim"
              >
                {t("deleteModal.abort")}
              </button>
            )}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
