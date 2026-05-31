"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  Loader2,
  Trash2,
  CheckCircle2,
  XCircle,
  ArrowRight
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import useDebounce from "@/src/hooks/useDebounce";

export default function AgentLogsDashboard() {
  const t = useTranslations("admin.agents.details.logs");
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as Id<"agents">;

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const pageSize = ADMIN_PAGE_SIZE;

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const queryParams = {
    agentId,
    searchTerm: debouncedSearch,
    page,
    pageSize
  };

  const logData = useQuery(api.agentLogs.getOffsetPaginated, queryParams);
  const deleteLogMutation = useMutation(api.agentLogs.deleteLog);

  const handleDelete = async (logId: Id<"agentLogs">) => {
    try {
      await deleteLogMutation({ id: logId });
    } catch (e) {
      console.error("Failed to delete log", e);
    }
  };



  const isLoading = logData === undefined;
  const logs = (logData?.data || []) as Doc<"agentLogs">[];
  const totalCount = logData?.totalCount || 0;
  const totalPages = logData?.totalPages || 1;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 pb-12 w-full max-w-[1400px]">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border-dim/50 pb-6 w-full mt-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            {t("title")}
          </h2>
          <p className="text-[14px] text-secondary max-w-2xl">
            {t("subtitle")}
          </p>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-3 relative w-full md:w-[350px]">
          <Search className="w-4 h-4 text-muted absolute left-4" />
          <input
            type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-sidebar/50 border border-border-dim rounded-full py-2.5 pl-11 pr-4 text-[13px] text-foreground placeholder:text-muted outline-none transition-all focus:border-indigo-500/50 focus:bg-sidebar shadow-sm"
          />
        </div>
      </header>

      {/* Logs Table Container */}
      <div className="flex flex-col gap-0 border border-border-dim/80 bg-sidebar/20 rounded-[16px] overflow-hidden shadow-sm relative w-full">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-border-dim/50 bg-sidebar/40">
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[180px]">{t("table.headers.timestamp")}</th>
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[150px]">{t("table.headers.status")}</th>
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase">{t("table.headers.event")}</th>
                <th className="px-5 py-3.5 text-[11px] font-mono tracking-widest text-muted uppercase w-[180px] text-right">{t("table.headers.report")}</th>
                <th className="w-[60px] px-5 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-secondary">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500 opacity-80" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 w-full">
                      <DatabaseZap className="w-8 h-8 text-muted/30" />
                      <div className="flex flex-col gap-1 items-center">
                        <span className="text-[14px] font-medium text-foreground tracking-wide">
                          {debouncedSearch ? t("table.empty.search") : t("table.empty.index")}
                        </span>
                        <span className="text-muted text-[12px]">
                          {debouncedSearch ? t("table.empty.tryDifferent") : t("table.empty.notIntercepted")}
                        </span>
                      </div>


                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isFailed = log.interactionType.toUpperCase().includes("ERROR") || log.interactionType.toUpperCase().includes("FAIL");
                  return (
                    <tr 
                      key={log._id} 
                      onClick={() => router.push(`/admin/agents/${agentId}/logs/${log._id}`)}
                      className="group hover:bg-white/[0.02] transition-colors items-center cursor-pointer"
                    >
                      <td className="px-5 py-4 align-middle">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-bold text-foreground tracking-wide">
                            {new Date(log.createdAt).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-[11px] font-mono tracking-widest text-muted">
                            {new Date(log.createdAt).toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        {isFailed ? (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-[0.1em] text-rose-500 w-max px-2 py-1 rounded-[6px] border bg-rose-500/10 border-rose-500/20">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>FAILED</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-[0.1em] text-[#10b981] w-max px-2 py-1 rounded-[6px] border bg-[#10b981]/10 border-[#10b981]/20">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>SUCCESS</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <span className="text-[13px] font-bold text-secondary/90 tracking-wide uppercase font-mono">
                          {log.interactionType}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5 text-[11px] font-bold tracking-widest text-indigo-400 group-hover:text-indigo-300 transition-colors uppercase">
                          <span>View Trace</span>
                          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </td>
                      <td className="px-5 py-4 align-middle text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(log._id);
                          }}
                          className="text-muted hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Numbered Pagination Footer */}
        <div className="w-full p-4 border-t border-border-dim/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-sidebar/40">
          <div className="text-[12px] font-medium text-secondary">
            {totalCount > 0 ? (
              <span>{t("pagination.showing", { start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, totalCount), total: totalCount })}</span>
            ) : (
              <span>{t("pagination.none")}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("pagination.prev")}
            </button>

            <div className="flex items-center justify-center min-w-[100px] text-[12px] font-medium tracking-wide">
              {t("pagination.pageOf", { current: page, total: totalPages })}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-foreground border border-transparent hover:border-border-dim"
            >
              {t("pagination.next")}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
