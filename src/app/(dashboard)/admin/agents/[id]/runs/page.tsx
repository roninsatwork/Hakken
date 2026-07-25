"use client";

import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams, useSearchParams } from "next/navigation";
import { Ban, Brain, Check, ClipboardCheck, Clock3, Eye, Lightbulb, Loader2, MessageSquare, MinusCircle, PlayCircle, RotateCcw, ShieldCheck, SlidersHorizontal, ThumbsDown, ThumbsUp, Timer, Wrench, X, type LucideIcon } from "lucide-react";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useToast } from "@/src/context/ToastContext";

type AgentRun = Doc<"agentRuns">;
type AgentRunFeedback = Doc<"agentRunFeedback">;
type AgentRunReflection = Doc<"agentRunReflections">;
type AgentMemoryCandidate = Doc<"agentMemoryCandidates">;
type AgentEvalFixture = Doc<"agentEvalFixtures">;
type AgentVersion = Doc<"agentVersions">;
type AgentImprovementSuggestion = Doc<"agentImprovementSuggestions">;
type RunStatus = AgentRun["status"];
type StatusFilter = "ALL" | RunStatus;
type FeedbackRating = AgentRunFeedback["rating"];
type FeedbackLabel = AgentRunFeedback["labels"][number];
type ReplayMode = "CURRENT_ACTIVE" | "SAME_VERSION";

const statusFilters: StatusFilter[] = ["ALL", "QUEUED", "RUNNING", "PENDING_APPROVAL", "SUCCESS", "FAILED", "CANCELLED"];
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

