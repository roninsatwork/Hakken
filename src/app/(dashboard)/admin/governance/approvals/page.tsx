"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { AdminConfirmationModal } from "@/src/app/(dashboard)/admin/_components/AdminConfirmationModal";
import {
  AdminLoadMoreFooter,
  AdminRowActions,
  AdminRowIconButton,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import { CheckCircle2, ChevronDown, Clock, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Reject and Cancel both end a run and cannot be undone, so both are confirmed. */
type Decision = "APPROVED" | "REJECTED" | "CANCELLED";
type ConfirmableDecision = Exclude<Decision, "APPROVED">;

const COLUMN_COUNT = 5;

function safeFormatJson(value?: string) {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

/**
 * The difference between a lookup and a deletion, so it is a pill on the row
 * rather than a word buried in the payload.
 */
function sideEffectToneClass(level?: string) {
  if (level === "DESTRUCTIVE") return "text-red-500 bg-red-500/10 border-red-500/20";
  if (level === "WRITE" || level === "EXTERNAL") return "text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20";
  return "text-secondary bg-foreground/5 border-border-dim";
}

export default function AgentApprovalsPage() {
  const t = useTranslations("admin.agents.approvals");
  const decideApproval = useMutation(api.agentRuns.decideApproval);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<Id<"agentRunApprovals"> | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    approvalId: Id<"agentRunApprovals">;
    decision: ConfirmableDecision;
    toolName: string;
  } | null>(null);

  const {
    results: approvals,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.agentRuns.getPendingApprovals,
    { searchTerm: searchTerm.trim() || undefined },
    { initialNumItems: ADMIN_PAGE_SIZE },
  );
  // The total, not the loaded count. The header used to read `approvals.length`,
  // which silently under-reported as soon as there were more than one page.
  const pendingCount = useQuery(api.agentRuns.getPendingApprovalCount, {});
  const action = useAdminAction({ scope: "admin-agent-approvals" });

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const submitDecision = async (approvalId: Id<"agentRunApprovals">, decision: Decision) => {
    await action.run(
      () => decideApproval({
        approvalId,
        decision,
        decisionReason: t(`decisionReason.${decision}`),
      }),
      {
        key: approvalId,
        successMessage: t(`success.${decision}`),
        fallbackMessage: t("errors.failed"),
      },
    );
    setPendingConfirmation(null);
  };

  const countLabel = pendingCount === undefined
    ? t("count.loading")
    : t("count.pending", { count: pendingCount.count, suffix: pendingCount.atLimit ? "+" : "" });

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <AdminPageHeader
        icon={<ShieldCheck className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={(
          <div className="flex items-center gap-2 px-3 py-2 rounded-[8px] border border-border-dim bg-card/40 text-[12px] text-secondary">
            <Clock className="w-4 h-4 text-[#f59e0b]" />
            {countLabel}
          </div>
        )}
      />

      <AdminSearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t("searchPlaceholder")} />

      <AdminSaveError>{action.error}</AdminSaveError>

      <AdminTableShell
        minWidthClassName="min-w-[900px]"
        footer={(
          <AdminLoadMoreFooter
            visibleCount={approvals.length}
            canLoadMore={canLoadMore}
            isLoading={isLoadingMore}
            onLoadMore={() => loadMore(ADMIN_PAGE_SIZE)}
            labels={{
              empty: t("footer.empty"),
              showing: (count) => t("footer.showing", { count }),
              loadMore: t("footer.loadMore"),
              loading: t("footer.loading"),
            }}
          />
        )}
      >
        <thead>
          <AdminTableHeaderRow>
            <AdminTableHeaderCell>{t("columns.tool")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.agent")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.run")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.requested")}</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">{t("columns.actions")}</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={COLUMN_COUNT} />
          ) : approvals.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={COLUMN_COUNT}
              icon={<ShieldCheck className="w-8 h-8 text-muted/30" />}
              label={searchTerm.trim() ? t("empty.noMatches") : t("empty.none")}
            />
          ) : (
            approvals.map((entry) => {
              const approvalId = entry.approval._id;
              const preview = safeFormatJson(entry.approval.previewJson);
              const isSubmitting = action.isBusy(approvalId);
              const isExpanded = expandedId === approvalId;
              const toolName = entry.toolCall?.normalizedToolName || t("unknownTool");

              return (
                <tr key={approvalId} className="border-b border-border-dim/40 last:border-0 group align-top">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : approvalId)}
                      aria-expanded={isExpanded}
                      className="flex items-start gap-2 text-left"
                    >
                      {/* One rotated chevron rather than a pair of directional
                          icons. The drift guard treats those as the signature of
                          the hand-rolled pagination the shared footer replaced,
                          and it matches on text, so it cannot tell an expander
                          from a pager. Rotation sidesteps the ambiguity. */}
                      <ChevronDown
                        className={`w-4 h-4 mt-0.5 shrink-0 text-muted transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                      />
                      <span className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-medium text-foreground">{toolName}</span>
                        {entry.toolCall?.sideEffectLevel && (
                          <span className={`self-start px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border ${sideEffectToneClass(entry.toolCall.sideEffectLevel)}`}>
                            {t(`sideEffect.${entry.toolCall.sideEffectLevel}`)}
                          </span>
                        )}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 flex flex-col gap-2">
                        <p className="text-[12px] text-secondary leading-relaxed">
                          {entry.approval.message || t("defaultMessage")}
                        </p>
                        {/* The payload the decision is actually made on. It does not
                            get summarised away, only folded out of the way. */}
                        {preview && (
                          <pre className="max-h-[240px] max-w-[520px] overflow-auto rounded-[8px] border border-border-dim bg-background/60 p-3 text-[11px] leading-relaxed text-secondary">
                            {preview}
                          </pre>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 text-[13px] text-secondary">
                    {entry.agent?.name || t("unknownAgent")}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 max-w-[280px]">
                      <span className="text-[13px] text-secondary truncate">
                        {entry.run?.objective || t("unknownObjective")}
                      </span>
                      {entry.run && (
                        <div className="flex items-center gap-3 text-[11px]">
                          {/* The timeline, which is where the context for this
                              decision lives. The old link went to the agent and
                              the run itself was not reachable at all. */}
                          <Link href={`/admin/agents/${entry.run.agentId}/runs`} className="text-brand hover:underline">
                            {t("links.openRun")}
                          </Link>
                          <Link href={`/admin/agents/${entry.run.agentId}`} className="text-secondary hover:text-foreground hover:underline">
                            {t("links.openAgent")}
                          </Link>
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-[12px] text-muted whitespace-nowrap">
                    {formatDateTime(entry.approval.requestedAt)}
                  </td>

                  <td className="px-4 py-3">
                    <AdminRowActions>
                      <AdminRowIconButton
                        label={t("actions.approve")}
                        onClick={() => submitDecision(approvalId, "APPROVED")}
                      >
                        <CheckCircle2 className={`w-4 h-4 ${isSubmitting ? "opacity-40" : ""}`} />
                      </AdminRowIconButton>
                      <AdminRowIconButton
                        label={t("actions.reject")}
                        tone="danger"
                        onClick={() => setPendingConfirmation({ approvalId, decision: "REJECTED", toolName })}
                      >
                        <XCircle className="w-4 h-4" />
                      </AdminRowIconButton>
                    </AdminRowActions>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </AdminTableShell>

      <AdminConfirmationModal
        isOpen={pendingConfirmation !== null}
        onClose={() => setPendingConfirmation(null)}
        title={t("confirm.title")}
        cancelLabel={t("confirm.cancel")}
        confirmLabel={t("confirm.confirm")}
        isSubmitting={pendingConfirmation ? action.isBusy(pendingConfirmation.approvalId) : false}
        onConfirm={() => {
          if (pendingConfirmation) {
            void submitDecision(pendingConfirmation.approvalId, pendingConfirmation.decision);
          }
        }}
        warning={{
          title: t("confirm.warningTitle"),
          description: t("confirm.warningBody"),
        }}
      >
        <p>{t("confirm.body", { tool: pendingConfirmation?.toolName ?? "" })}</p>
      </AdminConfirmationModal>
    </div>
  );
}
