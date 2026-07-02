"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { AlertOctagon, BrainCircuit, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { AdminSearchBar } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { AdminRulesTable } from "@/src/app/(dashboard)/admin/_components/AdminRulesTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { CompanyAiSectionNav } from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiSectionNav";
import useDebounce from "@/src/hooks/useDebounce";

export default function CompanyAiRulesPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const toggleActive = useMutation(api.aiRules.toggleRuleActive);
  const deleteRuleMutation = useMutation(api.aiRules.deleteRule);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const pageSize = ADMIN_PAGE_SIZE;
  const [deleteId, setDeleteId] = useState<Id<"aiRules"> | null>(null);
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
      {/* Header Area */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BrainCircuit className="w-6 h-6 text-brand" />
            AI Rules
          </h1>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">
            Set rules for how the AI responds to users.
          </p>
        </div>

        <Link
          href={`/admin/companies/${companyId}/ai/rules/new`}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Create Rule</span>
        </Link>
      </header>

      <CompanyAiSectionNav />
      
      <AdminSearchBar value={searchTerm} onChange={handleSearchChange} placeholder="Search triggers or instructions..." />
      
      <AdminRulesTable
        rules={filteredRules}
        isLoading={isLoading}
        emptyIcon={<BrainCircuit className="w-8 h-8 text-muted/30" />}
        emptyLabel="No Rules Yet"
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={setPage}
        getRowHref={(rule) => `/admin/companies/${companyId}/ai/rules/${rule._id}`}
        getEditHref={(rule) => `/admin/companies/${companyId}/ai/rules/${rule._id}`}
        onToggleActive={(rule) => toggleActive({ id: rule._id, isActive: !rule.isActive })}
        onDelete={(rule) => setDeleteId(rule._id)}
        labels={{
          priority: "Priority",
          rule: "Rule Name / Trigger",
          status: "Status",
          activate: "Activate",
          deactivate: "Deactivate",
          edit: "Edit",
          delete: "Delete",
        }}
      />

      <SonaeModal
        isOpen={deleteId !== null}
        onClose={() => !isDeleting && setDeleteId(null)}
        title="Delete Rule"
        size="sm"
      >
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <AlertOctagon className="w-12 h-12 text-rose-500 mb-2 opacity-80" />
            <p className="text-[14px] text-secondary leading-relaxed">
              This rule will be removed from the workspace rule set.
            </p>
            <p className="text-[13px] font-bold text-foreground mt-2">
              This action cannot be undone.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-dim">
            <button
              onClick={() => setDeleteId(null)}
              disabled={isDeleting}
              className="px-5 py-2.5 rounded-full text-[13px] font-medium tracking-wide text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors border border-border-dim disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteRule}
              disabled={isDeleting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-medium tracking-wide bg-rose-500 hover:bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all disabled:opacity-50"
            >
              {isDeleting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>Delete Rule</span>
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
