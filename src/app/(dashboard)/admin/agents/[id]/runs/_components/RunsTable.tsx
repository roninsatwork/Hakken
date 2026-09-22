"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Ban, Brain, Check, ClipboardCheck, Lightbulb, Loader2, MessageSquare, MinusCircle, MoreHorizontal, RotateCcw, SlidersHorizontal, Timer } from "lucide-react";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { useCursorPagination } from "@/src/ui/components/screens/CursorPagination";
import {
  describeRunStatus,
  describeTrigger,
  formatMoney,
  formatRelativeTime,
  type LabelRef,
} from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import {
  canCancel,
  canLearnFrom,
  canReplay,
  formatRunDuration,
  getStatusTone,
  type ReplayMode,
  type RunStatus,
} from "@/src/app/(dashboard)/admin/agents/_lib/runStatusRules";
import { useNow } from "@/src/app/(dashboard)/admin/agents/_lib/useNow";
import type { AdminActionRunner } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { STATUS_TONE_CLASSES } from "@/src/ui/components/screens/statusTone";
import { useToast } from "@/src/context/ToastContext";
import { LAYER } from "@/src/ui/lib/layers";
import type { FeedbackRecord } from "./FeedbackModal";

export type StatusFilter = "ALL" | RunStatus;

/** The fields the feedback modal needs to seed its draft from a row. */
export type RunFeedbackSource = {
  _id: Id<"agentRuns">;
  objective: string;
  markers: { feedback: FeedbackRecord | null };
};

/**
 * The list itself: every job the agent has run, one page at a time.
 *
 * The row-only writes live here — cancelling a job, generating and deciding
 * memory candidates and improvement suggestions — because nothing outside a row
 * ever triggers them. Replay, reflection and eval fixtures are passed in from
 * the page instead: the detail modal offers the same actions, and two copies of
 * a handler is two chances for their toasts to disagree.
 */
