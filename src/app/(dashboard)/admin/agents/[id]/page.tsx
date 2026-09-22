"use client";

import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Loader2,
  Database,
  TerminalSquare,
  Zap,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { useState } from "react";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDate, formatTime } from "@/src/lib/dates";

export default function AgentDashboard() {
  const t = useTranslations("admin.agents.details.dashboard");
  const params = useParams();
  const agentId = params.id as Id<"agents">;

  const activeModels = (useQuery(api.aiModels.getActiveModels, {}) || []) as Doc<"aiModels">[];

  const stats = useQuery(api.agentTransactions.getStatsForAgent, { agentId });

  const { results, status, loadMore } = usePaginatedQuery(
    api.agentTransactions.getForAgent,
    { agentId },
    { initialNumItems: TABLE_PAGE_SIZE }
  );

  const [runSearch, setRunSearch] = useState("");

  /*
    Narrows the runs already fetched rather than asking the server, because the
    transactions query takes no search argument. Enough to find a run you can
    see; it will not reach back through pages you have not loaded.
  */
  const runNeedle = runSearch.trim().toLowerCase();
  const matchedRuns = runNeedle
    ? results.filter((tx) =>
        `${tx.actionContext ?? ""} ${tx.modelUsed ?? ""}`.toLowerCase().includes(runNeedle))
    : results;

  const pagedRuns = usePagedRows(matchedRuns, {
    canLoadMore: status === "CanLoadMore",
    loadMore,
    resetKey: runSearch,
  });



  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 pb-12 w-full">
      <header className="flex flex-col gap-2 border-b border-border-dim/50 pb-6 w-full mt-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand" />
          {t("title")}
        </h2>
        <p className="text-[14px] text-secondary">
          {t("subtitle")}
        </p>
      </header>

      {/* Analytics Summary Shells (Mocked for now) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-2 p-5 rounded-[14px] bg-sidebar/40 border border-border-dim/60 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-[40px] rounded-full pointer-events-none group-hover:bg-brand/10 transition-colors" />
          <div className="flex items-center gap-2 text-[12px] font-medium tracking-widest text-muted uppercase">
            <Zap className="w-3.5 h-3.5" /> {t("stats.generations")}
          </div>
          <div className="text-3xl font-bold text-foreground font-mono mt-1">
            {stats === undefined ? <Loader2 className="w-5 h-5 animate-spin text-muted/50 mt-1" /> : stats.totalGenerations.toLocaleString()}
          </div>
        </div>
        <div className="flex flex-col gap-2 p-5 rounded-[14px] bg-sidebar/40 border border-border-dim/60 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[40px] rounded-full pointer-events-none group-hover:bg-indigo-500/10 transition-colors" />
          <div className="flex items-center gap-2 text-[12px] font-medium tracking-widest text-muted uppercase">
            <Database className="w-3.5 h-3.5" /> {t("stats.tokens")}
          </div>
          <div className="text-3xl font-bold text-foreground font-mono mt-1 flex flex-col gap-1">
            {stats === undefined ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted/50 mt-1" />
            ) : (
              <>
                <span>
                  {stats.totalTokensIngested > 1000
                    ? (stats.totalTokensIngested / 1000).toFixed(1) + 'k'
                    : stats.totalTokensIngested.toLocaleString()}
                </span>
                <span className="text-[10px] tracking-widest font-mono text-muted/80 uppercase">
                  {stats.totalInputTokens.toLocaleString()} IN • {stats.totalOutputTokens.toLocaleString()} OUT
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 p-5 rounded-[14px] bg-sidebar/40 border border-border-dim/60 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[40px] rounded-full pointer-events-none group-hover:bg-amber-500/10 transition-colors" />
          <div className="flex items-center gap-2 text-[12px] font-medium tracking-widest text-muted uppercase">
            <TerminalSquare className="w-3.5 h-3.5" /> {t("stats.opex")}
          </div>
          <div className="text-3xl font-bold text-foreground font-mono mt-1">
            {stats === undefined ? <Loader2 className="w-5 h-5 animate-spin text-muted/50 mt-1" /> : `$${stats.totalOpexCost < 0.00001 && stats.totalOpexCost > 0 ? "< 0.00001" : stats.totalOpexCost.toFixed(5)}`}
          </div>
        </div>
      </div>

      {/* Transactions Table Container */}
      <DataTable
        rows={status === "LoadingFirstPage" ? undefined : pagedRuns.pageRows}
        rowKey={(tx) => tx._id}
        className="mt-2"
        minWidthClassName="min-w-[800px]"
        headerVariant="strip"
        search={{
          value: runSearch,
          onChange: setRunSearch,
          placeholder: t("table.searchPlaceholder"),
        }}
        empty={{
          icon: <Activity className="w-8 h-8 text-muted/30" />,
          label: t("table.noTransactions"),
          action: <span className="text-muted text-[12px]">{t("table.noTransactionsDesc")}</span>,
        }}
        footer={{
          mode: "paged",
          page: pagedRuns.page,
          totalPages: pagedRuns.totalPages,
          totalCount: pagedRuns.loadedCount,
          pageSize: pagedRuns.pageSize,
          isLoading: status === "LoadingMore" || status === "LoadingFirstPage",
          onPageChange: pagedRuns.goToPage,
        }}
        columns={[
          {
            key: "timestamp",
            header: t("table.timestamp"),
            cell: (tx) => (
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-foreground tracking-wide">
                  {formatDate(tx.createdAt, { options: { month: 'short', day: 'numeric' } })}
                </span>
                <span className="text-[11px] font-mono text-muted">
                  {formatTime(tx.createdAt, { options: { hour: '2-digit', minute: '2-digit', second: '2-digit' } })}
                </span>
              </div>
            ),
          },
          {
            key: "context",
            header: t("table.context"),
            cell: (tx) => (
              <span className="text-[13px] text-foreground tracking-wide inline-block font-medium">
                {tx.actionContext}
              </span>
            ),
          },
          {
            key: "pipeline",
            header: t("table.pipeline"),
            cell: (tx) => {
              const model = activeModels.find((activeModel) => activeModel.modelId === tx.modelUsed);
              return (
                <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-wide text-secondary/70 bg-foreground/5 px-2 py-1 rounded-[6px] w-max border border-border-dim/50">
                  {model?.friendlyName || model?.displayName || tx.modelUsed}
                </div>
              );
            },
          },
          {
            key: "tokens",
            header: t("table.tokens"),
            align: "right",
            cell: (tx) => (
              <div className="flex items-center justify-end gap-2 text-[12px] font-mono text-secondary">
                <span title={t("inputTokens")}>{tx.inputTokens.toLocaleString()}</span>
                <ArrowRight className="w-3 h-3 text-muted" />
                <span title={t("outputTokens")} className="text-foreground">{tx.outputTokens.toLocaleString()}</span>
              </div>
            ),
          },
          {
            key: "cost",
            header: t("table.cost"),
            align: "right",
            cell: (tx) => (
              <span className="text-[13px] font-mono font-medium text-foreground tracking-tight">
                ${(tx.costUsd ?? 0).toFixed(6)}
              </span>
            ),
          },
          {
            key: "status",
            header: t("table.status"),
            align: "right",
            className: "w-[100px]",
            cell: (tx) => (
              <div className="flex justify-end">
                {tx.status === "SUCCESS" ? (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500" title={t("table.status") + ": Success"}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500" title={t("table.status") + ": Failed"}>
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
