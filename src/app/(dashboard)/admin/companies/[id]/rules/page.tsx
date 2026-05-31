"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { BrainCircuit, Plus, Power, Trash2, Edit2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AdminPaginationFooter,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import useDebounce from "@/src/hooks/useDebounce";

export default function CompanyAiRulesPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;
  
  const toggleActive = useMutation(api.aiRules.toggleRuleActive);
  const deleteRuleMutation = useMutation(api.aiRules.deleteRule);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const pageSize = ADMIN_PAGE_SIZE;

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

  const getPriorityColor = (p: string) => {
    if (p === "CRITICAL") return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (p === "HIGH") return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    if (p === "NORMAL") return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    return "text-secondary bg-foreground/5 border-border-dim";
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
          href={`/admin/companies/${companyId}/rules/new`}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Create Rule</span>
        </Link>
      </header>
      
      <AdminSearchBar value={searchTerm} onChange={handleSearchChange} placeholder="Search triggers or instructions..." />
      
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
                    label="No Rules Yet"
                  />
                ) : (
                  filteredRules.map((rule) => (
                    <tr 
                      key={rule._id} 
                      onClick={() => router.push(`/admin/companies/${companyId}/rules/${rule._id}`)}
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
                         >
                           <Power className={`w-4 h-4 ${rule.isActive ? 'text-orange-500' : 'opacity-40'}`} />
                         </button>
                      </td>
                      <td className="px-5 py-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-3 text-secondary">
                          <Link
                            href={`/admin/companies/${companyId}/rules/${rule._id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-foreground transition-colors p-1"
                          >
                            <Edit2 className="w-4 h-4 opacity-70 hover:opacity-100" />
                          </Link>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteRuleMutation({ id: rule._id }); }}
                            className="transition-colors group/trash p-1"
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
    </div>
  );
}