export function RunsTable({
  agentId,
  statusFilter,
  action,
  onRate,
  onReplay,
  onReflect,
  onCreateEvalFixture,
}: {
  agentId: Id<"agents">;
  statusFilter: StatusFilter;
  action: AdminActionRunner;
  onRate: (run: RunFeedbackSource) => void;
  onReplay: (runId: Id<"agentRuns">, mode: ReplayMode) => void;
  onReflect: (runId: Id<"agentRuns">) => void;
  onCreateEvalFixture: (runId: Id<"agentRuns">) => void;
}) {
  const t = useTranslations("admin.agents.details.runs.table");
  const tLabels = useTranslations("admin.agents.labels");
  // The pure formatters return catalogue keys, not words; this says them.
  const label = (ref: LabelRef) => tLabels(ref.key, ref.params);
  const router = useRouter();
  const now = useNow();
  const { showToast } = useToast();
  const [menuRunId, setMenuRunId] = useState<Id<"agentRuns"> | null>(null);

  const cancelRun = useMutation(api.agentRuns.cancelRun);
  const generateMemoryCandidates = useMutation(api.agentMemoryCandidates.generateForRun);
  const decideMemoryCandidate = useMutation(api.agentMemoryCandidates.decideCandidate);
  const generateImprovementSuggestions = useMutation(api.agentImprovementSuggestions.generateForRun);
  const decideImprovementSuggestion = useMutation(api.agentImprovementSuggestions.decideSuggestion);

  // One page at a time, by cursor. Numbered pages would mean counting every job
  // the agent has ever run on each visit, which is the read this screen exists
  // to stop doing. The filter is the reset key: changing it starts the walk
  // over, because a cursor only means something to the query it came from.
  const pagination = useCursorPagination(statusFilter);

  const runPage = useQuery(api.agentRuns.getPageForAgent, {
    agentId,
    ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
    paginationOpts: { numItems: TABLE_PAGE_SIZE, cursor: pagination.cursor },
  });

  const runs = runPage?.page ?? [];
  const isLoading = runPage === undefined;
  const pageNumber = pagination.pageIndex + 1;
  const canGoBack = pagination.pageIndex > 0;
  const canGoForward = runPage !== undefined && !runPage.isDone;

  const goToPage = (next: "back" | "forward") => {
    if (next === "back") {
      pagination.previous();
    } else if (runPage?.continueCursor) {
      pagination.next(runPage.continueCursor);
    }
  };

  const handleCancel = async (runId: Id<"agentRuns">) => {
    await action.run(() => cancelRun({ runId, reason: "Cancelled from the agent Runs dashboard" }), {
      key: runId,
      successMessage: t("cancelSuccess"),
      fallbackMessage: t("cancelFailed"),
    });
  };

  const handleGenerateMemoryCandidates = async (runId: Id<"agentRuns">) => {
    const outcome = await action.run(
      () => generateMemoryCandidates({ runId, autoApplyLowRisk: false }),
      { key: runId, fallbackMessage: t("memoryFailed") },
    );
    if (!outcome.ok) return;
    const created = outcome.data.createdIds.length;
    showToast(
      created > 0
        ? t("memoryCreated", { count: created })
        : t("memoryNone"),
      created > 0 ? "success" : "info",
    );
  };

  const handleCandidateDecision = async (candidateId: Id<"agentMemoryCandidates">, decision: "APPROVED" | "REJECTED") => {
    await action.run(
      () => decideMemoryCandidate({
        candidateId,
        decision,
        ...(decision === "REJECTED" ? { rejectionReason: "Rejected from the agent Runs dashboard" } : {}),
      }),
      {
        key: candidateId,
        successMessage: decision === "APPROVED"
          ? t("candidateApproved")
          : t("candidateRejected"),
        fallbackMessage: t("candidateFailed"),
      },
    );
  };

  const handleGenerateSuggestions = async (runId: Id<"agentRuns">) => {
    const outcome = await action.run(() => generateImprovementSuggestions({ runId }), {
      key: runId,
      fallbackMessage: t("suggestionFailed"),
    });
    if (!outcome.ok) return;
    const created = outcome.data.createdIds.length;
    showToast(
      created > 0
        ? t("suggestionsCreated", { count: created })
        : t("suggestionsNone"),
      created > 0 ? "success" : "info",
    );
  };

  const handleSuggestionDecision = async (suggestionId: Id<"agentImprovementSuggestions">, decision: "APPROVED" | "REJECTED") => {
    await action.run(
      () => decideImprovementSuggestion({
        suggestionId,
        decision,
        apply: decision === "APPROVED",
        ...(decision === "REJECTED" ? { rejectionReason: "Rejected from the agent Runs dashboard" } : {}),
      }),
      {
        key: suggestionId,
        successMessage: decision === "APPROVED"
          ? t("suggestionApplied")
          : t("suggestionRejected"),
        fallbackMessage: t("suggestionReviewFailed"),
      },
    );
  };

  return (
    <DataTable
      rows={isLoading ? undefined : runs}
      rowKey={(run) => run._id}
      minWidthClassName="min-w-[860px]"
      empty={{
        icon: <Timer className="w-9 h-9 text-brand opacity-60" />,
        label:
          statusFilter === "ALL"
            ? t("emptyAll")
            : t("emptyFiltered"),
      }}
      /* By cursor, not by number: see the note on the query. The footer used
         to be drawn here by hand, in buttons a shade off the shared ones. */
      footer={{
        mode: "cursor",
        page: pageNumber,
        visibleCount: runs.length,
        canGoBack,
        canGoForward,
        isLoading,
        onStep: goToPage,
        labels: {
          empty: t("footerEmpty"),
          showing: (count, page) => t("footerShowing", { count, page }),
        },
      }}
      columns={[
        {
          key: "outcome",
          header: t("columns.outcome"),
          className: "w-[110px] align-top",
          cell: (run) => (
            <span className={`inline-block text-[11px] px-2 py-1 rounded-md border whitespace-nowrap ${STATUS_TONE_CLASSES[getStatusTone(run.status, Boolean(run.continuedByRunId))]}`}>
              {label(describeRunStatus(run.status, Boolean(run.continuedByRunId)))}
            </span>
          ),
        },
        {
          key: "objective",
          header: t("columns.objective"),
          className: "align-top min-w-0",
          cell: (run) => (
            <>
              <p className="text-[13.5px] text-foreground truncate max-w-[46ch]">{run.objective}</p>
              {/* One line, and only when it says something the row does
                  not already. A job's full output belongs on its own
                  screen, not wrapped across three lines of a list. */}
              {(run.error || run.finalOutput) && (
                <p className="text-[11.5px] text-muted truncate max-w-[46ch] mt-0.5">
                  {run.error || run.finalOutput}
                </p>
              )}
              {(run.markers.feedback
                || run.markers.reflected
                || run.markers.usedAsCheck
                || run.markers.memoryCandidateIds.length > 0
                || run.markers.suggestionIds.length > 0) && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {run.markers.feedback && (
                    <RowMarker>{t("markers.rated", { rating: run.markers.feedback.rating.toLowerCase() })}</RowMarker>
                  )}
                  {run.markers.reflected && <RowMarker>{t("markers.reflected")}</RowMarker>}
                  {run.markers.usedAsCheck && <RowMarker>{t("markers.usedAsCheck")}</RowMarker>}
                  {run.markers.memoryCandidateIds.length > 0 && (
                    <RowMarker tone="attention">{t("markers.memory")}</RowMarker>
                  )}
                  {run.markers.suggestionIds.length > 0 && (
                    <RowMarker tone="attention">{t("markers.suggestion")}</RowMarker>
                  )}
                </div>
              )}
            </>
          ),
        },
        {
          key: "when",
          header: t("columns.when"),
          className: "w-[150px] align-top text-[12px] text-secondary whitespace-nowrap",
          cell: (run) => (
            <>
              {label(formatRelativeTime(run.startedAt, now))}
              <span className="block text-[11px] text-muted">
                {label(describeTrigger(run.triggerType))}
                {run.isRehearsal && (
                  // Text, not colour: a drill must be readable as a drill
                  // by everyone, on every screen.
                  <span className="ml-1.5 rounded-[4px] border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-semibold text-info">
                    {t("rehearsal")}
                  </span>
                )}
              </span>
            </>
          ),
        },
        {
          key: "cost",
          header: t("columns.cost"),
          align: "right",
          className: "w-[130px] align-top text-[12px] text-secondary tabular-nums whitespace-nowrap",
          cell: (run) => (
            <>
              {run.completedAt ? formatRunDuration(run.completedAt - run.startedAt) : "—"}
              {run.costUsd !== undefined && (
                <span className="block text-[11px] text-muted">{formatMoney(run.costUsd)}</span>
              )}
            </>
          ),
        },
        {
          key: "actions",
          header: "\u00a0",
          align: "right",
          className: "w-[150px] align-top",
          cell: (run) => (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="quiet"
                onClick={() => router.push(`/admin/agents/${agentId}/observability/${run._id}`)}
              >
                {t("open")}
              </Button>
              {/* Everything else lives behind one control. Seven bare
                  icons in a row told nobody what any of them did. */}
              <RowMenu
                runId={run._id}
                status={run.status}
                isOpen={menuRunId === run._id}
                isBusy={action.isBusy(run._id)}
                onToggle={() => setMenuRunId(menuRunId === run._id ? null : run._id)}
                pendingCandidateId={run.markers.memoryCandidateIds[0]}
                pendingSuggestionId={run.markers.suggestionIds[0]}
                onDecideCandidate={handleCandidateDecision}
                onDecideSuggestion={handleSuggestionDecision}
                onRate={() => onRate(run)}
                onRemember={() => handleGenerateMemoryCandidates(run._id)}
                onMakeCheck={() => onCreateEvalFixture(run._id)}
                onSuggest={() => handleGenerateSuggestions(run._id)}
                onReflect={() => onReflect(run._id)}
                onReplay={() => onReplay(run._id, "CURRENT_ACTIVE")}
                onCancel={() => handleCancel(run._id)}
              />
            </div>
          ),
        },
      ]}
    />
  );
}

