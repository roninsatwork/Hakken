"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Ban, Brain, Check, ClipboardCheck, Eye, Lightbulb, Loader2, MessageSquare, MinusCircle, MoreHorizontal, PlayCircle, RotateCcw, SlidersHorizontal, ThumbsDown, ThumbsUp, Timer } from "lucide-react";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import {
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import {
  describeRunStatus,
  describeTrigger,
  formatMoney,
  formatRelativeTime,
} from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import { useNow } from "@/src/app/(dashboard)/admin/agents/_lib/useNow";
import { describeStepKind, describeStepStatus } from "@/src/app/(dashboard)/admin/agents/_lib/jobWaterfall";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { STATUS_TONE_CLASSES, type StatusTone } from "@/src/ui/atoms/statusTone";
import { useToast } from "@/src/context/ToastContext";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

type AgentRun = Doc<"agentRuns">;
type AgentRunFeedback = Doc<"agentRunFeedback">;
type RunStatus = AgentRun["status"];
type StatusFilter = "ALL" | RunStatus;
type FeedbackRating = AgentRunFeedback["rating"];
type FeedbackLabel = AgentRunFeedback["labels"][number];
type ReplayMode = "CURRENT_ACTIVE" | "SAME_VERSION";
type FeedbackRecord = { rating: FeedbackRating; labels: FeedbackLabel[]; comment?: string };

// Ordered by what a reader is looking for, not by the lifecycle: the things
// that need a person come first, then the things that went wrong.
const statusFilters: StatusFilter[] = ["ALL", "PENDING_APPROVAL", "FAILED", "SUCCESS", "RUNNING", "QUEUED", "CANCELLED"];
const feedbackLabels: Array<{ label: FeedbackLabel; text: string }> = [
  { label: "GOOD_ANSWER", text: "Good answer" },
  { label: "INCORRECT", text: "Incorrect" },
  { label: "MISSED_CONTEXT", text: "Missed context" },
  { label: "WRONG_TOOL", text: "Wrong tool" },
  { label: "BAD_TOOL_ARGS", text: "Bad args" },
  { label: "UNSAFE_SUGGESTION", text: "Unsafe" },
  { label: "TOO_EXPENSIVE", text: "Too expensive" },
  { label: "TOO_SLOW", text: "Too slow" },
  { label: "NEEDS_APPROVAL_POLICY_CHANGE", text: "Approval policy" },
  { label: "SHOULD_BECOME_EVAL", text: "Make eval" },
];


function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatSignedDurationDelta(ms: number | undefined) {
  if (ms === undefined) return "not available";
  const prefix = ms > 0 ? "+" : "";
  return `${prefix}${formatDuration(ms)}`;
}

function formatSignedNumberDelta(value: number | undefined) {
  if (value === undefined) return "not available";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toLocaleString()}`;
}

function formatSignedCurrencyDelta(value: number | undefined) {
  if (value === undefined) return "not available";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMoney(value)}`;
}

function getStatusTone(status: RunStatus, continued = false): StatusTone {
  if (status === "SUCCESS") return "success";
  // A handover wears a working colour, not a failure's: the queue moved on to
  // the next run by design.
  if (status === "FAILED" && continued) return "info";
  if (status === "FAILED") return "danger";
  if (status === "CANCELLED") return "warning";
  if (status === "PENDING_APPROVAL") return "info";
  return "info";
}

function canReplay(status: RunStatus) {
  return status === "FAILED" || status === "CANCELLED";
}

function canCancel(status: RunStatus) {
  return status === "QUEUED" || status === "RUNNING" || status === "PENDING_APPROVAL";
}

function canLearnFrom(status: RunStatus) {
  return status === "SUCCESS" || status === "FAILED" || status === "CANCELLED";
}

function getSmokeEvalTone(status: RunStatus): StatusTone {
  if (status === "SUCCESS") return "success";
  if (status === "FAILED") return "danger";
  if (status === "CANCELLED") return "warning";
  return "info";
}

function getSmokeEvalModeLabel(mode: string) {
  return mode === "MODEL_GRADED" ? "Model graded" : "Contract";
}

function getStepTone(status: string): StatusTone {
  if (status === "SUCCESS") return "success";
  if (status === "FAILED") return "danger";
  if (status === "SKIPPED") return "warning";
  return "info";
}

function getStepDiffTone(changeType: string): StatusTone {
  if (changeType === "ADDED") return "success";
  if (changeType === "REMOVED") return "danger";
  if (changeType === "CHANGED") return "warning";
  return "neutral";
}


