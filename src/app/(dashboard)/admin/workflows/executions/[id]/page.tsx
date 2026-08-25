"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import { ArrowLeft, CheckCircle2, History, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";

const loadConfirmationModal = () => import("@/src/ui/components/screens/ConfirmationModal");
const DeferredConfirmationModal = lazy(() =>
  loadConfirmationModal().then((module) => ({ default: module.ConfirmationModal })),
);


function safeFormatJson(value?: string) {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function stepToneClass(status: string) {
  if (status === "FAILED") return "text-red-500 bg-red-500/10 border-red-500/20";
  if (status === "SUCCESS") return "text-green-500 bg-green-500/10 border-green-500/20";
  if (status === "PENDING_APPROVAL") return "text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20";
  return "text-secondary bg-foreground/5 border-border-dim";
}

/**
 * One workflow run, step by step, and the only place a halted approval can be
 * answered.
 *
 * A Human Approval node can be dragged into the builder, configured, saved and
 * run — and until this screen existed the run simply stopped, with no way to
 * release it and nothing anywhere saying so.
 */
export default function WorkflowExecutionDetailPage() {
  const t = useTranslations("admin.workflows.executions");
  const params = useParams();
  const executionId = params.id as Id<"workflowExecutions">;

  const execution = useQuery(api.scheduler.getWorkflowExecution, { executionId });
  const resumeApprovalStep = useAction(api.workflowRuntime.resumeApprovalStep);
  const action = useAdminAction({ scope: "admin-workflow-executions" });

  const [pendingRejection, setPendingRejection] = useState<{ nodeId: string } | null>(null);
  const [confirmationActivated, setConfirmationActivated] = useState(false);

  const decide = async (nodeId: string, decision: "APPROVED" | "REJECTED") => {
    await action.run(
      () => resumeApprovalStep({
        executionId,
        nodeId,
        action: decision,
        ...(decision === "REJECTED" ? { reason: t("decisionReason.REJECTED") } : {}),
      }),
      {
        key: nodeId,
        successMessage: t(`success.${decision}`),
        fallbackMessage: t("errors.failed"),
      },
    );
    setPendingRejection(null);
  };

  const steps = execution?.steps ?? [];

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <PageHeader
        icon={<History className="w-6 h-6 text-brand" />}
        title={execution?.workflowName ?? t("detail.loadingTitle")}
        description={execution
          ? t("detail.description", {
              status: t(`status.${execution.status}`),
              started: formatDateTime(execution.startedAt),
            })
          : undefined}
        action={(
          <Link
            href="/admin/workflows/executions"
            className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border border-border-dim text-[13px] text-secondary hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("detail.back")}
          </Link>
        )}
      />

      <SaveError>{action.error}</SaveError>

      <DataTable
        rows={execution === undefined ? undefined : steps}
        rowKey={(step) => step._id}
        minWidthClassName="min-w-[820px]"
        empty={{ icon: <History className="w-8 h-8 text-muted/30" />, label: t("detail.noSteps") }}
        footer={{
          mode: "paged",
          page: 1,
          totalPages: 1,
          totalCount: steps.length,
          pageSize: Math.max(steps.length, 1),
          isLoading: execution === undefined,
          onPageChange: () => {},
          labels: {
            empty: t("detail.noSteps"),
            showing: (_start, _end, total) => `${total} step${total === 1 ? "" : "s"}`,
          },
        }}
        columns={[
          {
            key: "node",
            header: t("detail.columns.node"),
            cell: (step) => {
              const isHalted = step.status === "PENDING_APPROVAL";
              const output = safeFormatJson(step.output);
              const parsedOutput = step.output ? safeParse(step.output) : null;

              return (
                <div className="flex flex-col gap-2 max-w-[420px]">
                  <span className="text-[13px] font-medium text-foreground">{step.nodeId}</span>

                  {/* What the approval node asked, and the preview it resolved.
                      Both are destroyed on approval unless the engine keeps
                      them, which is why they are shown here while it waits. */}
                  {isHalted && parsedOutput?.message ? (
                    <p className="text-[12px] text-secondary leading-relaxed">{String(parsedOutput.message)}</p>
                  ) : null}
                  {isHalted && parsedOutput?.previewData !== undefined ? (
                    <pre className="max-h-[160px] overflow-auto rounded-[8px] border border-border-dim bg-background/60 p-3 text-[11px] leading-relaxed text-secondary">
                      {typeof parsedOutput.previewData === "string"
                        ? parsedOutput.previewData
                        : JSON.stringify(parsedOutput.previewData, null, 2)}
                    </pre>
                  ) : null}
                  {!isHalted && output ? (
                    <pre className="max-h-[140px] overflow-auto rounded-[8px] border border-border-dim bg-background/60 p-3 text-[11px] leading-relaxed text-muted">
                      {output}
                    </pre>
                  ) : null}
                  {step.error ? (
                    <p className="text-[12px] text-red-400 leading-relaxed">{step.error}</p>
                  ) : null}
                </div>
              );
            },
          },
          {
            key: "status",
            header: t("detail.columns.status"),
            cell: (step) => (
              <span className={`px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border ${stepToneClass(step.status)}`}>
                {t(`stepStatus.${step.status}`)}
              </span>
            ),
          },
          {
            key: "started",
            header: t("detail.columns.started"),
            className: "whitespace-nowrap",
            cell: (step) => (
              <span className="text-[12px] text-muted">{formatDateTime(step.startedAt)}</span>
            ),
          },
          {
            key: "decision",
            header: t("detail.columns.decision"),
            align: "right",
            cell: (step) =>
              step.status === "PENDING_APPROVAL" ? (
                <div className="flex items-center justify-end gap-2">
                  {/* Stays raw: a brand fill with theme-background text — `brand` wears white text, so no variant is this. */}
                  <button
                    type="button"
                    onClick={() => decide(step.nodeId, "APPROVED")}
                    disabled={action.isBusy(step.nodeId)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-brand text-background text-[12px] font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t("detail.approve")}
                  </button>
                  {/* Stays raw: a compact red row chip — destructive's confirm recipe is a big uppercase pill. */}
                  <button
                    type="button"
                    onPointerEnter={() => void loadConfirmationModal()}
                    onPointerDown={() => void loadConfirmationModal()}
                    onFocus={() => void loadConfirmationModal()}
                    onClick={() => {
                      setConfirmationActivated(true);
                      setPendingRejection({ nodeId: step.nodeId });
                    }}
                    disabled={action.isBusy(step.nodeId)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] border border-red-500/30 bg-red-500/10 text-red-500 text-[12px] font-semibold hover:bg-red-500/15 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {t("detail.reject")}
                  </button>
                </div>
              ) : null,
          },
        ]}
      />

      {confirmationActivated ? (
        <Suspense fallback={null}>
          <DeferredConfirmationModal
            isOpen={pendingRejection !== null}
            onClose={() => setPendingRejection(null)}
            title={t("detail.confirm.title")}
            cancelLabel={t("detail.confirm.cancel")}
            confirmLabel={t("detail.confirm.confirm")}
            isSubmitting={pendingRejection ? action.isBusy(pendingRejection.nodeId) : false}
            onConfirm={() => {
              if (pendingRejection) void decide(pendingRejection.nodeId, "REJECTED");
            }}
            warning={{
              title: t("detail.confirm.warningTitle"),
              description: t("detail.confirm.warningBody"),
            }}
          >
            <p>{t("detail.confirm.body", { node: pendingRejection?.nodeId ?? "" })}</p>
          </DeferredConfirmationModal>
        </Suspense>
      ) : null}
    </div>
  );
}

function safeParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