function formatCurrency(value: number) {
  return `£${value.toLocaleString("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

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
  return `${prefix}${formatCurrency(value)}`;
}

function getStatusTone(status: RunStatus) {
  if (status === "SUCCESS") return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  if (status === "FAILED") return "text-red-500 bg-red-500/10 border-red-500/20";
  if (status === "CANCELLED") return "text-amber-500 bg-amber-500/10 border-amber-500/20";
  if (status === "PENDING_APPROVAL") return "text-indigo-500 bg-indigo-500/10 border-indigo-500/20";
  return "text-sky-500 bg-sky-500/10 border-sky-500/20";
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

function getFeedbackTone(rating: FeedbackRating) {
  if (rating === "POSITIVE") return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  if (rating === "NEGATIVE") return "text-red-500 bg-red-500/10 border-red-500/20";
  return "text-secondary bg-white/[0.04] border-border-dim";
}

function getReflectionTone(category: string) {
  if (category === "USER_CANCELLED") return "text-amber-500 bg-amber-500/10 border-amber-500/20";
  if (category === "APPROVAL_REJECTED" || category === "POLICY_BLOCKED") return "text-indigo-500 bg-indigo-500/10 border-indigo-500/20";
  if (category === "BAD_TOOL_ARGUMENTS" || category === "TOOL_FAILURE") return "text-red-500 bg-red-500/10 border-red-500/20";
  return "text-sky-500 bg-sky-500/10 border-sky-500/20";
}

function getSmokeEvalTone(status: RunStatus) {
  if (status === "SUCCESS") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-500";
  if (status === "FAILED") return "border-red-500/20 bg-red-500/10 text-red-500";
  if (status === "CANCELLED") return "border-amber-500/20 bg-amber-500/10 text-amber-500";
  return "border-sky-500/20 bg-sky-500/10 text-sky-500";
}

function getSmokeEvalModeLabel(mode: string) {
  return mode === "MODEL_GRADED" ? "Model graded" : "Contract";
}

function getStepTone(status: string) {
  if (status === "SUCCESS") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-500";
  if (status === "FAILED") return "border-red-500/20 bg-red-500/10 text-red-500";
  if (status === "SKIPPED") return "border-amber-500/20 bg-amber-500/10 text-amber-500";
  return "border-sky-500/20 bg-sky-500/10 text-sky-500";
}

function getStepDiffTone(changeType: string) {
  if (changeType === "ADDED") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-500";
  if (changeType === "REMOVED") return "border-red-500/20 bg-red-500/10 text-red-500";
  if (changeType === "CHANGED") return "border-amber-500/20 bg-amber-500/10 text-amber-500";
  return "border-border-dim bg-white/[0.03] text-muted";
}

function MetricTile({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 rounded-[8px] bg-brand/10 text-brand flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted uppercase tracking-widest font-mono truncate">{label}</div>
        <div className="text-[18px] text-foreground font-semibold tracking-tight truncate">{value}</div>
      </div>
    </div>
  );
}

export default function AgentRunsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const agentId = params.id as Id<"agents">;
  const requestedRunId = searchParams.get("runId") as Id<"agentRuns"> | null;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  // Seeded from the URL so a link straight to ?runId=… opens the detail on the
  // first render rather than flashing the list and then opening it.
  const [detailRunId, setDetailRunId] = useState<Id<"agentRuns"> | null>(requestedRunId);
  const [syncedRunId, setSyncedRunId] = useState<Id<"agentRuns"> | null>(requestedRunId);

  // The suite is page-level rather than per-row, so it needs a key of its own
  // to avoid sharing a busy flag with every row action.
  const EVAL_SUITE_KEY = "eval-suite";
  // One runner for every write on this page: it owns the per-row busy state,
  // unwraps failures into a sentence, and reports them. See useAdminAction.
  const action = useAdminAction({ scope: "admin-agent-runs" });
  const { showToast } = useToast();
  const [feedbackDraft, setFeedbackDraft] = useState<{
    run: AgentRun;
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
  const analytics = useQuery(api.agentRuns.getAnalyticsForAgent, { agentId });
  const runDetail = useQuery(api.agentRuns.getRunDetail, detailRunId ? { runId: detailRunId } : "skip");
  const myFeedback = useQuery(api.agentRunFeedback.getMineForAgent, { agentId });
  const reflections = useQuery(api.agentRunReflections.getRecentForAgent, { agentId });
  const memoryCandidates = useQuery(api.agentMemoryCandidates.getRecentForAgent, { agentId });
  const evalFixtures = useQuery(api.agentEvalFixtures.getRecentForAgent, { agentId });
  const smokeEvalHistory = useQuery(api.agentEvalFixtures.getSmokeEvalHistory, { agentId, limit: 5 });
  const improvementSuggestions = useQuery(api.agentImprovementSuggestions.getRecentForAgent, { agentId });
  const {
    results: agentVersions,
    status: versionStatus,
  } = usePaginatedQuery(
    api.agentVersions.getForAgent,
    { agentId },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  const runArgs = useMemo(
    () => statusFilter === "ALL" ? { agentId } : { agentId, status: statusFilter },
    [agentId, statusFilter]
  );
  const { results: runs, status, loadMore } = usePaginatedQuery(
    api.agentRuns.getForAgent,
    runArgs,
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";
  const latestVersion = agentVersions[0] as AgentVersion | undefined;
  const feedbackByRun = useMemo(() => {
    const entries = new Map<Id<"agentRuns">, AgentRunFeedback>();
    for (const entry of myFeedback || []) {
      entries.set(entry.runId, entry);
    }
    return entries;
  }, [myFeedback]);
  const reflectionByRun = useMemo(() => {
    const entries = new Map<Id<"agentRuns">, AgentRunReflection>();
    for (const entry of reflections || []) {
      entries.set(entry.runId, entry);
    }
    return entries;
  }, [reflections]);
  const candidatesByRun = useMemo(() => {
    const entries = new Map<Id<"agentRuns">, AgentMemoryCandidate[]>();
    for (const candidate of memoryCandidates || []) {
      const current = entries.get(candidate.sourceRunId) || [];
      entries.set(candidate.sourceRunId, [...current, candidate]);
    }
    return entries;
  }, [memoryCandidates]);
  const fixtureByRun = useMemo(() => {
    const entries = new Map<Id<"agentRuns">, AgentEvalFixture>();
    for (const fixture of evalFixtures || []) {
      entries.set(fixture.sourceRunId, fixture);
    }
    return entries;
  }, [evalFixtures]);
  const suggestionsByRun = useMemo(() => {
    const entries = new Map<Id<"agentRuns">, AgentImprovementSuggestion[]>();
    for (const suggestion of improvementSuggestions || []) {
      if (!suggestion.sourceRunId) continue;
      const current = entries.get(suggestion.sourceRunId) || [];
      entries.set(suggestion.sourceRunId, [...current, suggestion]);
    }
    return entries;
  }, [improvementSuggestions]);
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

  const openFeedback = (run: AgentRun) => {
    const existing = feedbackByRun.get(run._id);
    setFeedbackDraft({
      run,
      rating: existing?.rating || "NEUTRAL",
      labels: existing?.labels || [],
      comment: existing?.comment || "",
    });
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackDraft) return;
    const outcome = await action.run(
      () => upsertFeedback({
        runId: feedbackDraft.run._id,
        rating: feedbackDraft.rating,
        labels: feedbackDraft.labels,
        comment: feedbackDraft.comment,
      }),
      {
        key: feedbackDraft.run._id,
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
              Agent runs
            </h2>
            <p className="text-[13px] text-secondary mt-1">
              Inspect durable execution history, reliability, cost, tool usage, and replay controls.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded-[8px] border text-[11px] font-mono uppercase tracking-widest transition-all ${
                  statusFilter === filter
                    ? "bg-brand text-white border-brand"
                    : "bg-white/[0.02] text-secondary border-border-dim hover:text-foreground hover:bg-white/[0.05]"
                }`}
              >
                {filter.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
          <MetricTile label="Success rate" value={analytics ? formatPercent(analytics.totals.successRate) : "..."} icon={ShieldCheck} />
          <MetricTile label="Feedback" value={analytics ? formatPercent(analytics.totals.positiveFeedbackRate) : "..."} icon={ThumbsUp} />
          <MetricTile label="Versions" value={versionStatus === "LoadingFirstPage" ? "..." : agentVersions.length.toLocaleString()} icon={ClipboardCheck} />
          <MetricTile label="Total cost" value={analytics ? formatCurrency(analytics.totals.costGBP) : "..."} icon={Clock3} />
          <MetricTile label="Avg latency" value={analytics ? formatDuration(analytics.totals.averageLatencyMs) : "..."} icon={Timer} />
          <MetricTile label="Tool calls" value={analytics ? analytics.totals.toolCalls.toLocaleString() : "..."} icon={Wrench} />
        </div>

        <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-4 flex flex-col gap-4">
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
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getSmokeEvalTone(entry.status)}`}>
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
                    <p className={`text-[12px] leading-relaxed line-clamp-2 ${entry.status === "FAILED" ? "text-red-400" : "text-secondary"}`}>
                      {entry.error || entry.finalOutput}
                    </p>
                  )}

                  {entry.missingToolMappings.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {entry.missingToolMappings.map((mapping) => (
                        <span key={mapping} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-red-500/20 bg-red-500/10 text-red-400">
                          missing {mapping}
                        </span>
                      ))}
                    </div>
                  )}

                  {entry.expectedBlockedActionSummaries.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {entry.expectedBlockedActionSummaries.map((summary) => (
                        <span key={summary} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-300">
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

        {analytics && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-4">
              <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted mb-3">Run status</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(analytics.statusCounts).map(([key, count]) => (
                  <span key={key} className="px-2 py-1 rounded-md bg-white/[0.04] text-[12px] text-secondary font-mono">
                    {key}: {count}
                  </span>
                ))}
              </div>
            </div>
            <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-4">
              <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted mb-3">Top tools</h3>
              <div className="flex flex-col gap-2">
                {analytics.toolStats.slice(0, 3).map((tool) => (
                  <div key={tool.handlerMapping} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-secondary font-mono truncate">{tool.handlerMapping}</span>
                    <span className="text-foreground font-semibold">{tool.successes}/{tool.calls}</span>
                  </div>
                ))}
                {analytics.toolStats.length === 0 && <span className="text-[13px] text-muted">No tool calls recorded.</span>}
              </div>
            </div>
            <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-4">
              <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted mb-3">Failures</h3>
              <div className="flex flex-col gap-2">
                {analytics.failureReasons.map((failure) => (
                  <div key={failure.reason} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-secondary truncate">{failure.reason}</span>
                    <span className="text-foreground font-semibold">{failure.count}</span>
                  </div>
                ))}
                {analytics.failureReasons.length === 0 && <span className="text-[13px] text-muted">No failed runs in the sample.</span>}
              </div>
            </div>
          </div>
        )}

        {latestVersion && (
          <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Latest agent version</div>
              <div className="text-[13px] text-secondary mt-1 truncate">
                v{latestVersion.versionNumber} · prompt {latestVersion.promptHash} · tools {latestVersion.toolSetHash} · memory {latestVersion.memoryRevisionHash}
              </div>
            </div>
            <span className="text-[11px] font-mono text-muted flex-shrink-0">{formatDateTime(latestVersion.createdAt)}</span>
          </div>
        )}

        {isLoading ? (
          <div className="w-full py-16 flex items-center justify-center text-muted">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <div className="w-full flex-1 min-h-[360px] border border-border-dim bg-white/[0.02] rounded-[8px] flex flex-col items-center justify-center gap-4">
            <Timer className="w-10 h-10 text-brand opacity-60" />
            <div className="text-center flex flex-col items-center gap-1">
              <span className="text-[16px] font-semibold text-foreground tracking-tight">No runs found</span>
              <span className="text-secondary text-[13px]">This agent has no durable runs for the selected filter.</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {runs.map((run) => (
              <div key={run._id} className="border border-border-dim rounded-[8px] bg-black/20 px-5 py-4 flex flex-col gap-4">
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                  <div className="min-w-0 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStatusTone(run.status)}`}>
                        {run.status.replace("_", " ")}
                      </span>
                      <span className="text-[11px] font-mono text-muted">{run.triggerType}</span>
                      <span className="text-[11px] font-mono text-muted">{formatDateTime(run.startedAt)}</span>
                      {run.completedAt && <span className="text-[11px] font-mono text-muted">{formatDuration(run.completedAt - run.startedAt)}</span>}
                    </div>
                    <p className="text-[14px] text-foreground leading-relaxed line-clamp-2">{run.objective}</p>
                    <div className="flex flex-wrap gap-3 text-[11px] text-muted font-mono">
                      <span>run: {run._id}</span>
                      {run.modelId && <span>model: {run.modelId}</span>}
                      {run.costGBP !== undefined && <span>cost: {formatCurrency(run.costGBP)}</span>}
                      {feedbackByRun.get(run._id) && (
                        <span className={`px-2 py-0.5 rounded-md border ${getFeedbackTone(feedbackByRun.get(run._id)!.rating)}`}>
                          feedback: {feedbackByRun.get(run._id)!.rating.toLowerCase()}
                        </span>
                      )}
                      {reflectionByRun.get(run._id) && (
                        <span className={`px-2 py-0.5 rounded-md border ${getReflectionTone(reflectionByRun.get(run._id)!.category)}`}>
                          reflection: {reflectionByRun.get(run._id)!.category.toLowerCase().replaceAll("_", " ")}
                        </span>
                      )}
                      {(candidatesByRun.get(run._id) || []).map((candidate) => (
                        <span key={candidate._id} className="px-2 py-0.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                          memory: {candidate.kind.toLowerCase()} {candidate.riskLevel.toLowerCase()}
                        </span>
                      ))}
                      {fixtureByRun.get(run._id) && (
                        <span className="px-2 py-0.5 rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-500">
                          eval: {fixtureByRun.get(run._id)!.type.toLowerCase().replaceAll("_", " ")}
                        </span>
                      )}
                      {(suggestionsByRun.get(run._id) || []).map((suggestion) => (
                        <span
                          key={suggestion._id}
                          className={`px-2 py-0.5 rounded-md border ${
                            suggestion.type === "SKILL_INSTRUCTION_CHANGE"
                              ? "border-sky-500/20 bg-sky-500/10 text-sky-500"
                              : "border-indigo-500/20 bg-indigo-500/10 text-indigo-500"
                          }`}
                        >
                          {suggestion.type === "SKILL_INSTRUCTION_CHANGE" ? "skill" : "suggestion"}: {suggestion.type.toLowerCase().replaceAll("_", " ")}
                        </span>
                      ))}
                      {run.agentVersionId && <span>version: {run.agentVersionId}</span>}
                    </div>
                    {(run.error || run.finalOutput) && (
                      <p className="text-[12px] text-secondary leading-relaxed line-clamp-2">
                        {run.error || run.finalOutput}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setDetailRunId(run._id)}
                      className="p-2 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-secondary hover:text-foreground border border-border-dim transition-all"
                      title="Inspect run details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {(suggestionsByRun.get(run._id) || []).slice(0, 1).map((suggestion) => (
                      <div key={suggestion._id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSuggestionDecision(suggestion._id, "APPROVED")}
                          className="p-2 rounded-md bg-white/[0.04] hover:bg-indigo-500/10 text-secondary hover:text-indigo-400 border border-border-dim transition-all"
                          title="Approve and apply suggestion"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSuggestionDecision(suggestion._id, "REJECTED")}
                          className="p-2 rounded-md bg-white/[0.04] hover:bg-red-500/10 text-secondary hover:text-red-400 border border-border-dim transition-all"
                          title="Reject suggestion"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {(candidatesByRun.get(run._id) || []).slice(0, 1).map((candidate) => (
                      <div key={candidate._id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCandidateDecision(candidate._id, "APPROVED")}
                          disabled={action.isBusy(candidate._id)}
                          className="p-2 rounded-md bg-white/[0.04] hover:bg-emerald-500/10 text-secondary hover:text-emerald-400 border border-border-dim transition-all disabled:opacity-50"
                          title="Approve memory candidate"
                        >
                          {action.isBusy(candidate._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCandidateDecision(candidate._id, "REJECTED")}
                          disabled={action.isBusy(candidate._id)}
                          className="p-2 rounded-md bg-white/[0.04] hover:bg-red-500/10 text-secondary hover:text-red-400 border border-border-dim transition-all disabled:opacity-50"
                          title="Reject memory candidate"
                        >
                          {action.isBusy(candidate._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => openFeedback(run)}
                      disabled={action.isBusy(run._id)}
                      className="p-2 rounded-md bg-white/[0.04] hover:bg-emerald-500/10 text-secondary hover:text-emerald-400 border border-border-dim transition-all disabled:opacity-50"
                      title="Leave feedback"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    {canLearnFrom(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleGenerateMemoryCandidates(run._id)}
                        disabled={action.isBusy(run._id)}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-emerald-500/10 text-secondary hover:text-emerald-400 border border-border-dim transition-all disabled:opacity-50"
                        title="Generate memory candidate"
                      >
                        {action.isBusy(run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                      </button>
                    )}
                    {canLearnFrom(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleCreateEvalFixture(run._id)}
                        disabled={action.isBusy(run._id)}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-sky-500/10 text-secondary hover:text-sky-400 border border-border-dim transition-all disabled:opacity-50"
                        title="Create eval fixture"
                      >
                        {action.isBusy(run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                      </button>
                    )}
                    {canLearnFrom(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleGenerateSuggestions(run._id)}
                        disabled={action.isBusy(run._id)}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-indigo-500/10 text-secondary hover:text-indigo-400 border border-border-dim transition-all disabled:opacity-50"
                        title="Generate config suggestion"
                      >
                        {action.isBusy(run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <SlidersHorizontal className="w-4 h-4" />}
                      </button>
                    )}
                    {canReplay(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleReflect(run._id)}
                        disabled={action.isBusy(run._id)}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-sky-500/10 text-secondary hover:text-sky-400 border border-border-dim transition-all disabled:opacity-50"
                        title="Generate reflection"
                      >
                        {action.isBusy(run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                      </button>
                    )}
                    {canReplay(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleReplay(run._id, "CURRENT_ACTIVE")}
                        disabled={action.isBusy(run._id)}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-brand/10 text-secondary hover:text-brand border border-border-dim transition-all disabled:opacity-50"
                        title="Replay with current active config"
                      >
                        {action.isBusy(run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      </button>
                    )}
                    {canCancel(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleCancel(run._id)}
                        disabled={action.isBusy(run._id)}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-amber-500/10 text-secondary hover:text-amber-400 border border-border-dim transition-all disabled:opacity-50"
                        title="Cancel run"
                      >
                        {action.isBusy(run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <AdminLoadMoreFooter
          visibleCount={runs.length}
          canLoadMore={canLoadMore}
          isLoading={isLoadingMore}
          onLoadMore={() => loadMore(ADMIN_PAGE_SIZE)}
          labels={{
            empty: "No runs found",
            showing: (count) => `Showing ${count} runs`,
            loadMore: "Load more runs",
            loading: "Loading runs...",
          }}
        />
      </div>


      <SonaeModal
        isOpen={!!detailRunId}
        onClose={() => setDetailRunId(null)}
        title="Run detail"
        size="xl"
      >
        {!detailRunId ? null : runDetail === undefined ? (
          <div className="py-16 flex items-center justify-center text-muted">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : runDetail === null ? (
          <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
            This run could not be found or is no longer accessible.
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-3">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStatusTone(runDetail.run.status)}`}>
                      {runDetail.run.status.replace("_", " ")}
                    </span>
                    <span className="text-[11px] font-mono text-muted">{runDetail.run.triggerType}</span>
                    <span className="text-[11px] font-mono text-muted">{formatDateTime(runDetail.run.startedAt)}</span>
                    {runDetail.run.completedAt && (
                      <span className="text-[11px] font-mono text-muted">
                        {formatDuration(runDetail.run.completedAt - runDetail.run.startedAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] text-foreground leading-relaxed mt-3">{runDetail.run.objective}</p>
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
                  <p className={`text-[12px] leading-relaxed whitespace-pre-wrap ${runDetail.run.error ? "text-red-400" : "text-secondary"}`}>
                    {runDetail.run.error || runDetail.run.finalOutput}
                  </p>
                </div>
              )}
            </div>

            <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted">Learning actions</h3>
                <p className="text-[12px] text-secondary mt-1 leading-relaxed">
                  {runDetail.evalFixtureContext.activeCount > 0
                    ? `This run is covered by ${runDetail.evalFixtureContext.activeCount} active eval fixture${runDetail.evalFixtureContext.activeCount === 1 ? "" : "s"}.`
                    : runDetail.evalFixtureContext.canCreateFromRun
                      ? "Convert this completed run into a regression fixture from the same evidence view."
                      : "Eval fixtures can be created after the run completes or is cancelled."}
                </p>
                {runDetail.evalFixtureContext.fixtures.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {runDetail.evalFixtureContext.fixtures.map((fixture) => (
                      <span key={fixture.fixtureId} className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${
                        fixture.status === "ACTIVE"
                          ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
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
                    Replay current
                  </button>
                )}
                {canReplay(runDetail.run.status) && runDetail.run.agentVersionId && (
                  <button
                    type="button"
                    onClick={() => handleReplay(runDetail.run._id, "SAME_VERSION")}
                    disabled={action.isBusy(runDetail.run._id)}
                    className="px-3 py-2 rounded-[8px] border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 text-[12px] font-semibold hover:bg-indigo-500/15 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                    Replay version
                  </button>
                )}
                {canReplay(runDetail.run.status) && (
                  <button
                    type="button"
                    onClick={() => handleReflect(runDetail.run._id)}
                    disabled={action.isBusy(runDetail.run._id)}
                    className="px-3 py-2 rounded-[8px] border border-sky-500/20 bg-sky-500/10 text-sky-300 text-[12px] font-semibold hover:bg-sky-500/15 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                    Reflect
                  </button>
                )}
                {runDetail.evalFixtureContext.canCreateFromRun && (
                  <button
                    type="button"
                    onClick={() => handleCreateEvalFixture(runDetail.run._id)}
                    disabled={action.isBusy(runDetail.run._id)}
                    className="px-3 py-2 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[12px] font-semibold hover:bg-brand/15 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                    {runDetail.evalFixtureContext.activeCount > 0 ? "Update eval" : "Create eval"}
                  </button>
                )}
              </div>
            </div>

            {(runDetail.replayContext.sourceRun || runDetail.replayContext.replayRuns.length > 0) && (
              <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-3 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted">Replay context</h3>
                    <p className="text-[12px] text-secondary mt-1">
                      Compare replay lineage and status changes without leaving the run detail view.
                    </p>
                  </div>
                  {runDetail.run.replayMode && (
                    <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-300 self-start">
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
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStatusTone(runDetail.replayContext.sourceRun.status)}`}>
                          original {runDetail.replayContext.sourceRun.status.replace("_", " ")}
                        </span>
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStatusTone(runDetail.replayContext.comparison.replayStatus)}`}>
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
                                <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStepDiffTone(diff.changeType)}`}>
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
                                      <span className={`text-[10px] uppercase font-mono tracking-widest ${diff.source.status === "FAILED" ? "text-red-400" : "text-secondary"}`}>
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
                                      <span className={`text-[10px] uppercase font-mono tracking-widest ${diff.replay.status === "FAILED" ? "text-red-400" : "text-secondary"}`}>
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
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border self-start sm:self-auto ${getStatusTone(replay.status)}`}>
                          {replay.status.replace("_", " ")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Steps</div>
                <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.steps.length}</div>
              </div>
              <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Tool calls</div>
                <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.toolCalls.length}</div>
              </div>
              <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Approvals</div>
                <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.approvals.length}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted">Execution timeline</h3>
              {runDetail.timeline.length === 0 ? (
                <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
                  No durable steps were recorded for this run.
                </div>
              ) : (
                runDetail.timeline.map((step) => (
                  <div key={step.stepId} className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-secondary">
                          {step.stepIndex}. {step.kind.replace("_", " ")}
                        </span>
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStepTone(step.status)}`}>
                          {step.status}
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
                            <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">Input</div>
                            <pre className="text-[11px] text-secondary whitespace-pre-wrap overflow-x-auto">{step.inputPreview}</pre>
                          </div>
                        )}
                        {(step.outputPreview || step.errorPreview) && (
                          <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                            <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">
                              {step.errorPreview ? "Error" : "Output"}
                            </div>
                            <pre className={`text-[11px] whitespace-pre-wrap overflow-x-auto ${step.errorPreview ? "text-red-400" : "text-secondary"}`}>
                              {step.errorPreview || step.outputPreview}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 text-[11px] font-mono text-muted">
                      {step.modelId && <span>model: {step.modelId}</span>}
                      {step.providerKey && <span>provider: {step.providerKey}</span>}
                      {step.inputTokens !== undefined && <span>input: {step.inputTokens} tokens</span>}
                      {step.outputTokens !== undefined && <span>output: {step.outputTokens} tokens</span>}
                      {step.costGBP !== undefined && <span>cost: {formatCurrency(step.costGBP)}</span>}
                    </div>
                    {(step.linkedToolCalls.length > 0 || step.linkedApprovals.length > 0) && (
                      <div className="flex flex-wrap gap-2">
                        {step.linkedToolCalls.map((toolCall) => (
                          <span key={toolCall.toolCallId} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-300">
                            tool {toolCall.handlerMapping}: {toolCall.status.toLowerCase().replace("_", " ")}
                          </span>
                        ))}
                        {step.linkedApprovals.map((approval) => (
                          <span key={approval.approvalId} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
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
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${toolCall.status === "SUCCESS" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500" : toolCall.status === "FAILED" || toolCall.status === "DENIED" ? "border-red-500/20 bg-red-500/10 text-red-500" : "border-sky-500/20 bg-sky-500/10 text-sky-500"}`}>
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
                      <p className={`text-[12px] leading-relaxed line-clamp-4 ${toolCall.error ? "text-red-400" : "text-secondary"}`}>
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
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border w-fit ${approval.status === "APPROVED" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500" : approval.status === "REJECTED" ? "border-red-500/20 bg-red-500/10 text-red-500" : "border-sky-500/20 bg-sky-500/10 text-sky-500"}`}>
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
              <p className="text-[13px] text-secondary leading-relaxed line-clamp-3">{feedbackDraft.run.objective}</p>
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
              <button
                type="button"
                onClick={handleFeedbackSubmit}
                disabled={action.isBusy()}
                className="px-5 py-2.5 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {action.isBusy() ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                Save feedback
              </button>
            </div>
          </div>
        )}
      </SonaeModal>
    </>
  );
}
