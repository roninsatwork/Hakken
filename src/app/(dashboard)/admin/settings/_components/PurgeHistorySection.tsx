"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { History, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import {
  AdminPaginationFooter,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { StatusPill } from "@/src/ui/atoms/StatusPill";
import { toneForStatus } from "@/src/ui/atoms/statusTone";
import {
  purgePipelineKeys,
  type PurgeHistoryRow,
  type PurgePipelineKey,
} from "./types";

type HistoryStatus = "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
const HISTORY_STATUSES: HistoryStatus[] = ["RUNNING", "SUCCESS", "FAILED", "CANCELLED"];

/**
 * The purge ledger, on its own screen and on the standard admin table. It
 * shared one very long page with the retention rules; the rules are
 * configuration and this is evidence, and the two answer different
 * questions. Filters run on the server (the old feed capped at 500 rows and
 * silently hid the rest); the search narrows what has loaded; the footer is
 * the platform's standard 15-row pager, fetching more as pages advance.
 */
export function PurgeHistorySection() {
  const t = useTranslations("admin.settings");

  const [pipelineFilter, setPipelineFilter] = useState<PurgePipelineKey | "all">("all");
  const [statusFilter, setStatusFilter] = useState<HistoryStatus | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const history = usePaginatedQuery(
    api.purges.getPurgeHistoryPaginated,
    {
      ...(pipelineFilter !== "all" ? { pipelineKey: pipelineFilter } : {}),
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    },
    { initialNumItems: ADMIN_PAGE_SIZE },
  );

  const needle = searchTerm.trim().toLowerCase();
  const rows = (history.results as PurgeHistoryRow[]).filter((log) => {
    if (!needle) return true;
    const haystack = `${t(`purges.categories.${log.pipelineKey}.title`)} ${log.actorName ?? ""} ${log.status}`.toLowerCase();
    return haystack.includes(needle);
  });

  const isLoading = history.status === "LoadingFirstPage";
  const pageStart = (page - 1) * ADMIN_PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + ADMIN_PAGE_SIZE);
  // No maintained total for the ledger, so the count is what has been
  // fetched — honest, if conservative, while more pages remain.
  const knownTotal = rows.length;
  const totalPages = Math.max(1, Math.ceil(knownTotal / ADMIN_PAGE_SIZE));

  const goToPage = (next: number) => {
    setPage(next);
    if (history.results.length < next * ADMIN_PAGE_SIZE && history.status === "CanLoadMore") {
      history.loadMore(ADMIN_PAGE_SIZE);
    }
  };

  const resetPaging = () => setPage(1);

  const selectClassName =
    "bg-sidebar/30 border border-border-dim rounded-[10px] px-3 py-2 text-[12px] font-semibold text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer";

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 ml-2">
        <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase flex items-center gap-2">
          <History className="w-3.5 h-3.5" /> {t("purges.history.title")}
        </h3>
        <p className="text-[13px] text-secondary mt-1">{t("purges.history.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1">
          <AdminSearchBar
            value={searchTerm}
            onChange={(value) => {
              setSearchTerm(value);
              resetPaging();
            }}
            placeholder={t("purges.history.searchPlaceholder")}
          />
        </div>
        <select
          value={pipelineFilter}
          onChange={(event) => {
            setPipelineFilter(event.target.value as PurgePipelineKey | "all");
            resetPaging();
          }}
          className={selectClassName}
          aria-label={t("purges.history.table.pipeline")}
        >
          <option value="all">{t("purges.history.allPipelines")}</option>
          {purgePipelineKeys.map((key) => (
            <option key={key} value={key}>{t(`purges.categories.${key}.title`)}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as HistoryStatus | "all");
            resetPaging();
          }}
          className={selectClassName}
          aria-label={t("purges.history.table.status")}
        >
          <option value="all">{t("purges.history.allStatuses")}</option>
          {HISTORY_STATUSES.map((status) => (
            <option key={status} value={status}>{t(`purges.history.table.${status.toLowerCase()}`)}</option>
          ))}
        </select>
      </div>

      <AdminTableShell
        minWidthClassName="min-w-[760px]"
        footer={knownTotal > 0 ? (
          <AdminPaginationFooter
            page={page}
            totalPages={totalPages}
            totalCount={knownTotal}
            pageSize={ADMIN_PAGE_SIZE}
            isLoading={history.status === "LoadingMore"}
            onPageChange={goToPage}
            labels={{
              showing: (start, end, total) => t("purges.history.showingRange", { start, end, total }),
            }}
          />
        ) : undefined}
      >
        <thead>
          <AdminTableHeaderRow>
            <AdminTableHeaderCell>{t("purges.history.table.pipeline")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("purges.history.table.trigger")}</AdminTableHeaderCell>
            <AdminTableHeaderCell className="w-[130px]">{t("purges.history.table.status")}</AdminTableHeaderCell>
            <AdminTableHeaderCell className="w-[140px]">{t("purges.history.table.purged")}</AdminTableHeaderCell>
            <AdminTableHeaderCell className="w-[190px]" align="right">{t("purges.history.table.started")}</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : pageRows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
              icon={<History className="h-8 w-8 text-muted/30" />}
              label={t("purges.history.table.empty")}
            />
          ) : pageRows.map((log) => (
            <tr key={log._id} className="group border-b border-border-dim/50 transition-colors hover:bg-foreground/[0.02]">
              <td className="px-4 py-3">
                <span className="text-[13px] font-medium text-foreground">{t(`purges.categories.${log.pipelineKey}.title`)}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-[13px] text-secondary">
                  {log.triggerType === "SCHEDULED" ? t("purges.history.table.system") : `${t("purges.history.table.manual")} (${log.actorName})`}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusPill
                  tone={log.status === "SUCCESS" ? "success" : toneForStatus(log.status)}
                  icon={log.status === "RUNNING" ? <Loader2 className="w-3 h-3 animate-spin" /> : undefined}
                >
                  {t(`purges.history.table.${log.status.toLowerCase()}`)}
                </StatusPill>
              </td>
              <td className="px-4 py-3">
                <span className="text-[13px] font-mono text-foreground">{log.recordsPurged.toLocaleString()}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-[12px] font-mono text-secondary">{new Date(log.startedAt).toLocaleString()}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>
    </section>
  );
}
