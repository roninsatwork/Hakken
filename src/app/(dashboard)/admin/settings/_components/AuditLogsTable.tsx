"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { History, Loader2, Search } from "lucide-react";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import type { AuditLogRow } from "./types";

export function AuditLogsSection({ logs }: { logs: AuditLogRow[] | undefined }) {
  const t = useTranslations("admin.settings");

  return (
    <section className="flex flex-col gap-6">
      <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase ml-2 flex items-center gap-2">
        <History className="w-3.5 h-3.5" /> {t("audit.title")}
      </h3>

      <AuditLogsTable logs={logs} />
    </section>
  );
}

export function AuditLogsTable({ logs }: { logs: AuditLogRow[] | undefined }) {
  const router = useRouter();
  const t = useTranslations("admin.auditLogs");
  const common = useTranslations("common");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const itemsPerPage = ADMIN_PAGE_SIZE;

  if (logs === undefined) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand" /></div>;
  }

  /**
   * What is actually there, and nothing else.
   *
   * An empty trail used to be filled with four invented entries — among them a
   * user deletion for a "TOS Violation" against an account that never existed,
   * attributed to a named administrator. Placeholder rows are a demo trick that
   * has no business on a compliance surface: the one screen whose entire value
   * is that it only contains things that happened.
   */
  const activeLogs: AuditLogRow[] = logs;

  const filteredLogs = activeLogs.filter((log) =>
    log.actionType.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.actorName || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="w-full bg-sidebar/40 border border-border-dim/50 rounded-[20px] overflow-hidden shadow-sm backdrop-blur-xl mt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border-dim/50 bg-background/50">
        <div>
          <h3 className="text-[14px] font-medium text-foreground tracking-wide">{t("feedTitle")}</h3>
          <p className="text-[12px] text-secondary mt-0.5">{t("feedSub")}</p>
        </div>

        <div className="relative w-full sm:w-[280px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-muted" />
          </div>
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 bg-background/50 border border-border-dim rounded-[10px] text-[13px] text-foreground focus:border-brand/50 outline-none transition-all placeholder:text-muted"
          />
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-dim/50 bg-foreground/[0.02] whitespace-nowrap">
              <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t("columns.action")}</th>
              <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t("columns.admin")}</th>
              <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t("columns.target")}</th>
              <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em] text-right">{t("columns.timestamp")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dim/30">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-secondary text-[13px]">
                  {logs.length === 0 ? t("empty") : t("noMatch")}
                </td>
              </tr>
            ) : (
              paginatedLogs.map((log) => (
                <tr
                  key={log._id}
                  onClick={() => router.push(`/admin/audit-logs/${log._id}`)}
                  className="group hover:bg-foreground/[0.03] transition-colors cursor-pointer"
                >
                  <td className="px-5 py-4">
                    <span className="text-[10px] font-mono tracking-widest bg-foreground/5 border border-border-dim text-foreground px-2 py-1 rounded-[4px] font-medium">
                      {log.actionType}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[13px] font-medium text-foreground">{log.actorName}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[12px] font-mono text-secondary truncate max-w-[150px] inline-block">{log.entityId || "N/A"}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="text-[12px] text-secondary tracking-wide whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="w-full p-3 border-t border-border-dim/50 flex items-center justify-between bg-foreground/[0.02] px-5">
        <span className="text-[12px] text-secondary">
          {totalItems > 0 ? `${common("pagination.showing")} ${startIndex + 1} ${common("pagination.to")} ${Math.min(startIndex + itemsPerPage, totalItems)} ${common("pagination.of")} ${totalItems} ${common("pagination.entries")}` : null}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-[12px] font-medium text-secondary hover:text-foreground hover:bg-foreground/10 rounded-full transition-all disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            {common("pagination.previous")}
          </button>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-[12px] font-medium text-secondary hover:text-foreground hover:bg-foreground/10 rounded-full transition-all disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            {common("pagination.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
