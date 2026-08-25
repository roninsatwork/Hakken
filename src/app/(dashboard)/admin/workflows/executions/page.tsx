"use client";

import { lazy, Suspense } from "react";
import { api } from "@/convex/_generated/api";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { History } from "lucide-react";
import { useTranslations } from "next-intl";

const WorkflowExecutionCell = lazy(() => import("./WorkflowExecutionCell"));

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

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <PageHeader
        divider
        icon={<History className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <WorkflowExecutionsList runs={runs} />
    </div>
  );
}

type WorkflowExecutionRuns = ReturnType<
  typeof useServerPagedTable<typeof api.scheduler.getWorkflowExecutions>
>;

function WorkflowExecutionsList({ runs }: { runs: WorkflowExecutionRuns }) {
  const t = useTranslations("admin.workflows.executions");
  const executions = runs.rows;

  const table = (rows: typeof executions | undefined) => (
    <DataTable
      rows={rows}
      rowKey={(execution) => execution._id}
      minWidthClassName="min-w-[900px]"
      empty={{ icon: <History className="w-8 h-8 text-muted/30" />, label: t("empty") }}
      footer={{
        mode: "paged",
        page: runs.page,
        totalPages: runs.totalPages,
        totalCount: runs.loadedCount,
        pageSize: TABLE_PAGE_SIZE,
        isLoading: runs.isBusy,
        onPageChange: runs.goToPage,
        labels: { empty: t("empty") },
      }}
      columns={[
        {
          key: "workflow",
          header: t("columns.workflow"),
          cell: (execution) => <WorkflowExecutionCell kind="workflow" execution={execution} />,
        },
        {
          key: "status",
          header: t("columns.status"),
          cell: (execution) => <WorkflowExecutionCell kind="status" execution={execution} />,
        },
        {
          key: "trigger",
          header: t("columns.trigger"),
          cell: (execution) => <WorkflowExecutionCell kind="trigger" execution={execution} />,
        },
        {
          key: "startedBy",
          header: t("columns.startedBy"),
          cell: (execution) => <WorkflowExecutionCell kind="startedBy" execution={execution} />,
        },
        {
          key: "started",
          header: t("columns.started"),
          className: "whitespace-nowrap",
          cell: (execution) => <WorkflowExecutionCell kind="started" execution={execution} />,
        },
      ]}
    />
  );

  const unresolvedTable = table(runs.isLoading ? undefined : []);

  if (runs.isLoading || executions.length === 0) return unresolvedTable;

  return <Suspense fallback={unresolvedTable}>{table(executions)}</Suspense>;
}
