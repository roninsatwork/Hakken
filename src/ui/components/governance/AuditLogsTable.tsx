"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { History, Loader2 } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
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
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const itemsPerPage = TABLE_PAGE_SIZE;

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

  const columns: DataTableColumn<AuditLogRow>[] = [
    {
      key: "action",
      header: t("columns.action"),
      cell: (log) => (
        <span className="text-[10px] font-mono tracking-widest bg-foreground/5 border border-border-dim text-foreground px-2 py-1 rounded-[4px] font-medium">
          {log.actionType}
        </span>
      ),
    },
    {
      key: "admin",
      header: t("columns.admin"),
      cell: (log) => <span className="text-[13px] font-medium text-foreground">{log.actorName}</span>,
    },
    {
      key: "target",
      header: t("columns.target"),
      cell: (log) => (
        <span className="text-[12px] font-mono text-secondary truncate max-w-[150px] inline-block">
          {log.entityId || "N/A"}
        </span>
      ),
    },
    {
      key: "timestamp",
      header: t("columns.timestamp"),
      align: "right",
      cell: (log) => (
        <span className="text-[12px] text-secondary tracking-wide whitespace-nowrap">
          {new Date(log.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3 mt-2 w-full">
      <div>
        <h3 className="text-[14px] font-medium text-foreground tracking-wide">{t("feedTitle")}</h3>
        <p className="text-[12px] text-secondary mt-0.5">{t("feedSub")}</p>
      </div>

      <DataTable<AuditLogRow>
        rows={paginatedLogs}
        rowKey={(log) => log._id}
        columns={columns}
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setCurrentPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        onRowClick={(log) => router.push(`/admin/audit-logs/${log._id}`)}
        empty={{
          icon: <History className="w-8 h-8 text-muted/30" />,
          label: logs.length === 0 ? t("empty") : t("noMatch"),
        }}
        footer={{
          mode: "paged",
          page: currentPage,
          totalPages,
          totalCount: totalItems,
          pageSize: itemsPerPage,
          isLoading: false,
          onPageChange: setCurrentPage,
          labels: { empty: t("empty") },
        }}
      />
    </div>
  );
}