/**
 * A small note on a row — that somebody rated it, that it became a check.
 *
 * Two tones only. The old list gave each marker its own colour, so a row could
 * carry blue, indigo, sky and green at once and none of them meant anything;
 * colour should say "this wants you" or nothing at all.
 */
function RowMarker({
  children,
  tone = "quiet",
}: {
  children: React.ReactNode;
  tone?: "quiet" | "attention";
}) {
  return (
    <span
      className={`text-[10.5px] px-2 py-0.5 rounded-full whitespace-nowrap ${
        tone === "attention" ? "bg-brand/10 text-brand" : "bg-foreground/5 text-muted"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Everything you can do with a job, behind one control.
 *
 * These were seven unlabelled icon buttons on every row. Nobody can tell a
 * brain from a clipboard from a slider at that size, and a destructive action
 * sat one pixel from a harmless one.
 */
function RowMenu({
  runId,
  status,
  isOpen,
  isBusy,
  onToggle,
  pendingCandidateId,
  pendingSuggestionId,
  onDecideCandidate,
  onDecideSuggestion,
  onRate,
  onRemember,
  onMakeCheck,
  onSuggest,
  onReflect,
  onReplay,
  onCancel,
}: {
  runId: Id<"agentRuns">;
  status: RunStatus;
  isOpen: boolean;
  isBusy: boolean;
  onToggle: () => void;
  pendingCandidateId?: Id<"agentMemoryCandidates">;
  pendingSuggestionId?: Id<"agentImprovementSuggestions">;
  onDecideCandidate: (id: Id<"agentMemoryCandidates">, decision: "APPROVED" | "REJECTED") => void;
  onDecideSuggestion: (id: Id<"agentImprovementSuggestions">, decision: "APPROVED" | "REJECTED") => void;
  onRate: () => void;
  onRemember: () => void;
  onMakeCheck: () => void;
  onSuggest: () => void;
  onReflect: () => void;
  onReplay: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.agents.details.runs.table");
  const items: Array<{ label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }> = [];

  // Anything waiting on a decision comes first: it is the only reason somebody
  // opens this menu without already knowing what they want.
  if (pendingCandidateId) {
    items.push(
      {
        label: t("menu.rememberYes"),
        icon: <Check className="w-3.5 h-3.5" />,
        onClick: () => onDecideCandidate(pendingCandidateId, "APPROVED"),
      },
      {
        label: t("menu.rememberNo"),
        icon: <MinusCircle className="w-3.5 h-3.5" />,
        onClick: () => onDecideCandidate(pendingCandidateId, "REJECTED"),
      }
    );
  }

  if (pendingSuggestionId) {
    items.push(
      {
        label: t("menu.acceptSuggestion"),
        icon: <Check className="w-3.5 h-3.5" />,
        onClick: () => onDecideSuggestion(pendingSuggestionId, "APPROVED"),
      },
      {
        label: t("menu.dismissSuggestion"),
        icon: <MinusCircle className="w-3.5 h-3.5" />,
        onClick: () => onDecideSuggestion(pendingSuggestionId, "REJECTED"),
      }
    );
  }

  items.push({ label: t("menu.rate"), icon: <MessageSquare className="w-3.5 h-3.5" />, onClick: onRate });

  if (canLearnFrom(status)) {
    items.push(
      { label: t("menu.remember"), icon: <Brain className="w-3.5 h-3.5" />, onClick: onRemember },
      { label: t("menu.makeCheck"), icon: <ClipboardCheck className="w-3.5 h-3.5" />, onClick: onMakeCheck },
      { label: t("menu.suggest"), icon: <SlidersHorizontal className="w-3.5 h-3.5" />, onClick: onSuggest }
    );
  }

  if (canReplay(status)) {
    items.push(
      { label: t("menu.reflect"), icon: <Lightbulb className="w-3.5 h-3.5" />, onClick: onReflect },
      { label: t("menu.replay"), icon: <RotateCcw className="w-3.5 h-3.5" />, onClick: onReplay }
    );
  }

  if (canCancel(status)) {
    items.push({ label: t("menu.cancel"), icon: <Ban className="w-3.5 h-3.5" />, onClick: onCancel, danger: true });
  }

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  // Measured against the viewport at the moment of opening, and drawn outside
  // the table: the table scrolls sideways, so a menu positioned inside it was
  // clipped by the scroll container and only showed its first three items.
  const handleToggle = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setAnchor(
      !isOpen && rect ? { top: rect.bottom + 4, right: window.innerWidth - rect.right } : null
    );
    onToggle();
  };

  return (
    <div className="relative">
      <Button
        variant="quiet"
        ref={triggerRef}
        onClick={handleToggle}
        aria-label={t("menuAria")}
        aria-expanded={isOpen}
        className="p-2"
      >
        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
      </Button>

      {isOpen && anchor && typeof document !== "undefined" && createPortal(
        <>
          {/* Clicking anywhere else closes it, without any of the rows needing
              to know the menu exists. Backdrop and menu share the overlay
              layer; the menu is the later sibling, so it paints on top. */}
          {/* Stays raw: an invisible full-screen backdrop — not a themed control. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={handleToggle}
            className={`fixed inset-0 ${LAYER.OVERLAY} cursor-default`}
          />
          <div
            key={runId}
            style={{ top: anchor.top, right: anchor.right }}
            className={`fixed ${LAYER.OVERLAY} w-[248px] rounded-[12px] border border-border-dim bg-card p-1.5 shadow-xl`}
          >
            {items.map((item) => (
              // Stays raw: a full-width dropdown menu row (danger rows flood red on hover) — matches no variant.
              <button
                key={item.label}
                type="button"
                disabled={isBusy}
                onClick={() => {
                  handleToggle();
                  item.onClick();
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[12.5px] text-left transition-colors disabled:opacity-50 ${
                  item.danger
                    ? "text-destructive hover:bg-destructive/10"
                    : "text-secondary hover:text-foreground hover:bg-white/[0.05]"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
