"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { BrainCircuit, Plus, Power, Trash2, Edit2, AlertOctagon, RefreshCcw } from "lucide-react";
import Link from "next/link";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useTranslations } from "next-intl";
import {
  AdminPaginationFooter,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import useDebounce from "@/src/hooks/useDebounce";

export default function AgentRulesPage() {
  const t = useTranslations("admin.agents.details.rules");
  const params = useParams();
  const router = useRouter();
  const agentId = (params?.id as Id<"agents">) || undefined;

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

  const getPriorityColor = (p: string) => {
    if (p === "CRITICAL") return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (p === "HIGH") return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    if (p === "NORMAL") return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    return "text-secondary bg-foreground/5 border-border-dim";
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* Header Area */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BrainCircuit className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">
            {t("subtitle")}
          </p>
        </div>

        <Link
          href={`/admin/agents/${agentId}/rules/new`}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{t("addButton")}</span>
        </Link>
      </header>

      <AdminSearchBar value={searchTerm} onChange={handleSearchChange} placeholder={t("searchPlaceholder")} />

      {/* Listing Area */}
      <AdminTableShell
        footer={
          <AdminPaginationFooter
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={pageSize}
            isLoading={isLoading}
            onPageChange={setPage}
          />
        }
      >
            <thead>
              <tr className="border-b border-border-dim/50 bg-sidebar/40">
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[120px]">Priority</th>
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[250px]">Rule Name / Trigger</th>
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[100px] text-right">Status</th>
                <th className="w-[100px] px-5 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <AdminTableLoadingRow colSpan={4} />
                ) : filteredRules.length === 0 ? (
                  <AdminTableEmptyRow
                    colSpan={4}
                    icon={<BrainCircuit className="w-8 h-8 text-muted/30" />}
                    label={t("empty")}
                  />
                ) : (
                  filteredRules.map((rule) => (
                    <tr 
                      key={rule._id} 
                      onClick={() => router.push(`/admin/agents/${agentId}/rules/${rule._id}`)}
                      className="group hover:bg-white/[0.02] transition-colors items-center cursor-pointer"
                    >
                      <td className="px-5 py-4 align-middle">
                        <div className={`w-max px-2 py-0.5 rounded-[4px] text-[10px] font-bold tracking-[0.1em] uppercase border flex-shrink-0 ${getPriorityColor(rule.priority)}`}>
                          {rule.priority}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <h3 className="text-[13px] font-bold text-foreground group-hover:text-brand transition-colors line-clamp-1">
                          {rule.name || `"${rule.trigger}"`}
                        </h3>
                      </td>
                      <td className="px-5 py-4 align-middle text-right border-r border-white/5">
                         <button
                           onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleActive({ id: rule._id, isActive: !rule.isActive }); }}
                           className="hover:text-foreground transition-colors p-1 flex justify-end w-full"
                           title={rule.isActive ? t("table.tooltips.deactivate") : t("table.tooltips.activate")}
                         >
                           <Power className={`w-4 h-4 ${rule.isActive ? 'text-orange-500' : 'opacity-40'}`} />
                         </button>
                      </td>
                      <td className="px-5 py-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-3 text-secondary">
                          <Link
                            href={`/admin/agents/${agentId}/rules/${rule._id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-foreground transition-colors p-1"
                            title={t("table.tooltips.edit")}
                          >
                            <Edit2 className="w-4 h-4 opacity-70 hover:opacity-100" />
                          </Link>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteId(rule._id); }}
                            className="transition-colors group/trash p-1"
                            title={t("table.tooltips.delete")}
                          >
                            <Trash2 className="w-4 h-4 text-rose-500/60 group-hover/trash:text-rose-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
            </tbody>
      </AdminTableShell>

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
            <button
              onClick={() => setDeleteId(null)}
              className="px-5 py-2.5 rounded-full text-[13px] font-medium tracking-wide text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors border border-border-dim"
            >
              {t("deleteModal.abort")}
            </button>
            <button
              onClick={handleDeleteRule}
              disabled={isDeleting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-medium tracking-wide bg-rose-500 hover:bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all disabled:opacity-50"
            >
              {isDeleting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>{t("deleteModal.confirm")}</span>
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
