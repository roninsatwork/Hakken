"use client";

import { formatDateTime } from "@/src/lib/dates";
import { ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

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

function statusToneClass(status: string) {
  if (status === "FAILED") return "text-red-500 bg-red-500/10 border-red-500/20";
  if (status === "SUCCESS") return "text-green-500 bg-green-500/10 border-green-500/20";
  return "text-secondary bg-foreground/5 border-border-dim";
}

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
        <span className={`px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border ${statusToneClass(execution.status)}`}>
          {t(`status.${execution.status}`)}
        </span>
        {/* The one thing on this list that needs acting on rather than reading,
            so it is on the row and not behind a click. */}
        {execution.awaitingApprovalNodeId && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20">
            <ShieldQuestion className="w-3 h-3" />
            {t("awaitingApproval")}
          </span>
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
