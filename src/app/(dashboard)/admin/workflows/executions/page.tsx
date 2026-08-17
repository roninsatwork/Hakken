"use client";

import { api } from "@/convex/_generated/api";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  PaginationFooter,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { formatDateTime } from "@/src/lib/dates";
import { History, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

const COLUMN_COUNT = 5;

function statusToneClass(status: string) {
  if (status === "FAILED") return "text-red-500 bg-red-500/10 border-red-500/20";
  if (status === "SUCCESS") return "text-green-500 bg-green-500/10 border-green-500/20";
  return "text-secondary bg-foreground/5 border-border-dim";
}

/**
 * Workflow runs.
 *
 * There has been no screen for these since the log pages were deleted in
 * `cc5bc9558`, so pressing "run" in the builder led nowhere, and a workflow halted
 * on a Human Approval node could not be answered at all — the node stayed in the
 * builder while the screen that decided it did not.
 */
export default function WorkflowExecutionsPage() {
  const t = useTranslations("admin.workflows.executions");

  const runs = useServerPagedTable(api.scheduler.getWorkflowExecutions, {}, TABLE_PAGE_SIZE);
  const executions = runs.rows;
  const isLoading = runs.isLoading;

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <PageHeader
        icon={<History className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <TableShell
        minWidthClassName="min-w-[900px]"
        footer={(
          <PaginationFooter
            page={runs.page}
            totalPages={runs.totalPages}
            totalCount={runs.loadedCount}
            pageSize={TABLE_PAGE_SIZE}
            isLoading={runs.isLoadingMore}
            onPageChange={runs.goToPage}
            labels={{ empty: t("empty") }}
          />
        )}
      >
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>{t("columns.workflow")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.status")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.trigger")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.startedBy")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.started")}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <TableLoadingRow colSpan={COLUMN_COUNT} />
          ) : executions.length === 0 ? (
            <TableEmptyRow
              colSpan={COLUMN_COUNT}
              icon={<History className="w-8 h-8 text-muted/30" />}
              label={t("empty")}
            />
          ) : (
            executions.map((execution) => (
              <tr key={execution._id} className="border-b border-border-dim/40 last:border-0 hover:bg-foreground/[0.02]">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/workflows/executions/${execution._id}`}
                    className="text-[13px] font-medium text-foreground hover:text-brand hover:underline"
                  >
                    {execution.workflowName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border ${statusToneClass(execution.status)}`}>
                      {t(`status.${execution.status}`)}
                    </span>
                    {/* The one thing on this list that needs acting on rather than
                        reading, so it is on the row and not behind a click. */}
                    {execution.awaitingApprovalNodeId && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20">
                        <ShieldQuestion className="w-3 h-3" />
                        {t("awaitingApproval")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-[12px] text-secondary">{execution.triggerType}</td>
                <td className="px-4 py-3 text-[12px] text-secondary">{execution.startedByName}</td>
                <td className="px-4 py-3 text-[12px] text-muted whitespace-nowrap">
                  {formatDateTime(execution.startedAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