export default function AgentRunsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = params.id as Id<"agents">;
  const requestedRunId = searchParams.get("runId") as Id<"agentRuns"> | null;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  // Seeded from the URL so a link straight to ?runId=… opens the detail on the
  // first render rather than flashing the list and then opening it.
  const [detailRunId, setDetailRunId] = useState<Id<"agentRuns"> | null>(requestedRunId);
  const [syncedRunId, setSyncedRunId] = useState<Id<"agentRuns"> | null>(requestedRunId);
  const [menuRunId, setMenuRunId] = useState<Id<"agentRuns"> | null>(null);
  const now = useNow();

  // The suite is page-level rather than per-row, so it needs a key of its own
  // to avoid sharing a busy flag with every row action.
  const EVAL_SUITE_KEY = "eval-suite";
  // One runner for every write on this page: it owns the per-row busy state,
  // unwraps failures into a sentence, and reports them. See useAdminAction.
  const action = useAdminAction({ scope: "admin-agent-runs" });
  const { showToast } = useToast();
  const [feedbackDraft, setFeedbackDraft] = useState<{
    runId: Id<"agentRuns">;
    objective: string;
    rating: FeedbackRating;
    labels: FeedbackLabel[];
    comment: string;
  } | null>(null);
  const replayRun = useMutation(api.agentRuns.replayRun);
  const cancelRun = useMutation(api.agentRuns.cancelRun);
  const upsertFeedback = useMutation(api.agentRunFeedback.upsertForRun);
  const createReflection = useMutation(api.agentRunReflections.createForRun);
  const generateMemoryCandidates = useMutation(api.agentMemoryCandidates.generateForRun);
  const decideMemoryCandidate = useMutation(api.agentMemoryCandidates.decideCandidate);
  const createEvalFixture = useMutation(api.agentEvalFixtures.createFromRun);
  const runEvalSuite = useMutation(api.agentEvalFixtures.runEvalSuite);
  const generateImprovementSuggestions = useMutation(api.agentImprovementSuggestions.generateForRun);
  const decideImprovementSuggestion = useMutation(api.agentImprovementSuggestions.decideSuggestion);
  // The whole-agent analytics and the tool catalogue used to be fetched here
  // for headline tiles. Those tiles now live on Overview, and this page was
  // still paying for both on every visit.
  const runDetail = useQuery(api.agentRuns.getRunDetail, detailRunId ? { runId: detailRunId } : "skip");
  const evalFixtures = useQuery(api.agentEvalFixtures.getRecentForAgent, { agentId });
  const smokeEvalHistory = useQuery(api.agentEvalFixtures.getSmokeEvalHistory, { agentId, limit: 5 });

  // One page at a time, by cursor. Numbered pages would mean counting every job
  // the agent has ever run on each visit, which is the read this screen exists
  // to stop doing.
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const cursor = cursorStack[cursorStack.length - 1];

  const runPage = useQuery(api.agentRuns.getPageForAgent, {
    agentId,
    ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
    paginationOpts: { numItems: TABLE_PAGE_SIZE, cursor },
  });

  const runs = runPage?.page ?? [];
  const isLoading = runPage === undefined;
  const pageNumber = cursorStack.length;
  const canGoBack = cursorStack.length > 1;
  const canGoForward = runPage !== undefined && !runPage.isDone;

  const goToPage = (next: "back" | "forward") => {
    setCursorStack((stack) => {
      if (next === "back") return stack.length > 1 ? stack.slice(0, -1) : stack;
      return runPage?.continueCursor ? [...stack, runPage.continueCursor] : stack;
    });
  };

  const changeFilter = (next: StatusFilter) => {
    setStatusFilter(next);
    setCursorStack([null]);
  };
  const activeEvalFixtureCount = evalFixtures?.length ?? 0;

  // Adjusting state during render rather than in an effect: React re-runs this
  // component before committing, so the detail opens in the same paint. Doing it
  // in an effect renders the closed state first and then immediately again.
  if (requestedRunId && requestedRunId !== syncedRunId) {
    setSyncedRunId(requestedRunId);
    setDetailRunId(requestedRunId);
  }

  const handleReplay = async (runId: Id<"agentRuns">, mode: ReplayMode = "CURRENT_ACTIVE") => {
    const outcome = await action.run(() => replayRun({ runId, mode }), {
      key: runId,
      fallbackMessage: "The run could not be replayed.",
    });
    if (outcome.ok) {
      showToast(
        mode === "SAME_VERSION"
          ? `Replay ${outcome.data.runId} queued against the source run's version snapshot.`
          : `Replay ${outcome.data.runId} queued against the current active configuration.`,
        "success",
      );
    }
  };

  const handleCancel = async (runId: Id<"agentRuns">) => {
    await action.run(() => cancelRun({ runId, reason: "Cancelled from the agent Runs dashboard" }), {
      key: runId,
      successMessage: "Run cancelled. Pending approvals and tool calls were cancelled and audited.",
      fallbackMessage: "The run could not be cancelled.",
    });
  };

  const openFeedback = (
    run: { _id: Id<"agentRuns">; objective: string; markers: { feedback: FeedbackRecord | null } }
  ) => {
    const existing = run.markers.feedback;
    setFeedbackDraft({
      runId: run._id,
      objective: run.objective,
      rating: existing?.rating || "NEUTRAL",
      labels: existing?.labels || [],
      comment: existing?.comment || "",
    });
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackDraft) return;
    const outcome = await action.run(
      () => upsertFeedback({
        runId: feedbackDraft.runId,
        rating: feedbackDraft.rating,
        labels: feedbackDraft.labels,
        comment: feedbackDraft.comment,
      }),
      {
        key: feedbackDraft.runId,
        successMessage: "Feedback saved. It now feeds learning analytics and improvement workflows.",
        fallbackMessage: "The feedback could not be saved.",
      },
    );
    // The draft stays open on failure so the comment is not lost.
    if (outcome.ok) setFeedbackDraft(null);
  };

  const handleReflect = async (runId: Id<"agentRuns">) => {
    await action.run(() => createReflection({ runId }), {
      key: runId,
      successMessage: "Reflection generated: the run trace now has a category, evidence and next steps.",
      fallbackMessage: "The reflection could not be generated.",
    });
  };

  const handleGenerateMemoryCandidates = async (runId: Id<"agentRuns">) => {
    const outcome = await action.run(
      () => generateMemoryCandidates({ runId, autoApplyLowRisk: false }),
      { key: runId, fallbackMessage: "The candidate memory could not be generated." },
    );
    if (!outcome.ok) return;
    const created = outcome.data.createdIds.length;
    showToast(
      created > 0
        ? `Created ${created} candidate memory item${created === 1 ? "" : "s"} for review.`
        : "No new safe candidate memory could be generated from this run.",
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
          ? "Candidate stored as governed agent memory."
          : "Candidate rejected. It will not be used as agent memory.",
        fallbackMessage: "The candidate memory could not be reviewed.",
      },
    );
  };

  const handleCreateEvalFixture = async (runId: Id<"agentRuns">) => {
    await action.run(() => createEvalFixture({ runId }), {
      key: runId,
      successMessage: "Saved as a regression fixture for future improvement checks.",
      fallbackMessage: "The eval fixture could not be created.",
    });
  };

  const handleRunEvalSuite = async () => {
    const outcome = await action.run(() => runEvalSuite({ agentId }), {
      key: EVAL_SUITE_KEY,
      fallbackMessage: "The eval suite could not be run.",
    });
    if (!outcome.ok) return;
    const { total, passed, failed, active } = outcome.data;
    showToast(
      `Ran ${total} contract eval${total === 1 ? "" : "s"}: ${passed} passed, ${failed} failed, ${active} still active.`,
      failed > 0 ? "info" : "success",
    );
  };

  const handleGenerateSuggestions = async (runId: Id<"agentRuns">) => {
    const outcome = await action.run(() => generateImprovementSuggestions({ runId }), {
      key: runId,
      fallbackMessage: "The suggestion could not be generated.",
    });
    if (!outcome.ok) return;
    const created = outcome.data.createdIds.length;
    showToast(
      created > 0
        ? `Created ${created} config suggestion${created === 1 ? "" : "s"} for review.`
        : "No new config suggestion could be generated from this run.",
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
          ? "Suggestion applied. A new agent version snapshot was recorded."
          : "Suggestion rejected. No configuration was changed.",
        fallbackMessage: "The suggestion could not be reviewed.",
      },
    );
  };

  return (
    <>
      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full h-full antialiased">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold text-foreground tracking-tight flex items-center gap-2">
              <Timer className="w-5 h-5 text-brand" />
              Activity
            </h2>
            <p className="text-[13px] text-secondary mt-1">
              Every job this agent has run, what each one cost, and what you can do about it.
            </p>
          </div>
          {/* The same segmented control the Overview and Raw logs screens use.
              Seven separate orange buttons read as seven calls to action; a
              segmented control reads as one choice with seven settings. */}
          <div className="flex flex-wrap gap-1 bg-white/[0.02] border border-border-dim rounded-[10px] p-1 self-start">
            {statusFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => changeFilter(filter)}
                className={`px-3 py-1.5 rounded-[7px] text-[12px] transition-all ${
                  statusFilter === filter
                    ? "bg-card text-foreground border border-border-dim"
                    : "text-secondary hover:text-foreground"
                }`}
              >
                {filter === "ALL" ? "Everything" : describeRunStatus(filter)}
              </button>
            ))}
          </div>
        </div>





        <TableShell
          minWidthClassName="min-w-[860px]"
          footer={
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border-dim text-[12px] text-muted">
              <span>
                {isLoading
                  ? "Loading jobs…"
                  : runs.length === 0
                    ? "No jobs to show"
                    : `Showing ${runs.length} ${runs.length === 1 ? "job" : "jobs"} · page ${pageNumber}`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage("back")}
                  disabled={!canGoBack}
                  className="px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => goToPage("forward")}
                  disabled={!canGoForward}
                  className="px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          }
        >
          <thead>
            <TableHeaderRow>
              <TableHeaderCell className="w-[110px]">Outcome</TableHeaderCell>
              <TableHeaderCell>What it was asked to do</TableHeaderCell>
              <TableHeaderCell className="w-[150px]">When</TableHeaderCell>
              <TableHeaderCell align="right" className="w-[130px]">Took / cost</TableHeaderCell>
              <TableHeaderCell align="right" className="w-[150px]">&nbsp;</TableHeaderCell>
            </TableHeaderRow>
          </thead>
          <tbody>
            {isLoading ? (
              <TableLoadingRow colSpan={5} />
            ) : runs.length === 0 ? (
              <TableEmptyRow
                colSpan={5}
                icon={<Timer className="w-9 h-9 text-brand opacity-60" />}
                label={
                  statusFilter === "ALL"
                    ? "This agent has not run any jobs yet"
                    : "No jobs match that filter"
                }
              />
            ) : (
              runs.map((run) => (
                <tr
                  key={run._id}
                  className="group border-b border-border-dim/50 last:border-b-0 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3 align-top">
                    <span className={`inline-block text-[11px] px-2 py-1 rounded-md border whitespace-nowrap ${STATUS_TONE_CLASSES[getStatusTone(run.status, Boolean(run.continuedByRunId))]}`}>
                      {describeRunStatus(run.status, Boolean(run.continuedByRunId))}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top min-w-0">
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
                          <RowMarker>you rated this {run.markers.feedback.rating.toLowerCase()}</RowMarker>
                        )}
                        {run.markers.reflected && <RowMarker>looked back on</RowMarker>}
                        {run.markers.usedAsCheck && <RowMarker>used as a check</RowMarker>}
                        {run.markers.memoryCandidateIds.length > 0 && (
                          <RowMarker tone="attention">something to remember</RowMarker>
                        )}
                        {run.markers.suggestionIds.length > 0 && (
                          <RowMarker tone="attention">has a suggested change</RowMarker>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top text-[12px] text-secondary whitespace-nowrap">
                    {formatRelativeTime(run.startedAt, now)}
                    <span className="block text-[11px] text-muted">
                      {describeTrigger(run.triggerType)}
                      {run.isRehearsal && (
                        // Text, not colour: a drill must be readable as a drill
                        // by everyone, on every screen.
                        <span className="ml-1.5 rounded-[4px] border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-semibold text-info">
                          Rehearsal
                        </span>
                      )}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top text-right text-[12px] text-secondary tabular-nums whitespace-nowrap">
                    {run.completedAt ? formatDuration(run.completedAt - run.startedAt) : "—"}
                    {run.costGBP !== undefined && (
                      <span className="block text-[11px] text-muted">{formatMoney(run.costGBP)}</span>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/agents/${agentId}/observability/${run._id}`)}
                        className="px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all"
                      >
                        Open
                      </button>
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
                        onRate={() => openFeedback(run)}
                        onRemember={() => handleGenerateMemoryCandidates(run._id)}
                        onMakeCheck={() => handleCreateEvalFixture(run._id)}
                        onSuggest={() => handleGenerateSuggestions(run._id)}
                        onReflect={() => handleReflect(run._id)}
                        onReplay={() => handleReplay(run._id, "CURRENT_ACTIVE")}
                        onCancel={() => handleCancel(run._id)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>

        <div className="border border-border-dim rounded-[14px] bg-card px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold text-foreground tracking-tight flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-brand" />
                Eval health
              </h3>
              <p className="text-[12px] text-secondary mt-1">
                Smoke eval coverage, recent pass/fail results, and fixture contract failures.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <button
                type="button"
                onClick={handleRunEvalSuite}
                disabled={!evalFixtures || activeEvalFixtureCount === 0 || action.isBusy(EVAL_SUITE_KEY)}
                className="px-3 py-2 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[12px] font-semibold hover:bg-brand/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-9"
              >
                {action.isBusy(EVAL_SUITE_KEY) ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                Run suite
              </button>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-2 min-w-0 lg:min-w-[540px]">
                {[
                  { label: "Fixtures", value: evalFixtures ? activeEvalFixtureCount.toLocaleString() : "..." },
                  { label: "Smoke evals", value: smokeEvalHistory ? smokeEvalHistory.totals.total.toLocaleString() : "..." },
                  { label: "Passed", value: smokeEvalHistory ? smokeEvalHistory.totals.passed.toLocaleString() : "..." },
                  { label: "Failed", value: smokeEvalHistory ? smokeEvalHistory.totals.failed.toLocaleString() : "..." },
                  { label: "Model graded", value: smokeEvalHistory ? smokeEvalHistory.totals.modelGraded.toLocaleString() : "..." },
                ].map((stat) => (
                  <div key={stat.label} className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-muted truncate">{stat.label}</div>
                    <div className="text-[17px] font-semibold text-foreground tracking-tight">{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {!smokeEvalHistory ? (
            <div className="py-8 flex items-center justify-center text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : smokeEvalHistory.entries.length === 0 ? (
            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
              No smoke evals have been recorded for this agent yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {smokeEvalHistory.entries.map((entry) => (
                <div key={entry.runId} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-3 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getSmokeEvalTone(entry.status)]}`}>
                          {entry.status.replace("_", " ")}
                        </span>
                        <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-secondary">
                          {getSmokeEvalModeLabel(entry.gradingMode)}
                        </span>
                      </div>
                      <p className="text-[13px] text-foreground mt-2 leading-relaxed line-clamp-2">
                        {entry.fixture?.objective || entry.objective}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-muted shrink-0">
                      {formatDateTime(entry.completedAt ?? entry.startedAt)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] font-mono text-muted">
                    {entry.fixture && <span>{entry.fixture.type.toLowerCase().replaceAll("_", " ")}</span>}
                    {entry.modelId && <span>model: {entry.modelId}</span>}
                    {entry.agentVersionId && <span>version: {entry.agentVersionId}</span>}
                  </div>

                  {(entry.finalOutput || entry.error) && (
                    <p className={`text-[12px] leading-relaxed line-clamp-2 ${entry.status === "FAILED" ? "text-destructive" : "text-secondary"}`}>
                      {entry.error || entry.finalOutput}
                    </p>
                  )}

                  {entry.missingToolMappings.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {entry.missingToolMappings.map((mapping) => (
                        <span key={mapping} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-destructive/20 bg-destructive/10 text-destructive">
                          missing {mapping}
                        </span>
                      ))}
                    </div>
                  )}

                  {entry.expectedBlockedActionSummaries.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {entry.expectedBlockedActionSummaries.map((summary) => (
                        <span key={summary} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-warning/20 bg-warning/10 text-warning">
                          blocked {summary}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setDetailRunId(entry.runId)}
                      className="px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[11px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all flex items-center gap-2"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Inspect run
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


      <SonaeModal
        isOpen={!!detailRunId}
        onClose={() => setDetailRunId(null)}
        title="Job detail"
        size="xl"
      >
        {!detailRunId ? null : runDetail === undefined ? (
          <div className="py-16 flex items-center justify-center text-muted">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : runDetail === null ? (
          <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
            This job could not be found, or it belongs to a workspace you cannot see.
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-3">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getStatusTone(runDetail.run.status)]}`}>
                      {runDetail.run.status.replace("_", " ")}
                    </span>
                    <span className="text-[11px] font-mono text-muted">{runDetail.run.triggerType}</span>
                    {runDetail.run.isRehearsal && (
                      <span className="rounded-[4px] border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-semibold text-info">
                        Rehearsal — writes recorded, not performed
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-muted">{formatDateTime(runDetail.run.startedAt)}</span>
                    {runDetail.run.completedAt && (
                      <span className="text-[11px] font-mono text-muted">
                        {formatDuration(runDetail.run.completedAt - runDetail.run.startedAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] text-foreground leading-relaxed mt-3">{runDetail.run.objective}</p>
                  {/* This modal is for acting on a run — replay it, learn from
                      it, turn it into a check. Reading where its time went is a
                      different job, and it has its own screen. */}
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/agents/${agentId}/observability/${runDetail.run._id}`)}
                    className="text-[12px] text-brand hover:underline mt-2"
                  >
                    See where the time went
                  </button>
                </div>
                <div className="text-[11px] font-mono text-muted md:text-right flex flex-col gap-1 shrink-0">
                  <span>run: {runDetail.run._id}</span>
                  {runDetail.run.agentVersionId && <span>version: {runDetail.run.agentVersionId}</span>}
                  {runDetail.run.modelId && <span>model: {runDetail.run.modelId}</span>}
                </div>
              </div>

              {(runDetail.run.finalOutput || runDetail.run.error) && (
                <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">
                    {runDetail.run.error ? "Error" : "Final output"}
                  </div>
                  <p className={`text-[12px] leading-relaxed whitespace-pre-wrap ${runDetail.run.error ? "text-destructive" : "text-secondary"}`}>
                    {runDetail.run.error || runDetail.run.finalOutput}
                  </p>
                </div>
              )}
            </div>

            <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[12px] uppercase tracking-widest text-muted">What you can do with this job</h3>
                <p className="text-[12px] text-secondary mt-1 leading-relaxed">
                  {runDetail.evalFixtureContext.activeCount > 0
                    ? `This run is covered by ${runDetail.evalFixtureContext.activeCount} active eval fixture${runDetail.evalFixtureContext.activeCount === 1 ? "" : "s"}.`
                    : runDetail.evalFixtureContext.canCreateFromRun
                      ? "Turn this job into a check, so this exact case is tested from now on."
                      : "A job can become a check once it has finished."}
                </p>
                {runDetail.evalFixtureContext.fixtures.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {runDetail.evalFixtureContext.fixtures.map((fixture) => (
                      <span key={fixture.fixtureId} className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${
                        fixture.status === "ACTIVE"
                          ? "border-info/20 bg-info/10 text-info"
                          : "border-border-dim bg-white/[0.03] text-muted"
                      }`}>
                        {fixture.type.toLowerCase().replaceAll("_", " ")} {fixture.status.toLowerCase()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {canReplay(runDetail.run.status) && (
                  <button
                    type="button"
                    onClick={() => handleReplay(runDetail.run._id, "CURRENT_ACTIVE")}
                    disabled={action.isBusy(runDetail.run._id)}
                    className="px-3 py-2 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[12px] font-semibold hover:bg-brand/15 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    Run again now
                  </button>
                )}
                {canReplay(runDetail.run.status) && runDetail.run.agentVersionId && (
                  <button
                    type="button"
                    onClick={() => handleReplay(runDetail.run._id, "SAME_VERSION")}
                    disabled={action.isBusy(runDetail.run._id)}
                    className="px-3 py-2 rounded-[8px] border border-info/20 bg-info/10 text-info text-[12px] font-semibold hover:bg-info/15 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                    Run again as it was
                  </button>
                )}
                {canReplay(runDetail.run.status) && (
                  <button
                    type="button"
                    onClick={() => handleReflect(runDetail.run._id)}
                    disabled={action.isBusy(runDetail.run._id)}
                    className="px-3 py-2 rounded-[8px] border border-info/20 bg-info/10 text-info text-[12px] font-semibold hover:bg-info/15 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                    Ask what it would change
                  </button>
                )}
                {runDetail.evalFixtureContext.canCreateFromRun && (
                  <WriteButton
                    type="button"
                    onClick={() => handleCreateEvalFixture(runDetail.run._id)}
                    disabled={action.isBusy(runDetail.run._id)}
                    className="px-3 py-2 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[12px] font-semibold hover:bg-brand/15 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                    {runDetail.evalFixtureContext.activeCount > 0 ? "Update eval" : "Create eval"}
                  </WriteButton>
                )}
              </div>
            </div>

            {(runDetail.replayContext.sourceRun || runDetail.replayContext.replayRuns.length > 0) && (
              <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <h3 className="text-[12px] uppercase tracking-widest text-muted">Other times this job was run</h3>
                    <p className="text-[12px] text-secondary mt-1">
                      How this job went the other times it was run.
                    </p>
                  </div>
                  {runDetail.run.replayMode && (
                    <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-info/20 bg-info/10 text-info self-start">
                      {runDetail.run.replayMode.replace("_", " ").toLowerCase()}
                    </span>
                  )}
                </div>

                {runDetail.replayContext.sourceRun && runDetail.replayContext.comparison && (
                  <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-3 flex flex-col gap-3">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Replay of</div>
                        <button
                          type="button"
                          onClick={() => setDetailRunId(runDetail.replayContext.sourceRun?.runId || null)}
                          className="text-[13px] text-brand hover:text-brand-light transition-colors text-left break-all"
                        >
                          {runDetail.replayContext.sourceRun.runId}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getStatusTone(runDetail.replayContext.sourceRun.status)]}`}>
                          original {runDetail.replayContext.sourceRun.status.replace("_", " ")}
                        </span>
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getStatusTone(runDetail.replayContext.comparison.replayStatus)]}`}>
                          replay {runDetail.replayContext.comparison.replayStatus.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                      {[
                        { label: "Latency", value: formatSignedDurationDelta(runDetail.replayContext.comparison.latencyDeltaMs) },
                        { label: "Cost", value: formatSignedCurrencyDelta(runDetail.replayContext.comparison.costDeltaGBP) },
                        { label: "Tokens", value: formatSignedNumberDelta(runDetail.replayContext.comparison.tokenDelta) },
                        { label: "Steps", value: formatSignedNumberDelta(runDetail.replayContext.comparison.stepCountDelta) },
                        {
                          label: "Output",
                          value: runDetail.replayContext.comparison.outputChanged ? "changed" : "same",
                        },
                      ].map((item) => (
                        <div key={item.label} className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                          <div className="text-[10px] uppercase tracking-widest font-mono text-muted truncate">{item.label}</div>
                          <div className="text-[13px] text-foreground font-semibold mt-1 truncate">{item.value}</div>
                        </div>
                      ))}
                    </div>
                    {runDetail.replayContext.timelineDiff.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Timeline diff</div>
                        {runDetail.replayContext.timelineDiff.map((diff) => (
                          <div key={diff.stepIndex} className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-3 flex flex-col gap-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-secondary">
                                  step {diff.stepIndex}
                                </span>
                                <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getStepDiffTone(diff.changeType)]}`}>
                                  {diff.changeType.toLowerCase()}
                                </span>
                                {diff.durationDeltaMs !== undefined && (
                                  <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-muted">
                                    {formatSignedDurationDelta(diff.durationDeltaMs)}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                                {diff.kindChanged && <span>kind</span>}
                                {diff.statusChanged && <span>status</span>}
                                {diff.outputChanged && <span>output</span>}
                                {diff.errorChanged && <span>error</span>}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                              <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 min-w-0">
                                <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">Original</div>
                                {diff.source ? (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex flex-wrap gap-2">
                                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{diff.source.kind.replace("_", " ")}</span>
                                      <span className={`text-[10px] uppercase font-mono tracking-widest ${diff.source.status === "FAILED" ? "text-destructive" : "text-secondary"}`}>
                                        {diff.source.status}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-secondary leading-relaxed whitespace-pre-wrap">{diff.source.summary}</p>
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-muted">No matching original step.</p>
                                )}
                              </div>
                              <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 min-w-0">
                                <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">Replay</div>
                                {diff.replay ? (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex flex-wrap gap-2">
                                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{diff.replay.kind.replace("_", " ")}</span>
                                      <span className={`text-[10px] uppercase font-mono tracking-widest ${diff.replay.status === "FAILED" ? "text-destructive" : "text-secondary"}`}>
                                        {diff.replay.status}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-secondary leading-relaxed whitespace-pre-wrap">{diff.replay.summary}</p>
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-muted">No matching replay step.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {runDetail.replayContext.replayRuns.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Recent replays</div>
                    {runDetail.replayContext.replayRuns.map((replay) => (
                      <button
                        key={replay.runId}
                        type="button"
                        onClick={() => setDetailRunId(replay.runId)}
                        className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.05] transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                      >
                        <span className="text-[12px] text-secondary break-all">{replay.runId}</span>
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border self-start sm:self-auto ${STATUS_TONE_CLASSES[getStatusTone(replay.status)]}`}>
                          {replay.status.replace("_", " ")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-muted">Steps</div>
                <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.steps.length}</div>
              </div>
              <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-muted">Tools used</div>
                <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.toolCalls.length}</div>
              </div>
              <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-muted">Waiting on people</div>
                <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.approvals.length}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[12px] uppercase tracking-widest text-muted">What it did, step by step</h3>
              {runDetail.timeline.length === 0 ? (
                <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
                  This job did not get far enough to record what it was doing.
                </div>
              ) : (
                runDetail.timeline.map((step) => (
                  <div key={step.stepId} className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-secondary">
                          {step.stepIndex}. {describeStepKind(step.kind)}
                        </span>
                        <span className={`text-[11px] px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getStepTone(step.status)]}`}>
                          {describeStepStatus(step.status)}
                        </span>
                        {step.durationMs !== undefined && (
                          <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-black/20 text-muted">
                            {formatDuration(step.durationMs)}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-muted">{formatDateTime(step.startedAt)}</span>
                    </div>
                    <p className="text-[12px] text-secondary leading-relaxed whitespace-pre-wrap">{step.summary}</p>

                    {(step.inputPreview || step.outputPreview || step.errorPreview) && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        {step.inputPreview && (
                          <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">What we sent</div>
                            <pre className="text-[11px] text-secondary whitespace-pre-wrap overflow-x-auto">{step.inputPreview}</pre>
                          </div>
                        )}
                        {(step.outputPreview || step.errorPreview) && (
                          <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                            <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">
                              {step.errorPreview ? "What went wrong" : "What came back"}
                            </div>
                            <pre className={`text-[11px] whitespace-pre-wrap overflow-x-auto ${step.errorPreview ? "text-destructive" : "text-secondary"}`}>
                              {step.errorPreview || step.outputPreview}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 text-[11px] font-mono text-muted">
                      {/* Left as tokens. It is the unit this is actually
                          measured in, and calling them words would be plainer
                          but wrong — a token is roughly three quarters of one. */}
                      {step.inputTokens !== undefined && step.outputTokens !== undefined && (
                        <span>{(step.inputTokens + step.outputTokens).toLocaleString("en-GB")} tokens</span>
                      )}
                      {step.costGBP !== undefined && <span>cost {formatMoney(step.costGBP)}</span>}
                    </div>
                    {(step.linkedToolCalls.length > 0 || step.linkedApprovals.length > 0) && (
                      <div className="flex flex-wrap gap-2">
                        {step.linkedToolCalls.map((toolCall) => (
                          <span key={toolCall.toolCallId} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-info/20 bg-info/10 text-info">
                            tool {toolCall.handlerMapping}: {toolCall.status.toLowerCase().replace("_", " ")}
                          </span>
                        ))}
                        {step.linkedApprovals.map((approval) => (
                          <span key={approval.approvalId} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-info/20 bg-info/10 text-info">
                            approval {approval.status.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {runDetail.toolCalls.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted">Tool calls</h3>
                {runDetail.toolCalls.map((toolCall) => (
                  <div key={toolCall._id} className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-foreground truncate">{toolCall.normalizedToolName}</div>
                        <div className="text-[11px] font-mono text-muted truncate">{toolCall.handlerMapping}</div>
                      </div>
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[toolCall.status === "SUCCESS" ? "success" : toolCall.status === "FAILED" || toolCall.status === "DENIED" ? "danger" : "info"]}`}>
                        {toolCall.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] font-mono text-muted">
                      <span>{toolCall.sideEffectLevel.toLowerCase()}</span>
                      <span>{toolCall.requiredRole.toLowerCase()}</span>
                      {toolCall.confirmationRequired && <span>confirmation required</span>}
                      <span>{toolCall.argumentViewMode.toLowerCase()} args</span>
                    </div>
                    <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                        <div className="text-[10px] uppercase tracking-widest font-mono text-muted">
                          {toolCall.argumentViewMode === "RAW" ? "Raw arguments" : "Redacted arguments"}
                        </div>
                        {toolCall.rawArgumentsAvailable && toolCall.argumentViewMode !== "RAW" && (
                          <span className="text-[10px] uppercase tracking-widest font-mono text-muted">
                            raw restricted
                          </span>
                        )}
                      </div>
                      <pre className="text-[11px] text-secondary overflow-x-auto whitespace-pre-wrap">
                        {toolCall.argumentsPreview}
                      </pre>
                    </div>
                    {(toolCall.resultJson || toolCall.error) && (
                      <p className={`text-[12px] leading-relaxed line-clamp-4 ${toolCall.error ? "text-destructive" : "text-secondary"}`}>
                        {toolCall.error || toolCall.resultJson}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {runDetail.approvals.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted">Approvals</h3>
                {runDetail.approvals.map((approval) => (
                  <div key={approval._id} className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border w-fit ${STATUS_TONE_CLASSES[approval.status === "APPROVED" ? "success" : approval.status === "REJECTED" ? "danger" : "info"]}`}>
                        {approval.status}
                      </span>
                      <span className="text-[11px] font-mono text-muted">{formatDateTime(approval.requestedAt)}</span>
                    </div>
                    {approval.message && <p className="text-[12px] text-secondary leading-relaxed">{approval.message}</p>}
                    {approval.previewJson && (
                      <pre className="text-[11px] text-secondary bg-black/20 border border-border-dim rounded-[8px] p-3 overflow-x-auto whitespace-pre-wrap">
                        {approval.previewJson}
                      </pre>
                    )}
                    {approval.decisionReason && (
                      <p className="text-[12px] text-secondary leading-relaxed">
                        <span className="text-muted font-mono">decision:</span> {approval.decisionReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SonaeModal>

      <SonaeModal
        isOpen={!!feedbackDraft}
        onClose={() => !action.isBusy() && setFeedbackDraft(null)}
        title="Run feedback"
        size="lg"
      >
        {feedbackDraft && (
          <div className="flex flex-col gap-6">
            <div className="p-3 rounded-[8px] bg-white/[0.03] border border-border-dim">
              <p className="text-[13px] text-secondary leading-relaxed line-clamp-3">{feedbackDraft.objective}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                { rating: "POSITIVE" as const, label: "Positive", icon: ThumbsUp },
                { rating: "NEUTRAL" as const, label: "Neutral", icon: MinusCircle },
                { rating: "NEGATIVE" as const, label: "Negative", icon: ThumbsDown },
              ]).map(({ rating, label, icon: Icon }) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setFeedbackDraft({ ...feedbackDraft, rating })}
                  className={`px-3 py-2.5 rounded-[8px] border text-[13px] font-medium flex items-center justify-center gap-2 transition-all ${
                    feedbackDraft.rating === rating
                      ? "bg-brand text-white border-brand"
                      : "bg-white/[0.02] text-secondary border-border-dim hover:text-foreground hover:bg-white/[0.05]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[12px] uppercase tracking-widest font-mono text-muted">Labels</span>
              <div className="flex flex-wrap gap-2">
                {feedbackLabels.map((option) => {
                  const selected = feedbackDraft.labels.includes(option.label);
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => {
                        const labels = selected
                          ? feedbackDraft.labels.filter((label) => label !== option.label)
                          : [...feedbackDraft.labels, option.label];
                        setFeedbackDraft({ ...feedbackDraft, labels });
                      }}
                      className={`px-3 py-1.5 rounded-[8px] border text-[12px] flex items-center gap-2 transition-all ${
                        selected
                          ? "bg-brand/15 text-brand border-brand/30"
                          : "bg-white/[0.02] text-secondary border-border-dim hover:text-foreground hover:bg-white/[0.05]"
                      }`}
                    >
                      {selected && <Check className="w-3.5 h-3.5" />}
                      {option.text}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-[12px] uppercase tracking-widest font-mono text-muted">Comment</span>
              <textarea
                value={feedbackDraft.comment}
                onChange={(event) => setFeedbackDraft({ ...feedbackDraft, comment: event.target.value })}
                rows={4}
                className="w-full rounded-[8px] bg-black/20 border border-border-dim px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand/50 resize-none"
                placeholder="What should this run teach the agent improvement loop?"
              />
            </label>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFeedbackDraft(null)}
                disabled={action.isBusy()}
                className="px-5 py-2.5 rounded-[8px] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <WriteButton
                type="button"
                onClick={handleFeedbackSubmit}
                disabled={action.isBusy()}
                className="px-5 py-2.5 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {action.isBusy() ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                Save feedback
              </WriteButton>
            </div>
          </div>
        )}
      </SonaeModal>
    </>
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
  const items: Array<{ label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }> = [];

  // Anything waiting on a decision comes first: it is the only reason somebody
  // opens this menu without already knowing what they want.
  if (pendingCandidateId) {
    items.push(
      {
        label: "Let it remember this",
        icon: <Check className="w-3.5 h-3.5" />,
        onClick: () => onDecideCandidate(pendingCandidateId, "APPROVED"),
      },
      {
        label: "Do not remember this",
        icon: <MinusCircle className="w-3.5 h-3.5" />,
        onClick: () => onDecideCandidate(pendingCandidateId, "REJECTED"),
      }
    );
  }

  if (pendingSuggestionId) {
    items.push(
      {
        label: "Accept the suggested change",
        icon: <Check className="w-3.5 h-3.5" />,
        onClick: () => onDecideSuggestion(pendingSuggestionId, "APPROVED"),
      },
      {
        label: "Dismiss the suggested change",
        icon: <MinusCircle className="w-3.5 h-3.5" />,
        onClick: () => onDecideSuggestion(pendingSuggestionId, "REJECTED"),
      }
    );
  }

  items.push({ label: "Tell us how this went", icon: <MessageSquare className="w-3.5 h-3.5" />, onClick: onRate });

  if (canLearnFrom(status)) {
    items.push(
      { label: "Work out what to remember", icon: <Brain className="w-3.5 h-3.5" />, onClick: onRemember },
      { label: "Turn this into a check", icon: <ClipboardCheck className="w-3.5 h-3.5" />, onClick: onMakeCheck },
      { label: "Suggest a change to this agent", icon: <SlidersHorizontal className="w-3.5 h-3.5" />, onClick: onSuggest }
    );
  }

  if (canReplay(status)) {
    items.push(
      { label: "Ask what it would do differently", icon: <Lightbulb className="w-3.5 h-3.5" />, onClick: onReflect },
      { label: "Run this again", icon: <RotateCcw className="w-3.5 h-3.5" />, onClick: onReplay }
    );
  }

  if (canCancel(status)) {
    items.push({ label: "Stop this job", icon: <Ban className="w-3.5 h-3.5" />, onClick: onCancel, danger: true });
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
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-label="More things you can do with this job"
        aria-expanded={isOpen}
        className="p-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all"
      >
        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
      </button>

      {isOpen && anchor && typeof document !== "undefined" && createPortal(
        <>
          {/* Clicking anywhere else closes it, without any of the rows needing
              to know the menu exists. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={handleToggle}
            className="fixed inset-0 z-[60] cursor-default"
          />
          <div
            key={runId}
            style={{ top: anchor.top, right: anchor.right }}
            className="fixed z-[61] w-[248px] rounded-[12px] border border-border-dim bg-card p-1.5 shadow-xl"
          >
            {items.map((item) => (
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
