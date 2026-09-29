"use client";

import { formatDateTime } from "@/src/lib/dates";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { toneForStatus } from "@/src/ui/components/screens/statusTone";

type WorkflowExecution = {
  _id: string;
  workflowName: string;
  status: string;
  triggerType: string;
  startedByName: string;
  startedAt: number;
  awaitingApprovalNodeId?: string;
};

type WorkflowExecutionCellProps = {
  kind: "workflow" | "status" | "trigger" | "startedBy" | "started";
  execution: WorkflowExecution;
};

export default function WorkflowExecutionCell({ kind, execution }: WorkflowExecutionCellProps) {
  const t = useTranslations("admin.workflows.executions");

  if (kind === "workflow") {
    return (
      <Link
        href={`/admin/workflows/executions/${execution._id}`}
        className="text-[13px] font-medium text-foreground hover:text-brand hover:underline"
      >
        {execution.workflowName}
      </Link>
    );
  }

  if (kind === "status") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <StatusLabel tone={toneForStatus(execution.status)}>
          {t(`status.${execution.status}`)}
        </StatusLabel>
        {/* The one thing on this list that needs acting on rather than reading,
            so it is on the row and not behind a click. */}
        {execution.awaitingApprovalNodeId && (
          <StatusLabel tone="warning" icon="approval">{t("awaitingApproval")}</StatusLabel>
        )}
      </div>
    );
  }

  if (kind === "trigger") {
    return <span className="text-[12px] text-secondary">{execution.triggerType}</span>;
  }

  if (kind === "startedBy") {
    return <span className="text-[12px] text-secondary">{execution.startedByName}</span>;
  }

  return <span className="text-[12px] text-muted">{formatDateTime(execution.startedAt)}</span>;
}
