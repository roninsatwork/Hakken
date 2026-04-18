"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { BrainCircuit, Plus, Loader2, Power, Trash2, Edit2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function CompanyAiRulesPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;
  
  const toggleActive = useMutation(api.aiRules.toggleRuleActive);
  const deleteRuleMutation = useMutation(api.aiRules.deleteRule);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

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
      
      {/* Control Bar */}
      <div className="w-full flex items-center justify-between p-2 bg-card/40 backdrop-blur-xl border border-border-dim rounded-[16px] shadow-sm">
        <div className="flex items-center gap-2 px-3 flex-1">
          <Search className="w-4 h-4 text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search triggers or instructions..."
            className="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground"
          />
        </div>
      </div>
      
      {/* Listing Area */}
      <div className="flex flex-col gap-0 border border-border-dim/80 bg-sidebar/20 rounded-[16px] overflow-hidden shadow-sm relative w-full">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
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
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center text-secondary">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand opacity-80" />
                    </td>
                  </tr>
                ) : filteredRules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                       <div className="flex flex-col items-center justify-center gap-4 w-full">
                         <BrainCircuit className="w-8 h-8 text-muted/30" />
                         <span className="text-muted text-[13px] font-medium tracking-widest uppercase">No Rules Yet</span>
                       </div>
                    </td>
                  </tr>
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
          </table>
        </div>

        {/* Numbered Pagination Footer */}
        <div className="w-full p-4 border-t border-border-dim/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-sidebar/40">
          <div className="text-[12px] font-medium text-secondary">
            {totalCount > 0 ? (
              <span>Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}</span>
            ) : (
              <span>No entries found</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <div className="flex items-center justify-center min-w-[100px] text-[12px] font-medium tracking-wide">
              Page {page} of {totalPages}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
