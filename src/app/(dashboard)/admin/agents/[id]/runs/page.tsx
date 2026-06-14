"use client";

import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { Ban, Brain, Check, ClipboardCheck, Clock3, Lightbulb, Loader2, MessageSquare, MinusCircle, RotateCcw, ShieldCheck, SlidersHorizontal, ThumbsDown, ThumbsUp, Timer, Wrench, X, type LucideIcon } from "lucide-react";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

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
  const agentId = params.id as Id<"agents">;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [activeRunId, setActiveRunId] = useState<Id<"agentRuns"> | null>(null);
  const [activeCandidateId, setActiveCandidateId] = useState<Id<"agentMemoryCandidates"> | null>(null);
  const [modalState, setModalState] = useState<{ title: string; message: string } | null>(null);
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
  const generateImprovementSuggestions = useMutation(api.agentImprovementSuggestions.generateForRun);
  const decideImprovementSuggestion = useMutation(api.agentImprovementSuggestions.decideSuggestion);
  const analytics = useQuery(api.agentRuns.getAnalyticsForAgent, { agentId });
  const myFeedback = useQuery(api.agentRunFeedback.getMineForAgent, { agentId });
  const reflections = useQuery(api.agentRunReflections.getRecentForAgent, { agentId });
  const memoryCandidates = useQuery(api.agentMemoryCandidates.getRecentForAgent, { agentId });
  const evalFixtures = useQuery(api.agentEvalFixtures.getRecentForAgent, { agentId });
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

  const handleReplay = async (runId: Id<"agentRuns">) => {
    setActiveRunId(runId);
    try {
      const replay = await replayRun({ runId });
      setModalState({
        title: "Replay queued",
        message: `Created replay run ${replay.runId}. It will execute through the governed agent runtime.`,
      });
    } catch (error) {
      setModalState({
        title: "Replay blocked",
        message: error instanceof Error ? error.message : "The run could not be replayed.",
      });
    } finally {
      setActiveRunId(null);
    }
  };

  const handleCancel = async (runId: Id<"agentRuns">) => {
    setActiveRunId(runId);
    try {
      await cancelRun({ runId, reason: "Cancelled from the agent Runs dashboard" });
      setModalState({
        title: "Run cancelled",
        message: "Pending approvals and tool calls for this run were cancelled and audited.",
      });
    } catch (error) {
      setModalState({
        title: "Cancel blocked",
        message: error instanceof Error ? error.message : "The run could not be cancelled.",
      });
    } finally {
      setActiveRunId(null);
    }
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
    setActiveRunId(feedbackDraft.run._id);
    try {
      await upsertFeedback({
        runId: feedbackDraft.run._id,
        rating: feedbackDraft.rating,
        labels: feedbackDraft.labels,
        comment: feedbackDraft.comment,
      });
      setFeedbackDraft(null);
      setModalState({
        title: "Feedback saved",
        message: "This run feedback is now available for learning analytics and future improvement workflows.",
      });
    } catch (error) {
      setModalState({
        title: "Feedback blocked",
        message: error instanceof Error ? error.message : "The feedback could not be saved.",
      });
    } finally {
      setActiveRunId(null);
    }
  };

  const handleReflect = async (runId: Id<"agentRuns">) => {
    setActiveRunId(runId);
    try {
      await createReflection({ runId });
      setModalState({
        title: "Reflection generated",
        message: "The failure reflection now links the run trace to a structured category, evidence, and proposed next learning artifacts.",
      });
    } catch (error) {
      setModalState({
        title: "Reflection blocked",
        message: error instanceof Error ? error.message : "The reflection could not be generated.",
      });
    } finally {
      setActiveRunId(null);
    }
  };

  const handleGenerateMemoryCandidates = async (runId: Id<"agentRuns">) => {
    setActiveRunId(runId);
    try {
      const result = await generateMemoryCandidates({ runId, autoApplyLowRisk: false });
      setModalState({
        title: result.createdIds.length > 0 ? "Memory candidate created" : "No new candidate",
        message: result.createdIds.length > 0
          ? `Created ${result.createdIds.length} candidate memory item${result.createdIds.length === 1 ? "" : "s"} for review.`
          : "No new safe candidate memory could be generated from this run.",
      });
    } catch (error) {
      setModalState({
        title: "Memory candidate blocked",
        message: error instanceof Error ? error.message : "The candidate memory could not be generated.",
      });
    } finally {
      setActiveRunId(null);
    }
  };

  const handleCandidateDecision = async (candidateId: Id<"agentMemoryCandidates">, decision: "APPROVED" | "REJECTED") => {
    setActiveCandidateId(candidateId);
    try {
      await decideMemoryCandidate({
        candidateId,
        decision,
        ...(decision === "REJECTED" ? { rejectionReason: "Rejected from the agent Runs dashboard" } : {}),
      });
      setModalState({
        title: decision === "APPROVED" ? "Memory applied" : "Memory rejected",
        message: decision === "APPROVED"
          ? "The approved candidate has been stored as governed agent memory."
          : "The candidate was rejected and will not be used as agent memory.",
      });
    } catch (error) {
      setModalState({
        title: "Memory review blocked",
        message: error instanceof Error ? error.message : "The candidate memory could not be reviewed.",
      });
    } finally {
      setActiveCandidateId(null);
    }
  };

  const handleCreateEvalFixture = async (runId: Id<"agentRuns">) => {
    setActiveRunId(runId);
    try {
      await createEvalFixture({ runId });
      setModalState({
        title: "Eval fixture saved",
        message: "This run is now available as a regression fixture for future agent improvement checks.",
      });
    } catch (error) {
      setModalState({
        title: "Eval fixture blocked",
        message: error instanceof Error ? error.message : "The eval fixture could not be created.",
      });
    } finally {
      setActiveRunId(null);
    }
  };

  const handleGenerateSuggestions = async (runId: Id<"agentRuns">) => {
    setActiveRunId(runId);
    try {
      const result = await generateImprovementSuggestions({ runId });
      setModalState({
        title: result.createdIds.length > 0 ? "Suggestion created" : "No new suggestion",
        message: result.createdIds.length > 0
          ? `Created ${result.createdIds.length} config suggestion${result.createdIds.length === 1 ? "" : "s"} for review.`
          : "No new config suggestion could be generated from this run.",
      });
    } catch (error) {
      setModalState({
        title: "Suggestion blocked",
        message: error instanceof Error ? error.message : "The suggestion could not be generated.",
      });
    } finally {
      setActiveRunId(null);
    }
  };

  const handleSuggestionDecision = async (suggestionId: Id<"agentImprovementSuggestions">, decision: "APPROVED" | "REJECTED") => {
    setActiveRunId(null);
    try {
      await decideImprovementSuggestion({
        suggestionId,
        decision,
        apply: decision === "APPROVED",
        ...(decision === "REJECTED" ? { rejectionReason: "Rejected from the agent Runs dashboard" } : {}),
      });
      setModalState({
        title: decision === "APPROVED" ? "Suggestion applied" : "Suggestion rejected",
        message: decision === "APPROVED"
          ? "The approved suggestion was applied and a new agent version snapshot was recorded."
          : "The suggestion was rejected and no configuration was changed.",
      });
    } catch (error) {
      setModalState({
        title: "Suggestion review blocked",
        message: error instanceof Error ? error.message : "The suggestion could not be reviewed.",
      });
    }
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
                        <span key={suggestion._id} className="px-2 py-0.5 rounded-md border border-indigo-500/20 bg-indigo-500/10 text-indigo-500">
                          suggestion: {suggestion.type.toLowerCase().replaceAll("_", " ")}
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
                          disabled={activeCandidateId === candidate._id}
                          className="p-2 rounded-md bg-white/[0.04] hover:bg-emerald-500/10 text-secondary hover:text-emerald-400 border border-border-dim transition-all disabled:opacity-50"
                          title="Approve memory candidate"
                        >
                          {activeCandidateId === candidate._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCandidateDecision(candidate._id, "REJECTED")}
                          disabled={activeCandidateId === candidate._id}
                          className="p-2 rounded-md bg-white/[0.04] hover:bg-red-500/10 text-secondary hover:text-red-400 border border-border-dim transition-all disabled:opacity-50"
                          title="Reject memory candidate"
                        >
                          {activeCandidateId === candidate._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => openFeedback(run)}
                      disabled={activeRunId === run._id}
                      className="p-2 rounded-md bg-white/[0.04] hover:bg-emerald-500/10 text-secondary hover:text-emerald-400 border border-border-dim transition-all disabled:opacity-50"
                      title="Leave feedback"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    {canLearnFrom(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleGenerateMemoryCandidates(run._id)}
                        disabled={activeRunId === run._id}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-emerald-500/10 text-secondary hover:text-emerald-400 border border-border-dim transition-all disabled:opacity-50"
                        title="Generate memory candidate"
                      >
                        {activeRunId === run._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                      </button>
                    )}
                    {canLearnFrom(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleCreateEvalFixture(run._id)}
                        disabled={activeRunId === run._id}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-sky-500/10 text-secondary hover:text-sky-400 border border-border-dim transition-all disabled:opacity-50"
                        title="Create eval fixture"
                      >
                        {activeRunId === run._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                      </button>
                    )}
                    {canLearnFrom(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleGenerateSuggestions(run._id)}
                        disabled={activeRunId === run._id}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-indigo-500/10 text-secondary hover:text-indigo-400 border border-border-dim transition-all disabled:opacity-50"
                        title="Generate config suggestion"
                      >
                        {activeRunId === run._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <SlidersHorizontal className="w-4 h-4" />}
                      </button>
                    )}
                    {canReplay(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleReflect(run._id)}
                        disabled={activeRunId === run._id}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-sky-500/10 text-secondary hover:text-sky-400 border border-border-dim transition-all disabled:opacity-50"
                        title="Generate reflection"
                      >
                        {activeRunId === run._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                      </button>
                    )}
                    {canReplay(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleReplay(run._id)}
                        disabled={activeRunId === run._id}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-brand/10 text-secondary hover:text-brand border border-border-dim transition-all disabled:opacity-50"
                        title="Replay run"
                      >
                        {activeRunId === run._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      </button>
                    )}
                    {canCancel(run.status) && (
                      <button
                        type="button"
                        onClick={() => handleCancel(run._id)}
                        disabled={activeRunId === run._id}
                        className="p-2 rounded-md bg-white/[0.04] hover:bg-amber-500/10 text-secondary hover:text-amber-400 border border-border-dim transition-all disabled:opacity-50"
                        title="Cancel run"
                      >
                        {activeRunId === run._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
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
        isOpen={!!modalState}
        onClose={() => setModalState(null)}
        title={modalState?.title || ""}
        size="sm"
      >
        <div className="flex flex-col gap-6">
          <p className="text-[14px] text-secondary leading-relaxed">{modalState?.message}</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setModalState(null)}
              className="px-5 py-2.5 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 transition-all"
            >
              Acknowledge
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={!!feedbackDraft}
        onClose={() => !activeRunId && setFeedbackDraft(null)}
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
                disabled={!!activeRunId}
                className="px-5 py-2.5 rounded-[8px] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFeedbackSubmit}
                disabled={!!activeRunId}
                className="px-5 py-2.5 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {activeRunId ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                Save feedback
              </button>
            </div>
          </div>
        )}
      </SonaeModal>
    </>
  );
}
